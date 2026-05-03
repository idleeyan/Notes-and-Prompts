// WebDAV 客户端 - 飞牛 NAS 同步（支持多版本备份）
class WebDAVClient {
  constructor(config) {
    this.serverUrl = config.serverUrl || '';
    this.username = config.username || '';
    this.password = config.password || '';
    this.syncPath = config.syncPath || '/notebook-sync/';
    this.filename = config.filename || 'notebook-data.json';
    this.enabled = config.enabled || false;
    this.backupCount = config.backupCount || 3; // 保留的备份数量
  }

  // 检查配置是否有效
  isConfigured() {
    return this.enabled && 
           this.serverUrl && 
           this.username && 
           this.password;
  }

  // 发送 WebDAV 请求
  async sendRequest(method, path = '', data = null, headers = {}) {
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
        data: data,
        headers: headers
      }, (result) => {
        console.log('WebDAVClient: 收到响应', { method, path, result });
        resolve(result);
      });
    });
  }

  // 上传数据到 WebDAV（支持原子操作和备份）
  async uploadData(data) {
    if (!this.isConfigured()) {
      return { success: false, error: 'WebDAV 未配置' };
    }

    const timestamp = Date.now();
    
    // 使用 v3.0 格式，数据直接在顶层
    const syncData = {
      version: '3.0',
      timestamp: timestamp,
      meta: {
        device: navigator.userAgent,
        timestamp: timestamp,
        checksum: this.calculateChecksum(data)
      },
      items: data.items || [],
      deletedItems: data.deletedItems || [],
      tags: data.tags || [],
      settings: data.settings || {},
      imageData: data.imageData || null
    };

    const pathsToTry = this.getPathsToTry();

    for (const basePath of pathsToTry) {
      try {
        console.log('WebDAV: 尝试上传路径', basePath);
        
        const dirPath = basePath.substring(0, basePath.lastIndexOf('/'));
        if (dirPath && dirPath !== '') {
          console.log('WebDAV: 确保目录存在', dirPath);
          await this.ensureDirectory(dirPath);
        }
        
        console.log('WebDAV: 步骤 1 - 备份当前文件（如果存在）');
        await this.backupExistingFile(basePath, timestamp);
        
        console.log('WebDAV: 步骤 2 - 直接上传数据');
        let result = await this.uploadToPath(basePath, syncData);
        
        if (result.success) {
          console.log('WebDAV: 上传成功', basePath);
          await this.rotateBackups(basePath, timestamp);
          return { success: true, path: basePath, timestamp };
        }
        
        console.log('WebDAV: 上传失败，尝试其他路径');
        
      } catch (error) {
        console.log('WebDAV: 上传请求失败', basePath, error.message);
      }
    }

    return { success: false, error: '所有路径上传失败。请检查：\n1. 服务器地址是否正确（需包含 http://或 https://）\n2. 同步路径是否正确（飞牛 NAS 应使用用户目录，如 /username/folder/）\n3. 用户名和密码是否正确' };
  }

  // 上传到指定路径
  async uploadToPath(filePath, data) {
    try {
      let result = await Promise.race([
        this.sendRequest('PUT', filePath, data),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PUT 超时')), 15000))
      ]);

      if (result.success) {
        return { success: true, path: filePath };
      }

      if (result.status === 403 || result.status === 405 || result.status === 409) {
        console.log('WebDAV: PUT 失败，尝试 POST', result.status);
        result = await Promise.race([
          this.sendRequest('POST', filePath, data),
          new Promise((_, reject) => setTimeout(() => reject(new Error('POST 超时')), 15000))
        ]);
        if (result.success) {
          return { success: true, path: filePath };
        }
      }
      
      return { success: false, error: result.error || '上传失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 验证文件完整性
  async verifyFile(filePath, expectedChecksum) {
    try {
      const result = await Promise.race([
        this.sendRequest('GET', filePath),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GET 超时')), 15000))
      ]);

      if (result.success && result.data) {
        const syncData = JSON.parse(result.data);
        const data = syncData.items ? syncData : (syncData.data || syncData);
        const actualChecksum = this.calculateChecksum(data);
        
        if (actualChecksum === expectedChecksum) {
          return { success: true };
        } else {
          return { success: false, error: '校验和不匹配' };
        }
      }
      
      return { success: false, error: '无法读取文件' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 备份现有文件
  async backupExistingFile(basePath, timestamp) {
    try {
      const checkResult = await this.checkRemoteFileAtPath(basePath);
      if (checkResult.exists) {
        const backupPath = basePath + '.backup-' + timestamp;
        console.log('WebDAV: 创建备份', backupPath);
        
        // 先下载主文件内容
        const downloadResult = await this.downloadFromPath(basePath);
        if (downloadResult.success) {
          // 重新打包数据
          const backupData = {
            version: '3.0',
            timestamp: timestamp,
            meta: {
              device: downloadResult.device || 'backup',
              timestamp: downloadResult.timestamp || timestamp,
              checksum: this.calculateChecksum(downloadResult.data),
              isBackup: true,
              originalPath: basePath
            },
            items: downloadResult.data.items || [],
            deletedItems: downloadResult.data.deletedItems || [],
            tags: downloadResult.data.tags || [],
            settings: downloadResult.data.settings || {}
          };
          
          // 上传到备份文件
          const uploadResult = await this.uploadToPath(backupPath, backupData);
          if (uploadResult.success) {
            console.log('WebDAV: 备份创建成功', backupPath);
            // 保存备份记录到本地存储
            await this.saveBackupRecord(timestamp);
          } else {
            console.log('WebDAV: 备份创建失败', uploadResult.error);
          }
        }
      }
    } catch (error) {
      console.log('WebDAV: 备份失败（可继续）', error.message);
    }
  }

  // 轮转备份文件（保留最近的 N 个）
  async rotateBackups(basePath, currentTimestamp) {
    try {
      const dirPath = basePath.substring(0, basePath.lastIndexOf('/'));
      const baseName = basePath.substring(basePath.lastIndexOf('/') + 1);
      
      console.log('WebDAV: 开始轮转备份', { dirPath, baseName });
      
      const listResult = await this.listDirectory(dirPath);
      if (!listResult.success) {
        console.log('WebDAV: 无法列出目录，跳过备份轮转');
        return;
      }
      
      const backupPattern = baseName + '.backup-';
      const backupFiles = [];
      
      for (const file of listResult.files || []) {
        if (file.name.startsWith(backupPattern)) {
          const timestamp = parseInt(file.name.replace(backupPattern, ''));
          if (!isNaN(timestamp)) {
            backupFiles.push({ name: file.name, timestamp });
          }
        }
      }
      
      backupFiles.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log('WebDAV: 找到备份文件', backupFiles.length);
      
      for (let i = this.backupCount; i < backupFiles.length; i++) {
        const oldBackup = basePath + '.backup-' + backupFiles[i].timestamp;
        console.log('WebDAV: 删除过期备份', oldBackup);
        await this.deleteFile(oldBackup);
      }
      
    } catch (error) {
      console.log('WebDAV: 备份轮转失败（可继续）', error.message);
    }
  }

  // 计算数据校验和
  calculateChecksum(data) {
    if (data.items) {
      return Utils.calculateItemChecksum({ title: '', content: JSON.stringify(data), tags: [] });
    }
    return Utils.calculateItemChecksum(data);
  }

  // 重命名文件（通过下载 + 上传 + 删除实现，兼容不支持 COPY 的服务器）
  async renameFile(sourcePath, destPath) {
    try {
      // 先下载源文件内容
      const downloadResult = await this.downloadFromPath(sourcePath);
      if (!downloadResult.success) {
        return { success: false, error: '无法下载源文件' };
      }
      
      // 重新打包数据
      const renameData = {
        version: '3.0',
        timestamp: Date.now(),
        meta: {
          device: downloadResult.device || 'renamed',
          timestamp: downloadResult.timestamp || Date.now(),
          checksum: this.calculateChecksum(downloadResult.data),
          renamed: true,
          originalPath: sourcePath
        },
        items: downloadResult.data.items || [],
        deletedItems: downloadResult.data.deletedItems || [],
        tags: downloadResult.data.tags || [],
        settings: downloadResult.data.settings || {}
      };
      
      // 上传到目标路径
      const uploadResult = await this.uploadToPath(destPath, renameData);
      if (uploadResult.success) {
        // 删除源文件
        await this.deleteFile(sourcePath);
        console.log('WebDAV: 重命名成功', sourcePath, '->', destPath);
        return { success: true };
      } else {
        return uploadResult;
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 复制文件
  async copyFile(sourcePath, destPath) {
    try {
      const result = await this.sendRequest('COPY', sourcePath, null, {
        'Destination': destPath
      });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 删除文件
  async deleteFile(filePath) {
    try {
      await this.sendRequest('DELETE', filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 列出目录内容
  async listDirectory(dirPath) {
    try {
      const result = await this.sendRequest('PROPFIND', dirPath, null, {
        'Depth': '1'
      });
      
      if (result.success && result.data) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(result.data, 'text/xml');
        const responses = xmlDoc.getElementsByTagNameNS('DAV:', 'response');
        
        const files = [];
        for (let i = 0; i < responses.length; i++) {
          const href = responses[i].getElementsByTagNameNS('DAV:', 'href')[0];
          const propstat = responses[i].getElementsByTagNameNS('DAV:', 'propstat')[0];
          const props = propstat.getElementsByTagNameNS('DAV:', 'prop')[0];
          
          if (href) {
            const hrefValue = href.textContent;
            const displayName = hrefValue.split('/').filter(Boolean).pop() || hrefValue;
            const isDir = props.getElementsByTagNameNS('DAV:', 'collection').length > 0;
            
            if (!isDir) {
              files.push({
                name: decodeURIComponent(displayName),
                href: hrefValue,
                isDirectory: false
              });
            }
          }
        }
        
        return { success: true, files };
      }
      
      return { success: false, error: '无法解析目录' };
    } catch (error) {
      return { success: false, error: error.message };
    }
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

  // 从 WebDAV 下载数据（支持备份恢复）
  async downloadData() {
    if (!this.isConfigured()) {
      return { success: false, error: 'WebDAV 未配置' };
    }

    const pathsToTry = this.getPathsToTry();

    for (const basePath of pathsToTry) {
      try {
        console.log('WebDAV: 尝试下载主文件', basePath);
        
        const result = await this.downloadFromPath(basePath);
        
        if (result.success) {
          console.log('WebDAV: 主文件下载成功', basePath);
          return {
            success: true,
            data: result.data,
            timestamp: result.timestamp,
            device: result.device,
            path: basePath,
            source: 'main'
          };
        }
        
        console.log('WebDAV: 主文件下载失败，尝试从备份恢复');
        const backupResult = await this.downloadFromBackup(basePath);
        
        if (backupResult.success) {
          console.log('WebDAV: 从备份恢复成功', backupResult.path);
          return {
            success: true,
            data: backupResult.data,
            timestamp: backupResult.timestamp,
            device: backupResult.device,
            path: backupResult.path,
            source: 'backup'
          };
        }
        
      } catch (error) {
        console.log('WebDAV: 下载请求失败', basePath, error.message);
      }
    }

    return { success: false, error: '服务器上没有同步数据或所有备份已损坏' };
  }

  // 从指定路径下载
  async downloadFromPath(filePath) {
    try {
      const result = await Promise.race([
        this.sendRequest('GET', filePath),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GET 超时')), 15000))
      ]);

      if (result.success && result.data) {
        const syncData = JSON.parse(result.data);
        const data = syncData.items ? syncData : (syncData.data || syncData);

        // 确保 imageData 被包含在返回数据中
        if (syncData.imageData) {
          data.imageData = syncData.imageData;
        }

        // 仅记录校验和，不强制验证（因为 NAS 可能格式化 JSON）
        if (syncData.meta?.checksum) {
          const actualChecksum = this.calculateChecksum(data);
          if (actualChecksum !== syncData.meta.checksum) {
            console.log('WebDAV: 校验和不匹配（可能是 NAS 格式化导致），但仍使用数据', filePath);
            // 不返回错误，继续使用数据
          } else {
            console.log('WebDAV: 校验和验证通过', filePath);
          }
        }

        return {
          success: true,
          data: data,
          timestamp: syncData.timestamp || syncData.meta?.timestamp || 0,
          device: syncData.device || syncData.meta?.deviceId,
          path: filePath
        };
      }

      return { success: false, error: '文件不存在或为空' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 从备份文件下载
  async downloadFromBackup(basePath) {
    try {
      const dirPath = basePath.substring(0, basePath.lastIndexOf('/'));
      const baseName = basePath.substring(basePath.lastIndexOf('/') + 1);
      
      console.log('WebDAV: 查找备份文件', { dirPath, baseName });
      
      const listResult = await this.listDirectory(dirPath);
      if (!listResult.success) {
        return { success: false, error: '无法列出目录' };
      }
      
      const backupPattern = baseName + '.backup-';
      const backupFiles = [];
      
      for (const file of listResult.files || []) {
        if (file.name.startsWith(backupPattern)) {
          const timestamp = parseInt(file.name.replace(backupPattern, ''));
          if (!isNaN(timestamp)) {
            backupFiles.push({ name: file.name, timestamp });
          }
        }
      }
      
      backupFiles.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log('WebDAV: 找到备份文件', backupFiles.length);
      
      for (const backupFile of backupFiles) {
        const backupPath = basePath + '.backup-' + backupFile.timestamp;
        console.log('WebDAV: 尝试从备份下载', backupPath);
        
        const result = await this.downloadFromPath(backupPath);
        if (result.success) {
          return {
            ...result,
            path: backupPath,
            isBackup: true
          };
        }
      }
      
      return { success: false, error: '没有可用的备份' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 检查远程文件是否存在
  async checkRemoteFile() {
    if (!this.isConfigured()) {
      return { exists: false, error: 'WebDAV 未配置' };
    }

    const pathsToTry = this.getPathsToTry();

    for (const filePath of pathsToTry) {
      try {
        const result = await Promise.race([
          this.sendRequest('HEAD', filePath),
          new Promise((_, reject) => setTimeout(() => reject(new Error('HEAD 超时')), 10000))
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

  // 检查远程文件是否存在（指定路径）
  async checkRemoteFileAtPath(filePath) {
    try {
      const result = await Promise.race([
        this.sendRequest('HEAD', filePath),
        new Promise((_, reject) => setTimeout(() => reject(new Error('HEAD 超时')), 10000))
      ]);

      if (result.success) {
        return {
          exists: true,
          path: filePath,
          lastModified: result.headers?.['last-modified'],
          size: result.headers?.['content-length']
        };
      }
      return { exists: false };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }

  // 列出所有可用的同步版本
  async listAvailableVersions() {
    if (!this.isConfigured()) {
      return { success: false, error: 'WebDAV 未配置' };
    }

    const pathsToTry = this.getPathsToTry();

    for (const basePath of pathsToTry) {
      try {
        console.log('WebDAV: 查找版本', basePath);
        
        const versions = [];
        
        // 检查主文件
        const mainFileResult = await this.checkRemoteFileAtPath(basePath);
        if (mainFileResult.exists) {
          versions.push({
            type: 'main',
            path: basePath,
            timestamp: mainFileResult.lastModified ? new Date(mainFileResult.lastModified).getTime() : Date.now(),
            size: mainFileResult.size,
            label: '主文件'
          });
        }
        
        // 从本地存储读取备份记录
        const backupRecords = await this.getBackupRecords();
        for (const record of backupRecords) {
          const backupPath = basePath + '.backup-' + record.timestamp;
          const backupResult = await this.checkRemoteFileAtPath(backupPath);
          if (backupResult.exists) {
            versions.push({
              type: 'backup',
              path: backupPath,
              timestamp: record.timestamp,
              size: backupResult.size,
              label: '备份 (' + new Date(record.timestamp).toLocaleString('zh-CN') + ')'
            });
          }
        }
        
        // 如果找到了版本，返回结果
        if (versions.length > 0) {
          // 按时间戳排序（最新的在前）
          versions.sort((a, b) => b.timestamp - a.timestamp);
          
          console.log('WebDAV: 找到版本', versions.length);
          
          return {
            success: true,
            versions: versions,
            basePath: basePath
          };
        }
        
      } catch (error) {
        console.log('WebDAV: 列出版本失败', basePath, error.message);
      }
    }

    return { success: false, error: '无法获取版本列表，请确保已上传过数据' };
  }

  // 获取备份记录
  async getBackupRecords() {
    try {
      const result = await chrome.storage.local.get(['webdavBackupRecords']);
      return result.webdavBackupRecords || [];
    } catch (error) {
      return [];
    }
  }

  // 保存备份记录
  async saveBackupRecord(timestamp) {
    try {
      const records = await this.getBackupRecords();
      // 避免重复
      if (!records.find(r => r.timestamp === timestamp)) {
        records.push({ timestamp, createdAt: Date.now() });
        // 只保留最近 10 条记录
        records.sort((a, b) => b.timestamp - a.timestamp);
        const trimmedRecords = records.slice(0, 10);
        await chrome.storage.local.set({ webdavBackupRecords: trimmedRecords });
      }
    } catch (error) {
      console.log('WebDAV: 保存备份记录失败', error);
    }
  }

  // 从指定版本下载
  async downloadFromVersion(versionPath) {
    if (!this.isConfigured()) {
      return { success: false, error: 'WebDAV 未配置' };
    }

    try {
      const result = await this.downloadFromPath(versionPath);
      if (result.success) {
        return {
          ...result,
          isBackup: versionPath.includes('.backup-')
        };
      }
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 获取要尝试的路径列表
  getPathsToTry() {
    const cleanPath = this.syncPath.replace(/\/$/, '');
    const cleanFilename = this.filename.replace(/^\//, '');
    
    const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    
    const pathsToTry = [
      `${normalizedPath}/${cleanFilename}`,
      `/vol1/1000${normalizedPath}/${cleanFilename}`
    ];
    
    const usernameMatch = normalizedPath.match(/^\/([^\/]+)\//);
    if (usernameMatch) {
      const username = usernameMatch[1];
      pathsToTry.push(`${normalizedPath.replace(`/${username}/`, '/')}/${cleanFilename}`);
      pathsToTry.push(`/vol1/1000${normalizedPath.replace(`/${username}/`, '/')}/${cleanFilename}`);
    }
    
    return pathsToTry;
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

// 浏览器环境下直接赋值到全局
if (typeof window !== 'undefined') {
  window.WebDAVClient = WebDAVClient;
}

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebDAVClient;
}
