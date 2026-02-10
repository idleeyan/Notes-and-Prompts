// WebDAV客户端 - 飞牛NAS同步
class WebDAVClient {
  constructor(config) {
    this.serverUrl = config.serverUrl || '';
    this.username = config.username || '';
    this.password = config.password || '';
    this.syncPath = config.syncPath || '/notebook-sync/';
    this.filename = config.filename || 'notebook-data.json';
    this.enabled = config.enabled || false;
  }

  // 检查配置是否有效
  isConfigured() {
    return this.enabled && 
           this.serverUrl && 
           this.username && 
           this.password;
  }

  // 发送WebDAV请求
  async sendRequest(method, path = '', data = null) {
    console.log('WebDAVClient: 发送请求', { method, path, serverUrl: this.serverUrl });
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'webdav',
        config: {
          serverUrl: this.serverUrl,
          username: this.username,
          password: this.password
        },
        method: method,
        path: path,
        data: data
      }, (result) => {
        console.log('WebDAVClient: 收到响应', { method, path, result });
        resolve(result);
      });
    });
  }

  // 上传数据到WebDAV
  async uploadData(data) {
    if (!this.isConfigured()) {
      return { success: false, error: 'WebDAV未配置' };
    }

    // 使用 v3.0 格式，数据直接在顶层
    const syncData = {
      version: '3.0',
      timestamp: Date.now(),
      meta: {
        device: navigator.userAgent,
        timestamp: Date.now()
      },
      items: data.items || [],
      deletedItems: data.deletedItems || [],
      deletedCategories: data.deletedCategories || [],
      tags: data.tags || [],
      categories: data.categories || [],
      settings: data.settings || {}
    };

    // 尝试多种路径格式（飞牛NAS兼容）
    const pathsToTry = this.getPathsToTry();

    for (const filePath of pathsToTry) {
      try {
        console.log('WebDAV: 尝试上传路径', filePath);
        
        // 先确保目录存在
        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dirPath && dirPath !== '') {
          console.log('WebDAV: 确保目录存在', dirPath);
          await this.ensureDirectory(dirPath);
        }
        
        // 先尝试PUT
        let result = await Promise.race([
          this.sendRequest('PUT', filePath, syncData),
          new Promise((_, reject) => setTimeout(() => reject(new Error('PUT超时')), 15000))
        ]);

        console.log('WebDAV: PUT结果', result);

        if (result.success) {
          console.log('WebDAV: 上传成功', filePath);
          return { success: true, path: filePath, timestamp: syncData.timestamp };
        }

        // PUT失败，尝试POST
        if (result.status === 403 || result.status === 405 || result.status === 409) {
          console.log('WebDAV: PUT失败，尝试POST', result.status);
          result = await Promise.race([
            this.sendRequest('POST', filePath, syncData),
            new Promise((_, reject) => setTimeout(() => reject(new Error('POST超时')), 15000))
          ]);
          console.log('WebDAV: POST结果', result);
          if (result.success) {
            console.log('WebDAV: POST上传成功', filePath);
            return { success: true, path: filePath, timestamp: syncData.timestamp };
          }
        }
      } catch (error) {
        console.log('WebDAV: 上传请求失败', filePath, error.message);
      }
    }

    return { success: false, error: '所有路径上传失败' };
  }

  // 确保目录存在（尝试创建目录）
  async ensureDirectory(dirPath) {
    try {
      // 尝试创建目录（带超时）
      const result = await Promise.race([
        this.sendRequest('MKCOL', dirPath),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MKCOL超时')), 5000))
      ]);
      console.log('WebDAV: 创建目录结果', dirPath, result);
      // 405 = Method Not Allowed, 409 = Conflict（目录已存在）
      return result.success || result.status === 405 || result.status === 409;
    } catch (error) {
      console.log('WebDAV: 创建目录失败（可能已存在）', dirPath, error.message);
      return true; // 假设目录已存在，继续尝试上传
    }
  }

  // 从WebDAV下载数据
  async downloadData() {
    if (!this.isConfigured()) {
      return { success: false, error: 'WebDAV未配置' };
    }

    const pathsToTry = this.getPathsToTry();

    for (const filePath of pathsToTry) {
      try {
        console.log('WebDAV: 尝试下载路径', filePath);
        
        const result = await Promise.race([
          this.sendRequest('GET', filePath),
          new Promise((_, reject) => setTimeout(() => reject(new Error('GET超时')), 15000))
        ]);

        if (result.success && result.data) {
          console.log('WebDAV: 下载成功', filePath);
          const syncData = JSON.parse(result.data);
          
          // 兼容两种数据格式：v3.0 直接在顶层，旧版在 data 字段中
          const data = syncData.items ? syncData : (syncData.data || syncData);
          
          return {
            success: true,
            data: data,
            timestamp: syncData.timestamp || syncData.meta?.timestamp || 0,
            device: syncData.device || syncData.meta?.deviceId,
            path: filePath
          };
        }
      } catch (error) {
        console.log('WebDAV: 下载请求失败', filePath, error.message);
      }
    }

    return { success: false, error: '服务器上没有同步数据' };
  }

  // 检查远程文件是否存在
  async checkRemoteFile() {
    if (!this.isConfigured()) {
      return { exists: false, error: 'WebDAV未配置' };
    }

    const pathsToTry = this.getPathsToTry();

    for (const filePath of pathsToTry) {
      try {
        const result = await Promise.race([
          this.sendRequest('HEAD', filePath),
          new Promise((_, reject) => setTimeout(() => reject(new Error('HEAD超时')), 10000))
        ]);

        if (result.success) {
          return {
            exists: true,
            path: filePath,
            lastModified: result.headers?.['last-modified'],
            size: result.headers?.['content-length']
          };
        }
      } catch (error) {
        console.log('WebDAV: 检查文件失败', filePath, error.message);
      }
    }

    return { exists: false };
  }

  // 获取要尝试的路径列表
  getPathsToTry() {
    const cleanPath = this.syncPath.replace(/\/$/, '');
    const cleanFilename = this.filename.replace(/^\//, '');
    
    // 标准化路径格式
    const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    
    return [`${normalizedPath}/${cleanFilename}`];
  }

  // 测试连接
  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, error: '请填写完整的WebDAV配置' };
    }

    try {
      // 直接尝试上传一个测试文件来验证连接
      console.log('WebDAV: 测试连接，尝试上传测试文件...');
      const testResult = await this.uploadData({ test: true, timestamp: Date.now() });
      
      if (testResult.success) {
        return { 
          success: true, 
          message: '连接成功！已创建同步文件',
          path: testResult.path 
        };
      }

      return { 
        success: false, 
        error: `无法写入文件: ${testResult.error || '未知错误'}。请检查目录权限和路径是否正确。` 
      };
    } catch (error) {
      console.error('WebDAV: 测试连接失败', error);
      if (error.message && error.message.includes('超时')) {
        return { 
          success: false, 
          error: '连接超时！请检查：\n1. 服务器地址和端口是否正确\n2. 飞牛NAS是否已开启WebDAV服务\n3. 网络连接是否正常' 
        };
      }
      return { success: false, error: '连接失败: ' + error.message };
    }
  }

  // 同步数据（上传本地数据）
  async syncUpload(data) {
    const result = await this.uploadData(data);
    if (result.success) {
      return {
        success: true,
        message: '数据已上传到WebDAV',
        timestamp: result.timestamp,
        path: result.path
      };
    }
    return result;
  }

  // 同步数据（下载远程数据）
  async syncDownload() {
    const result = await this.downloadData();
    if (result.success) {
      return {
        success: true,
        message: '数据已从WebDAV下载',
        data: result.data,
        timestamp: result.timestamp,
        device: result.device,
        path: result.path
      };
    }
    return result;
  }

  // 合并同步（下载并合并数据）
  async syncMerge(localData) {
    // 先下载远程数据
    const downloadResult = await this.downloadData();
    
    if (!downloadResult.success) {
      // 远程没有数据，上传本地数据
      console.log('WebDAV: 远程无数据，上传本地数据');
      return await this.syncUpload(localData);
    }

    // 合并数据（根据时间戳）
    const remoteData = downloadResult.data;
    const remoteTime = downloadResult.timestamp;
    const localTime = localData.lastSyncTime || 0;

    if (remoteTime > localTime) {
      // 远程数据更新，使用远程数据
      console.log('WebDAV: 远程数据更新，使用远程数据');
      return {
        success: true,
        message: '已下载远程数据（远程版本更新）',
        data: remoteData,
        useRemote: true,
        remoteTimestamp: remoteTime,
        localTimestamp: localTime
      };
    } else if (localTime > remoteTime) {
      // 本地数据更新，上传本地数据
      console.log('WebDAV: 本地数据更新，上传本地数据');
      return await this.syncUpload(localData);
    } else {
      // 数据相同，无需同步
      return {
        success: true,
        message: '数据已是最新，无需同步',
        noChange: true
      };
    }
  }
}

// 导出WebDAV客户端
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebDAVClient;
}
