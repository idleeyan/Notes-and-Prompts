// 同步管理器 - 处理WebDAV自动同步
class SyncManager {
  constructor() {
    this.webdavClient = null;
    this.syncInterval = null;
    this.lastSyncTime = 0;
    this.isSyncing = false;
    this.syncConfig = {
      enabled: false,
      autoSync: true,        // 自动同步开关
      syncOnChange: true,    // 数据变更时同步
      syncInterval: 5,       // 定时同步间隔（分钟）
      conflictResolution: 'newest' // 冲突解决策略: newest, local, remote
    };
    this.init();
  }

  async init() {
    await this.loadConfig();
    this.setupStorageListener();
    this.startAutoSync();
    console.log('同步管理器: 初始化完成', this.syncConfig);
  }

  // 加载同步配置
  async loadConfig() {
    const result = await chrome.storage.local.get(['syncConfig', 'settings', 'webdavConfig']);
    if (result.syncConfig) {
      this.syncConfig = { ...this.syncConfig, ...result.syncConfig };
    }
    
    // 优先使用独立的 webdavConfig，如果不存在则回退到 settings.webdav
    const webdavConfig = result.webdavConfig || result.settings?.webdav;
    if (webdavConfig) {
      this.webdavClient = new WebDAVClient(webdavConfig);
      console.log('同步管理器: WebDAV配置已加载，来源:', result.webdavConfig ? 'webdavConfig' : 'settings.webdav');
    }
  }

  // 保存同步配置
  async saveConfig() {
    await chrome.storage.local.set({ syncConfig: this.syncConfig });
  }

  // 更新WebDAV客户端
  updateWebDAVClient(webdavConfig) {
    this.webdavClient = new WebDAVClient(webdavConfig);
    console.log('同步管理器: WebDAV客户端已更新');
  }

  // 设置存储监听（检测数据变更）
  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      
      // 检测items变更（笔记/提示词数据变更）
      if (changes.items && this.syncConfig.enabled && this.syncConfig.syncOnChange) {
        console.log('同步管理器: 检测到数据变更，触发自动同步');
        this.debouncedSync();
      }
      
      // 检测webdavConfig变更（优先）
      if (changes.webdavConfig?.newValue) {
        console.log('同步管理器: 检测到WebDAV配置变更');
        this.updateWebDAVClient(changes.webdavConfig.newValue);
      }
      // 兼容：检测settings.webdav变更
      else if (changes.settings?.newValue?.webdav) {
        console.log('同步管理器: 检测到settings.webdav配置变更');
        this.updateWebDAVClient(changes.settings.newValue.webdav);
      }
    });
  }

  // 防抖同步（避免频繁操作导致多次同步）
  debouncedSync() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.syncToRemote();
    }, 3000); // 3秒后同步
  }

  // 启动自动同步定时器
  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (!this.syncConfig.enabled || !this.syncConfig.autoSync) {
      console.log('同步管理器: 自动同步未启用');
      return;
    }

    const intervalMs = this.syncConfig.syncInterval * 60 * 1000;
    this.syncInterval = setInterval(() => {
      console.log('同步管理器: 定时同步触发');
      this.syncToRemote();
    }, intervalMs);

    console.log(`同步管理器: 自动同步已启动，间隔 ${this.syncConfig.syncInterval} 分钟`);
  }

  // 停止自动同步
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('同步管理器: 自动同步已停止');
  }

  // 同步到远程（上传）
  async syncToRemote() {
    if (this.isSyncing) {
      console.log('同步管理器: 同步正在进行中，跳过');
      return { success: false, error: '同步正在进行中' };
    }

    if (!this.webdavClient || !this.webdavClient.isConfigured()) {
      console.log('同步管理器: WebDAV未配置');
      return { success: false, error: 'WebDAV未配置' };
    }

    this.isSyncing = true;
    this.notifySyncStatus('syncing', '正在同步到服务器...');

    try {
      // 获取当前数据
      const data = await this.getLocalData();
      
      // 上传数据
      const result = await this.webdavClient.syncUpload(data);
      
      if (result.success) {
        this.lastSyncTime = Date.now();
        await this.saveLastSyncTime();
        this.notifySyncStatus('success', '同步完成');
        console.log('同步管理器: 同步成功', result);
      } else {
        this.notifySyncStatus('error', '同步失败: ' + result.error);
        console.error('同步管理器: 同步失败', result);
      }
      
      return result;
    } catch (error) {
      this.notifySyncStatus('error', '同步错误: ' + error.message);
      console.error('同步管理器: 同步错误', error);
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  // 从远程同步（下载）
  async syncFromRemote() {
    if (this.isSyncing) {
      return { success: false, error: '同步正在进行中' };
    }

    if (!this.webdavClient || !this.webdavClient.isConfigured()) {
      return { success: false, error: 'WebDAV未配置' };
    }

    this.isSyncing = true;
    this.notifySyncStatus('syncing', '正在从服务器同步...');

    try {
      const result = await this.webdavClient.syncDownload();
      
      if (result.success) {
        // 处理冲突
        const mergeResult = await this.mergeData(result.data, result.timestamp);
        
        if (mergeResult.success) {
          this.lastSyncTime = Date.now();
          await this.saveLastSyncTime();
          this.notifySyncStatus('success', '下载完成');
        }
        
        return mergeResult;
      } else {
        this.notifySyncStatus('error', '下载失败: ' + result.error);
        return result;
      }
    } catch (error) {
      this.notifySyncStatus('error', '下载错误: ' + error.message);
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  // 双向同步（先下载再上传，解决冲突）
  async bidirectionalSync() {
    if (this.isSyncing) {
      return { success: false, error: '同步正在进行中' };
    }

    this.isSyncing = true;
    this.notifySyncStatus('syncing', '正在进行双向同步...');

    try {
      // 第一步：下载远程数据
      const downloadResult = await this.webdavClient.syncDownload();
      
      if (downloadResult.success) {
        // 合并数据
        const mergeResult = await this.mergeData(downloadResult.data, downloadResult.timestamp);
        
        if (mergeResult.success && mergeResult.hasChanges) {
          // 有变更，上传合并后的数据
          const data = await this.getLocalData();
          const uploadResult = await this.webdavClient.syncUpload(data);
          
          if (uploadResult.success) {
            this.lastSyncTime = Date.now();
            await this.saveLastSyncTime();
            this.notifySyncStatus('success', '双向同步完成');
            return { success: true, message: '双向同步完成', hasChanges: true };
          }
        } else if (mergeResult.success && !mergeResult.hasChanges) {
          // 本地数据更新，需要上传
          const data = await this.getLocalData();
          const uploadResult = await this.webdavClient.syncUpload(data);
          
          if (uploadResult.success) {
            this.lastSyncTime = Date.now();
            await this.saveLastSyncTime();
            this.notifySyncStatus('success', '本地数据已上传');
            return { success: true, message: '本地数据已上传' };
          }
        }
      } else {
        // 远程没有数据，直接上传本地数据
        const data = await this.getLocalData();
        const uploadResult = await this.webdavClient.syncUpload(data);
        
        if (uploadResult.success) {
          this.lastSyncTime = Date.now();
          await this.saveLastSyncTime();
          this.notifySyncStatus('success', '初始同步完成');
          return { success: true, message: '初始同步完成' };
        }
      }
      
      return { success: false, error: '同步失败' };
    } catch (error) {
      this.notifySyncStatus('error', '同步错误: ' + error.message);
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  // 合并数据（处理冲突）
  async mergeData(remoteData, remoteTimestamp) {
    try {
      const localData = await this.getLocalData();
      const localTimestamp = localData.lastSyncTime || 0;
      
      console.log('同步管理器: 合并数据', {
        localTime: new Date(localTimestamp).toLocaleString(),
        remoteTime: new Date(remoteTimestamp).toLocaleString()
      });

      // 策略1：使用最新数据
      if (this.syncConfig.conflictResolution === 'newest') {
        if (remoteTimestamp > localTimestamp) {
          // 远程数据更新，使用远程数据
          console.log('同步管理器: 使用远程数据');
          await this.applyRemoteData(remoteData);
          return { success: true, hasChanges: false, message: '已应用远程数据' };
        } else if (localTimestamp > remoteTimestamp) {
          // 本地数据更新，需要上传
          console.log('同步管理器: 本地数据更新，需要上传');
          return { success: true, hasChanges: true, message: '本地数据更新' };
        } else {
          // 时间相同，检查内容是否一致
          const localHash = this.hashData(localData);
          const remoteHash = this.hashData(remoteData);
          
          if (localHash !== remoteHash) {
            // 内容不同，合并项目
            console.log('同步管理器: 时间相同但内容不同，执行合并');
            await this.mergeItems(localData, remoteData);
            return { success: true, hasChanges: true, message: '数据已合并' };
          }
          
          return { success: true, hasChanges: false, message: '数据相同，无需同步' };
        }
      }
      
      // 策略2：优先本地
      if (this.syncConfig.conflictResolution === 'local') {
        return { success: true, hasChanges: true, message: '优先本地数据' };
      }
      
      // 策略3：优先远程
      if (this.syncConfig.conflictResolution === 'remote') {
        await this.applyRemoteData(remoteData);
        return { success: true, hasChanges: false, message: '已应用远程数据' };
      }
      
      return { success: false, error: '未知的冲突解决策略' };
    } catch (error) {
      console.error('同步管理器: 合并数据失败', error);
      return { success: false, error: error.message };
    }
  }

  // 应用远程数据
  async applyRemoteData(remoteData) {
    const dataToSave = {};
    
    if (remoteData.items) dataToSave.items = remoteData.items;
    if (remoteData.deletedItems) dataToSave.deletedItems = remoteData.deletedItems;
    if (remoteData.deletedCategories) dataToSave.deletedCategories = remoteData.deletedCategories;
    if (remoteData.tags) dataToSave.tags = remoteData.tags;
    if (remoteData.categories) dataToSave.categories = remoteData.categories;
    
    const currentResult = await chrome.storage.local.get(['settings', 'webdavConfig', 'aiConfig']);
    const localAiConfig = currentResult.aiConfig;
    
    if (remoteData.settings) {
      const currentResult2 = await chrome.storage.local.get(['settings', 'webdavConfig']);
      const localWebdavConfig = currentResult2.webdavConfig || currentResult2.settings?.webdav || {};
      
      dataToSave.settings = {
        ...remoteData.settings,
        webdav: localWebdavConfig
      };
      
      if (remoteData.settings.webdav && !localWebdavConfig.enabled) {
        await chrome.storage.local.set({ webdavConfig: remoteData.settings.webdav });
      }
    }
    
    if (localAiConfig) {
      dataToSave.aiConfig = localAiConfig;
    }
    
    await chrome.storage.local.set(dataToSave);
  }

  // 合并项目（智能合并，不丢失数据，支持墓碑机制）
  async mergeItems(localData, remoteData) {
    const localItems = localData.items || [];
    const localDeletedItems = localData.deletedItems || [];
    const localDeletedCategories = localData.deletedCategories || [];
    const remoteItems = remoteData.items || [];
    const remoteDeletedItems = remoteData.deletedItems || [];
    const remoteDeletedCategories = remoteData.deletedCategories || [];
    
    // 1. 合并项目墓碑记录
    const deletedMap = new Map();
    localDeletedItems.forEach(t => deletedMap.set(t.id, t));
    remoteDeletedItems.forEach(t => {
      const existing = deletedMap.get(t.id);
      if (!existing || new Date(t.deletedAt) > new Date(existing.deletedAt)) {
        deletedMap.set(t.id, t);
      }
    });
    const mergedDeletedItems = Array.from(deletedMap.values());
    const deletedIds = new Set(mergedDeletedItems.map(t => t.id));
    
    // 2. 合并分类墓碑记录
    const deletedCatMap = new Map();
    localDeletedCategories.forEach(c => deletedCatMap.set(c.name, c));
    remoteDeletedCategories.forEach(c => {
      const existing = deletedCatMap.get(c.name);
      if (!existing || new Date(c.deletedAt) > new Date(existing.deletedAt)) {
        deletedCatMap.set(c.name, c);
      }
    });
    const mergedDeletedCategories = Array.from(deletedCatMap.values());
    const deletedCategoryNames = new Set(mergedDeletedCategories.map(c => c.name));
    
    // 3. 创建ID映射
    const itemMap = new Map();
    
    // 添加本地项目（跳过已删除的）
    localItems.forEach(item => {
      if (!deletedIds.has(item.id)) {
        itemMap.set(item.id, { ...item, source: 'local' });
      }
    });
    
    // 合并远程项目
    remoteItems.forEach(remoteItem => {
      if (deletedIds.has(remoteItem.id)) {
        return;
      }
      
      const localItem = itemMap.get(remoteItem.id);
      
      if (!localItem) {
        itemMap.set(remoteItem.id, { ...remoteItem, source: 'remote' });
      } else {
        const localTime = new Date(localItem.updatedAt || 0).getTime();
        const remoteTime = new Date(remoteItem.updatedAt || 0).getTime();
        
        if (remoteTime > localTime) {
          itemMap.set(remoteItem.id, { ...remoteItem, source: 'merged' });
        }
      }
    });
    
    // 4. 合并设置
    const localSettings = localData.settings || {};
    const remoteSettings = remoteData.settings || {};
    const mergedSettings = {
      ...localSettings,
      ...remoteSettings,
      blockedInputs: {
        ...(localSettings.blockedInputs || {}),
        ...(remoteSettings.blockedInputs || {})
      }
    };
    
    // 5. 清理过期墓碑（30天）
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cleanedDeletedItems = mergedDeletedItems.filter(t => 
      new Date(t.deletedAt).getTime() > thirtyDaysAgo
    );
    const cleanedDeletedCategories = mergedDeletedCategories.filter(c =>
      new Date(c.deletedAt).getTime() > thirtyDaysAgo
    );
    
    // 6. 保存合并后的数据
    const mergedItems = Array.from(itemMap.values());
    
    // 合并分类（过滤掉已删除的）
    const mergedCategories = [...new Set([...(localData.categories || []), ...(remoteData.categories || [])])]
      .filter(c => !deletedCategoryNames.has(c));
    
    const currentResult = await chrome.storage.local.get(['aiConfig']);
    const dataToSave = {
      items: mergedItems,
      deletedItems: cleanedDeletedItems,
      deletedCategories: cleanedDeletedCategories,
      tags: [...new Set([...(localData.tags || []), ...(remoteData.tags || [])])],
      categories: mergedCategories,
      settings: mergedSettings
    };
    
    if (currentResult.aiConfig) {
      dataToSave.aiConfig = currentResult.aiConfig;
    }
    
    await chrome.storage.local.set(dataToSave);
    
    console.log('同步管理器: 项目合并完成', {
      local: localItems.length,
      remote: remoteItems.length,
      merged: mergedItems.length,
      tombstones: cleanedDeletedItems.length,
      deletedCategories: cleanedDeletedCategories.length
    });
  }

  // 获取本地数据
  async getLocalData() {
    const result = await chrome.storage.local.get([
      'items', 'tags', 'categories', 'settings', 'webdavConfig', 
      'deletedItems', 'deletedCategories'
    ]);
    
    const settings = result.settings || {};
    const webdavConfig = result.webdavConfig || settings.webdav || {};
    
    return {
      items: result.items || [],
      deletedItems: result.deletedItems || [],
      deletedCategories: result.deletedCategories || [],
      tags: result.tags || [],
      categories: result.categories || [],
      settings: {
        injectMode: settings.injectMode,
        whitelist: settings.whitelist,
        blacklist: settings.blacklist,
        blockedInputs: settings.blockedInputs || {},
        sidebarPosition: settings.sidebarPosition,
        viewMode: settings.viewMode,
        webdav: webdavConfig
      },
      lastSyncTime: this.lastSyncTime
    };
  }

  // 保存最后同步时间
  async saveLastSyncTime() {
    await chrome.storage.local.set({ lastSyncTime: this.lastSyncTime });
  }

  // 计算数据哈希（用于比较）
  hashData(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  // 通知同步状态
  notifySyncStatus(status, message) {
    // 发送消息给所有打开的页面
    chrome.runtime.sendMessage({
      action: 'syncStatus',
      status: status,
      message: message,
      timestamp: Date.now()
    }).catch(() => {
      // 忽略没有接收者的错误
    });
    
    // 更新扩展图标徽章
    const badgeText = status === 'syncing' ? '↻' : status === 'error' ? '!' : '';
    const badgeColor = status === 'syncing' ? '#4a90d9' : status === 'error' ? '#e74c3c' : '#27ae60';
    
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  }

  // 获取同步状态
  getStatus() {
    return {
      enabled: this.syncConfig.enabled,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      autoSync: this.syncConfig.autoSync,
      syncInterval: this.syncConfig.syncInterval
    };
  }

  // 更新同步配置
  async updateConfig(newConfig) {
    this.syncConfig = { ...this.syncConfig, ...newConfig };
    await this.saveConfig();
    
    // 重启自动同步
    this.stopAutoSync();
    if (this.syncConfig.enabled && this.syncConfig.autoSync) {
      this.startAutoSync();
    }
    
    console.log('同步管理器: 配置已更新', this.syncConfig);
  }
}

// 创建全局同步管理器实例
const syncManager = new SyncManager();

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SyncManager, syncManager };
}
