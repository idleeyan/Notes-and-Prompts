// 后台服务脚本

// 日志收集器
const syncLogger = {
  logs: [],
  maxLogs: 200,
  initialized: false,
  
  async init() {
    if (this.initialized) return;
    const result = await chrome.storage.local.get(['syncLogs']);
    this.logs = result.syncLogs || [];
    this.initialized = true;
  },
  
  log(source, message, data = null) {
    const entry = {
      time: new Date().toISOString(),
      source,
      message,
      data: data ? JSON.stringify(data) : null
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    // 异步保存，不阻塞
    chrome.storage.local.set({ syncLogs: this.logs }).catch(() => {});
    console.log(`[${source}]`, message, data || '');
  },
  
  async export() {
    await this.init();
    return this.logs.map(l => {
      const dataStr = l.data ? ` | 数据: ${l.data}` : '';
      return `[${l.time}] [${l.source}] ${l.message}${dataStr}`;
    }).join('\n');
  },
  
  async clear() {
    this.logs = [];
    await chrome.storage.local.set({ syncLogs: [] });
  }
};

// 初始化日志
syncLogger.init();

// 全局错误捕获
self.addEventListener('error', (e) => {
  syncLogger.log('ERROR', '全局错误', { message: e.message, file: e.filename, line: e.lineno });
});

self.addEventListener('unhandledrejection', (e) => {
  syncLogger.log('ERROR', '未处理的Promise拒绝', { reason: String(e.reason) });
});

syncLogger.log('SYSTEM', 'Background脚本开始加载');

// 增量同步常量和工具函数
const SYNC_VERSION = '3.0';
const MAX_SYNC_LOG = 100;
const TOMBSTONE_TTL_DAYS = 30;

// 计算项目校验和
function calculateItemChecksum(item) {
  const relevantData = {
    title: item.title || '',
    content: item.content || '',
    category: item.category || '',
    tags: (item.tags || []).sort()
  };
  const str = JSON.stringify(relevantData);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// 生成设备ID
async function getOrCreateDeviceId() {
  const result = await chrome.storage.local.get(['syncDeviceId']);
  if (result.syncDeviceId) return result.syncDeviceId;
  
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  const deviceId = `dev_${timestamp}_${random}`;
  await chrome.storage.local.set({ syncDeviceId: deviceId });
  return deviceId;
}

// 生成同步ID
function generateSyncId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `sync_${timestamp}_${random}`;
}

// 计算数据校验和
async function calculateDataChecksum(data) {
  const str = JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

// 清理过期墓碑
function cleanupOldTombstones(tombstones) {
  const ttlMs = TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - ttlMs;
  return tombstones.filter(t => new Date(t.deletedAt).getTime() > cutoffTime);
}

// 立即设置消息监听，确保 service worker 能立即响应
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: 收到消息(全局)', message.action);
  
  if (message.action === 'webdav') {
    handleWebDAVRequest(message).then(result => {
      console.log('Background: WebDAV请求完成', result?.success);
      sendResponse(result);
    }).catch(error => {
      console.error('Background: WebDAV请求错误', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (message.action === 'settingsChanged') {
    console.log('Background: 收到配置更改通知，重新加载配置');
    // 通知 BackgroundService 重新加载配置
    if (backgroundService) {
      backgroundService.reloadConfig().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Background: 重新加载配置失败', error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
    sendResponse({ success: false, error: 'BackgroundService 未初始化' });
    return true;
  }
  
  if (message.action === 'openEditWindow' && message.url) {
    if (backgroundService) {
      backgroundService.openEditWindow(message.url);
      sendResponse({ success: true });
    } else {
      chrome.windows.create({
        url: message.url,
        type: 'popup',
        width: 900,
        height: 700
      });
      sendResponse({ success: true });
    }
    return true;
  }
  
  
  if (message.action === 'openAISettings') {
    if (backgroundService) {
      backgroundService.openAISettings();
      sendResponse({ success: true });
    } else {
      chrome.windows.create({
        url: chrome.runtime.getURL('ai-settings.html'),
        type: 'popup',
        width: 900,
        height: 700
      });
      sendResponse({ success: true });
    }
    return true;
  }
  
  // 导出同步日志
  if (message.action === 'exportSyncLog') {
    syncLogger.export().then(logs => {
      sendResponse({ success: true, logs: logs });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  // 清除同步日志
  if (message.action === 'clearSyncLog') {
    syncLogger.clear().then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  // 其他消息由 BackgroundService 处理
  return false;
});

// 独立的 WebDAV 处理函数
async function handleWebDAVRequest(request) {
  console.log('Background: handleWebDAVRequest 开始', request);
  
  const { config, method, path = '', data = null } = request;
  const { serverUrl, username, password } = config;

  console.log('Background: WebDAV请求', { method, path, serverUrl });

  if (!serverUrl || !username || !password) {
    console.error('Background: WebDAV配置不完整');
    return { success: false, error: 'WebDAV配置不完整' };
  }

  const baseUrl = serverUrl.replace(/\/$/, '');
  const fullPath = path.startsWith('/') ? path : '/' + path;
  const url = baseUrl + fullPath;

  const credentials = btoa(`${username}:${password}`);
  const headers = {
    'Authorization': `Basic ${credentials}`
  };

  if (method === 'PUT' || method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const fetchOptions = {
      method: method,
      headers: headers,
      signal: controller.signal
    };

    if (data && (method === 'PUT' || method === 'POST')) {
      fetchOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
    }

    console.log('Background: 发送fetch', url);
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    console.log('Background: fetch响应', response.status);

    if (method === 'GET') {
      const responseData = await response.text();
      return { success: response.ok, status: response.status, data: responseData };
    } else {
      return { 
        success: response.ok || response.status === 201 || response.status === 204,
        status: response.status,
        statusText: response.statusText
      };
    }
  } catch (error) {
    console.error('Background: fetch错误', error.name, error.message);
    if (error.name === 'AbortError') {
      return { success: false, error: '请求超时' };
    }
    return { success: false, error: error.message };
  }
}

class BackgroundService {
  constructor() {
    this.settings = {
      injectMode: 'all',
      whitelist: [],
      blacklist: []
    };
    this.init();
  }

  async init() {
    console.log('Background: 开始初始化');
    await this.loadSettings();
    this.setupContextMenus();
    this.setupAlarmListener();
    await this.initSyncManager(); // 等待同步管理器初始化完成
    console.log('Background: 初始化完成');
  }

  // 加载设置
  async loadSettings() {
    const result = await chrome.storage.local.get(['settings']);
    if (result.settings) {
      // 深度合并 settings，确保嵌套对象（如 webdav）的默认值不会被覆盖
      this.settings = this.deepMerge(this.settings, result.settings);
    }
  }

  // 深度合并对象
  deepMerge(target, source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return source;
    }
    
    const output = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          // 如果 source[key] 是对象且 target[key] 也是对象，则递归合并
          if (target[key] && typeof target[key] === 'object') {
            output[key] = this.deepMerge(target[key], source[key]);
          } else {
            // 否则直接使用 source[key]
            output[key] = source[key];
          }
        } else {
          // 基本类型直接赋值
          output[key] = source[key];
        }
      }
    }
    
    return output;
  }

  // 默认 WebDAV 配置
  getDefaultWebdavConfig() {
    return {
      enabled: false,
      serverUrl: '',
      username: '',
      password: '',
      syncPath: '/notebook-sync/',
      filename: 'notebook-data.json'
    };
  }

  // 加载同步和WebDAV配置
  async loadSyncConfig() {
    const result = await chrome.storage.local.get(['syncConfig', 'settings', 'webdavConfig']);
    
    this.syncConfig = result.syncConfig || {
      enabled: false,
      autoSync: true,
      syncOnChange: true,
      syncInterval: 5
    };
    
    // 优先使用独立的 webdavConfig，如果不存在则回退到 settings.webdav
    const webdavFromStorage = result.webdavConfig || result.settings?.webdav || {};
    this.webdavConfig = this.deepMerge(this.getDefaultWebdavConfig(), webdavFromStorage);
    
    return {
      syncConfig: this.syncConfig,
      webdavConfig: this.webdavConfig,
      webdavSource: result.webdavConfig ? 'webdavConfig' : 'settings.webdav'
    };
  }

  // 重新加载配置（当设置更改时调用）
  async reloadConfig() {
    console.log('Background: 重新加载配置');
    
    const config = await this.loadSyncConfig();
    
    console.log('Background: 配置已重新加载', {
      syncConfig: config.syncConfig,
      webdavEnabled: config.webdavConfig?.enabled,
      webdavSource: config.webdavSource
    });
    
    // 重新启动定时同步
    await this.startAutoSync();
    
    console.log('Background: 定时同步已重新启动');
  }

  // 打开AI设置页面
  async openAISettings() {
    console.log('Background: 打开AI设置页面');
    const url = chrome.runtime.getURL('ai-settings.html');
    
    chrome.windows.create({
      url: url,
      type: 'popup',
      width: 900,
      height: 700
    });
  }

  // 初始化同步管理器
  async initSyncManager() {
    console.log('Background: 初始化同步管理器');
    
    await this.loadSyncConfig();
    
    console.log('Background: 同步配置', this.syncConfig);
    console.log('Background: WebDAV配置', this.webdavConfig);
    
    // 设置存储变更监听
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      
      console.log('Background: storage变更', Object.keys(changes));
      
      // 记录 aiConfig 变更的详细信息
      if (changes.aiConfig) {
        console.log('Background: [AI_CONFIG_CHANGED] AI配置变更检测');
        console.log('Background: [AI_CONFIG_CHANGED] 旧值:', changes.aiConfig.oldValue);
        console.log('Background: [AI_CONFIG_CHANGED] 新值:', changes.aiConfig.newValue);
        if (changes.aiConfig.newValue) {
          console.log('Background: [AI_CONFIG_CHANGED] 新值详情:', {
            enabled: changes.aiConfig.newValue.enabled,
            provider: changes.aiConfig.newValue.provider,
            apiKey: changes.aiConfig.newValue.apiKey ? `${changes.aiConfig.newValue.apiKey.substring(0, 4)}***` : '空',
            apiKeyLength: changes.aiConfig.newValue.apiKey ? changes.aiConfig.newValue.apiKey.length : 0,
            model: changes.aiConfig.newValue.model,
            customModels: changes.aiConfig.newValue.customModels
          });
        }
      }
      
      // 更新配置
      if (changes.syncConfig) {
        this.syncConfig = changes.syncConfig.newValue;
        console.log('Background: 同步配置已更新', this.syncConfig);
      }
      // 优先检测独立的 webdavConfig 变更
      if (changes.webdavConfig?.newValue) {
        this.webdavConfig = changes.webdavConfig.newValue;
        console.log('Background: WebDAV配置已更新（来自webdavConfig）', this.webdavConfig);
      }
      // 兼容：检测 settings.webdav 变更
      else if (changes.settings?.newValue?.webdav) {
        this.webdavConfig = changes.settings.newValue.webdav;
        console.log('Background: WebDAV配置已更新（来自settings.webdav）', this.webdavConfig);
      }
      
      // 数据变更时同步
      if (changes.items) {
        syncLogger.log('STORAGE', 'items变更检测', {
          syncOnChange: this.syncConfig?.syncOnChange,
          webdavEnabled: this.webdavConfig?.enabled,
          hasOldValue: !!changes.items.oldValue,
          hasNewValue: !!changes.items.newValue,
          oldCount: changes.items.oldValue?.length,
          newCount: changes.items.newValue?.length
        });
        
        if (this.webdavConfig?.enabled && this.syncConfig?.syncOnChange) {
          syncLogger.log('STORAGE', '触发防抖同步');
          this.debouncedSync();
        } else {
          syncLogger.log('STORAGE', '条件不满足，跳过同步', {
            webdavEnabled: this.webdavConfig?.enabled,
            syncOnChange: this.syncConfig?.syncOnChange
          });
        }
      }
    });
    
    // 启动定时同步
    this.startAutoSync();
  }
  
  // 启动定时同步
  async startAutoSync() {
    // 清除现有 alarm 和定时器
    await chrome.alarms.clear('autoSync');
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    
    // 使用 WebDAV 的 enabled 作为同步总开关
    if (this.webdavConfig?.enabled && this.syncConfig?.autoSync) {
      const intervalMinutes = this.syncConfig.syncInterval || 5;
      console.log(`Background: 启动定时同步，间隔 ${intervalMinutes} 分钟`);
      
      // 如果间隔小于1分钟，使用 setInterval（用于测试）
      if (intervalMinutes < 1) {
        const intervalMs = intervalMinutes * 60 * 1000;
        console.log(`Background: 使用 setInterval，间隔 ${intervalMs}ms`);
        this.syncIntervalId = setInterval(async () => {
          console.log('Background: 定时同步触发（setInterval）');
          // Service Worker 可能已休眠，需要重新加载配置
          await this.reloadConfig();
          if (this.webdavConfig?.enabled) {
            this.syncToRemote(this.webdavConfig);
          }
        }, intervalMs);
      } else {
        // 使用 chrome.alarms API，这是 Manifest V3 推荐的方式
        await chrome.alarms.create('autoSync', {
          periodInMinutes: intervalMinutes
        });
        console.log('Background: 定时同步 alarm 已创建');
      }
    } else {
      console.log('Background: 自动同步未启用', {
        autoSync: this.syncConfig?.autoSync,
        webdavEnabled: this.webdavConfig?.enabled
      });
    }
  }
  
  // 停止定时同步
  async stopAutoSync() {
    await chrome.alarms.clear('autoSync');
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    console.log('Background: 定时同步已停止');
  }
  
  // 设置 alarm 监听器
  setupAlarmListener() {
    console.log('Background: 设置 alarm 监听器');
    
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      console.log('Background: alarm 触发', alarm.name);
      
      if (alarm.name === 'autoSync') {
        console.log('Background: 定时同步 alarm 触发');
        
        // Service Worker 可能已休眠，需要重新加载配置
        await this.reloadConfig();
        
        if (this.webdavConfig?.enabled) {
          this.syncToRemote(this.webdavConfig);
        } else {
          console.log('Background: WebDAV 未启用，跳过定时同步');
        }
      }
      
      if (alarm.name === 'debouncedSync') {
        syncLogger.log('DEBOUNCE', '防抖同步 alarm 触发');
        
        await this.reloadConfig();
        
        if (this.webdavConfig?.enabled) {
          this.syncToRemote(this.webdavConfig);
        } else {
          syncLogger.log('DEBOUNCE', 'WebDAV 未启用，跳过同步');
        }
      }
    });
    
    console.log('Background: alarm 监听器已设置');
  }

  // 防抖同步（使用 chrome.alarms 替代 setTimeout，兼容 Service Worker）
  async debouncedSync() {
    // 清除之前的防抖 alarm
    await chrome.alarms.clear('debouncedSync');
    
    // 设置 3 秒后触发同步
    const when = Date.now() + 3000;
    await chrome.alarms.create('debouncedSync', { when });
    
    syncLogger.log('DEBOUNCE', '设置防抖同步', { triggerAt: new Date(when).toISOString() });
  }

  // 同步到远程（增量同步）
  async syncToRemote(webdavConfig) {
    if (this.isSyncing) {
      console.log('Background: 同步已在进行中，跳过');
      return;
    }
    this.isSyncing = true;
    
    console.log('Background: 开始增量同步 (v3.0)');
    
    const keepAlive = setInterval(() => {
      console.log('Background: 保持活动状态');
    }, 5000);
    
    try {
      const deviceId = await getOrCreateDeviceId();
      const localResult = await chrome.storage.local.get([
        'items', 'tags', 'categories', 'settings', 'lastSyncTime', 
        'deletedItems', 'deletedCategories', 'syncMeta', 'pendingChanges'
      ]);
      
      // 确保所有项目有版本号
      const items = (localResult.items || []).map(item => ({
        ...item,
        version: item.version || 1,
        checksum: item.checksum || calculateItemChecksum(item)
      }));
      
      const deletedItems = cleanupOldTombstones(localResult.deletedItems || []);
      const deletedCategories = localResult.deletedCategories || [];
      
      syncLogger.log('SYNC', '本地数据状态', {
        items: items.length,
        deletedItems: deletedItems.length,
        deletedCategories: deletedCategories.length,
        deletedIds: deletedItems.map(t => ({ id: t.id, deletedAt: t.deletedAt })),
        deletedCategoryNames: deletedCategories.map(c => c.name)
      });
      
      const localData = {
        items,
        deletedItems,
        deletedCategories,
        tags: localResult.tags || [],
        categories: localResult.categories || [],
        settings: localResult.settings || {},
        timestamp: localResult.lastSyncTime || 0
      };
      
      const remoteResult = await this.downloadData(webdavConfig);
      
      if (remoteResult.success) {
        syncLogger.log('SYNC', '远程数据下载成功', {
          hasData: !!remoteResult.data,
          hasItems: !!(remoteResult.data?.items || remoteResult.data?.data?.items),
          hasDeletedItems: !!(remoteResult.data?.deletedItems || remoteResult.data?.data?.deletedItems),
          hasDeletedCategories: !!(remoteResult.data?.deletedCategories || remoteResult.data?.data?.deletedCategories)
        });
        
        // 执行增量合并
        const mergedData = await this.incrementalMerge(localData, remoteResult.data, deviceId);
        
        // 上传合并后的数据
        const uploadResult = await this.directUpload(webdavConfig, mergedData);
        
        if (uploadResult.success) {
          // 保存合并后的本地数据
          await this.saveMergedData(mergedData);
          syncLogger.log('SYNC', '增量同步完成', {
            items: mergedData.items.length,
            deletedItems: mergedData.deletedItems.length,
            deletedCategories: mergedData.deletedCategories.length
          });
        } else {
          syncLogger.log('ERROR', '上传失败', { error: uploadResult.error });
        }
      } else {
        syncLogger.log('SYNC', '无远程数据，上传本地数据');
        const uploadResult = await this.directUpload(webdavConfig, localData);
        if (uploadResult.success) {
          syncLogger.log('SYNC', '初始数据上传成功');
        }
      }

      await chrome.storage.local.set({ 
        lastSyncTime: Date.now(),
        syncMeta: {
          deviceId: deviceId,
          lastSyncTime: Date.now(),
          version: SYNC_VERSION
        },
        pendingChanges: []
      });
      
      chrome.action.setBadgeText({ text: '' });
    } catch (error) {
      console.error('Background: 同步错误', error);
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' });
    } finally {
      clearInterval(keepAlive);
      this.isSyncing = false;
    }
  }

  // 增量合并算法
  async incrementalMerge(localData, remoteData, deviceId) {
    let remoteItems, remoteDeletedItems, remoteDeletedCategories, remoteTags, remoteCategories, remoteSettings;
    
    if (remoteData.data && remoteData.data.items) {
      remoteItems = remoteData.data.items || [];
      remoteDeletedItems = remoteData.data.deletedItems || [];
      remoteDeletedCategories = remoteData.data.deletedCategories || [];
      remoteTags = remoteData.data.tags || [];
      remoteCategories = remoteData.data.categories || [];
      remoteSettings = remoteData.data.settings || {};
      syncLogger.log('MERGE', '解析为旧格式(v1.0)');
    } else if (remoteData.items) {
      remoteItems = remoteData.items || [];
      remoteDeletedItems = remoteData.deletedItems || [];
      remoteDeletedCategories = remoteData.deletedCategories || [];
      remoteTags = remoteData.tags || [];
      remoteCategories = remoteData.categories || [];
      remoteSettings = remoteData.settings || {};
      syncLogger.log('MERGE', '解析为新格式(v3.0)');
    } else {
      syncLogger.log('ERROR', '无法解析远程数据格式');
      remoteItems = [];
      remoteDeletedItems = [];
      remoteDeletedCategories = [];
      remoteTags = [];
      remoteCategories = [];
      remoteSettings = {};
    }
    
    syncLogger.log('MERGE', '远程数据解析结果', {
      items: remoteItems.length,
      deletedItems: remoteDeletedItems.length,
      deletedCategories: remoteDeletedCategories.length
    });

    // 合并分类墓碑
    const deletedCategoryMap = new Map();
    (localData.deletedCategories || []).forEach(c => deletedCategoryMap.set(c.name, c));
    remoteDeletedCategories.forEach(c => {
      const existing = deletedCategoryMap.get(c.name);
      if (!existing || new Date(c.deletedAt) > new Date(existing.deletedAt)) {
        deletedCategoryMap.set(c.name, c);
      }
    });
    const mergedDeletedCategories = Array.from(deletedCategoryMap.values());
    const deletedCategoryNames = new Set(mergedDeletedCategories.map(c => c.name));
    
    syncLogger.log('MERGE', '分类墓碑合并', {
      local: (localData.deletedCategories || []).length,
      remote: remoteDeletedCategories.length,
      merged: mergedDeletedCategories.length,
      deletedNames: Array.from(deletedCategoryNames)
    });

    // 合并项目墓碑
    const deletedMap = new Map();
    localData.deletedItems.forEach(t => deletedMap.set(t.id, t));
    remoteDeletedItems.forEach(t => {
      const existing = deletedMap.get(t.id);
      if (!existing || new Date(t.deletedAt) > new Date(existing.deletedAt)) {
        deletedMap.set(t.id, t);
      }
    });
    const mergedDeletedItems = Array.from(deletedMap.values());
    const deletedIds = new Set(mergedDeletedItems.map(t => t.id));
    
    syncLogger.log('MERGE', '项目墓碑合并', {
      local: localData.deletedItems.length,
      remote: remoteDeletedItems.length,
      merged: mergedDeletedItems.length
    });

    // 合并项目
    const itemMap = new Map();
    let skippedByTombstone = 0;
    let localNewerCount = 0;
    let remoteNewerCount = 0;
    
    localData.items.forEach(item => {
      if (!deletedIds.has(item.id)) {
        itemMap.set(item.id, { ...item, source: 'local' });
      } else {
        skippedByTombstone++;
      }
    });
    
    remoteItems.forEach(remoteItem => {
      if (deletedIds.has(remoteItem.id)) {
        skippedByTombstone++;
        return;
      }
      
      const localItem = itemMap.get(remoteItem.id);
      
      if (!localItem) {
        itemMap.set(remoteItem.id, { ...remoteItem, source: 'remote' });
      } else {
        const localVersion = localItem.version || 1;
        const remoteVersion = remoteItem.version || 1;
        const localChecksum = localItem.checksum || '';
        const remoteChecksum = remoteItem.checksum || '';
        
        if (remoteVersion > localVersion) {
          syncLogger.log('MERGE', `远程更新: ${remoteItem.id}`, {
            localVersion, remoteVersion, title: remoteItem.title?.substring(0, 20)
          });
          itemMap.set(remoteItem.id, { ...remoteItem, source: 'merged' });
          remoteNewerCount++;
        } else if (localVersion > remoteVersion) {
          syncLogger.log('MERGE', `本地更新: ${localItem.id}`, {
            localVersion, remoteVersion, title: localItem.title?.substring(0, 20)
          });
          // 保留本地版本
          localNewerCount++;
        } else if (remoteChecksum !== localChecksum) {
          const localTime = new Date(localItem.updatedAt || 0).getTime();
          const remoteTime = new Date(remoteItem.updatedAt || 0).getTime();
          if (remoteTime > localTime) {
            itemMap.set(remoteItem.id, { ...remoteItem, source: 'merged' });
            remoteNewerCount++;
          } else {
            localNewerCount++;
          }
        }
      }
    });
    
    syncLogger.log('MERGE', '项目合并完成', { 
      skippedByTombstone, 
      finalCount: itemMap.size,
      localNewerCount,
      remoteNewerCount
    });

    // 合并分类（过滤掉已删除的）
    const mergedCategories = [...new Set([...localData.categories, ...remoteCategories])]
      .filter(c => !deletedCategoryNames.has(c));

    // 合并标签
    const mergedTags = [...new Set([...localData.tags, ...remoteTags])];

    // 合并设置
    const mergedSettings = {
      ...remoteSettings,
      ...localData.settings,
      blockedInputs: {
        ...(remoteSettings.blockedInputs || {}),
        ...(localData.settings.blockedInputs || {})
      },
      webdav: this.deepMerge(
        localData.settings.webdav || this.getDefaultWebdavConfig(),
        remoteSettings.webdav || {}
      )
    };

    const result = {
      items: Array.from(itemMap.values()),
      deletedItems: mergedDeletedItems,
      deletedCategories: mergedDeletedCategories,
      tags: mergedTags,
      categories: mergedCategories,
      settings: mergedSettings,
      timestamp: Date.now()
    };
    
    syncLogger.log('MERGE', '合并最终结果', {
      items: result.items.length,
      deletedItems: result.deletedItems.length,
      deletedCategories: result.deletedCategories.length,
      categories: result.categories.length
    });
    
    return result;
  }

  // 保存合并后的数据
  async saveMergedData(mergedData) {
    const aiConfigResult = await chrome.storage.local.get(['aiConfig']);
    const dataToSave = {
      items: mergedData.items,
      deletedItems: mergedData.deletedItems,
      deletedCategories: mergedData.deletedCategories,
      tags: mergedData.tags,
      categories: mergedData.categories,
      settings: mergedData.settings
    };
    
    if (aiConfigResult.aiConfig) {
      dataToSave.aiConfig = aiConfigResult.aiConfig;
    }
    
    await chrome.storage.local.set(dataToSave);
    syncLogger.log('SAVE', '数据已保存', {
      items: mergedData.items.length,
      deletedItems: mergedData.deletedItems.length,
      deletedCategories: mergedData.deletedCategories.length
    });
  }
  
  // 下载远程数据
  async downloadData(webdavConfig) {
    const { serverUrl, username, password, syncPath, filename } = webdavConfig;
    
    if (!serverUrl || !username || !password) {
      return { success: false, error: 'WebDAV未配置' };
    }

    // 尝试多种路径格式
    const cleanSyncPath = (syncPath || '/notebook-sync/').replace(/\/$/, '');
    const cleanFilename = filename || 'notebook-data.json';
    
    const pathsToTry = [
      `${cleanSyncPath}/${cleanFilename}`,
      `/vol1/1000${cleanSyncPath}/${cleanFilename}`,
    ];

    // 如果路径包含用户名，也尝试不带用户名的路径
    const usernameMatch = cleanSyncPath.match(/^\/([^\/]+)\//);
    if (usernameMatch) {
      const user = usernameMatch[1];
      pathsToTry.push(`${cleanSyncPath.replace(`/${user}/`, '/')}/${cleanFilename}`);
      pathsToTry.push(`/vol1/1000${cleanSyncPath.replace(`/${user}/`, '/')}/${cleanFilename}`);
    }

    const baseUrl = serverUrl.replace(/\/$/, '');
    const credentials = btoa(`${username}:${password}`);
    
    for (const filePath of pathsToTry) {
      const url = baseUrl + filePath;
      console.log('Background: 尝试下载', url);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        console.log('Background: 下载响应', response.status, filePath);

        if (response.ok) {
          const text = await response.text();
          try {
            const data = JSON.parse(text);
            return {
              success: true,
              timestamp: data.timestamp || 0,
              data: data
            };
          } catch (e) {
            console.error('Background: 解析远程数据失败', e);
            continue;
          }
        }
        
        // 404 表示文件不存在，继续尝试其他路径
        if (response.status === 404) {
          console.log('Background: 文件不存在，尝试其他路径');
          continue;
        }
      } catch (error) {
        console.error('Background: 下载错误', error.message, filePath);
      }
    }
    
    return { success: false, error: '未找到远程数据' };
  }
  
  // 直接上传（不通过消息传递）
  async directUpload(webdavConfig, data) {
    const { serverUrl, username, password, syncPath, filename } = webdavConfig;
    
    if (!serverUrl || !username || !password) {
      return { success: false, error: 'WebDAV未配置' };
    }

    // 确保数据格式正确，直接展开数据（不额外包装）
    const syncData = {
      version: data.version || SYNC_VERSION,
      meta: data.meta || {
        deviceId: 'unknown',
        syncId: generateSyncId(),
        timestamp: Date.now()
      },
      items: data.items || [],
      deletedItems: data.deletedItems || [],
      deletedCategories: data.deletedCategories || [],
      tags: data.tags || [],
      categories: data.categories || [],
      settings: data.settings || {},
      timestamp: Date.now()
    };
    
    syncLogger.log('UPLOAD', '准备上传数据', {
      items: syncData.items.length,
      deletedItems: syncData.deletedItems.length,
      deletedCategories: syncData.deletedCategories.length,
      version: syncData.version
    });

    // 尝试多种路径格式
    const cleanSyncPath = (syncPath || '/notebook-sync/').replace(/\/$/, '');
    const cleanFilename = filename || 'notebook-data.json';
    
    const pathsToTry = [
      `${cleanSyncPath}/${cleanFilename}`,
      `/vol1/1000${cleanSyncPath}/${cleanFilename}`,
    ];

    // 如果路径包含用户名，也尝试不带用户名的路径
    const usernameMatch = cleanSyncPath.match(/^\/([^\/]+)\//);
    if (usernameMatch) {
      const username = usernameMatch[1];
      pathsToTry.push(`${cleanSyncPath.replace(`/${username}/`, '/')}/${cleanFilename}`);
      pathsToTry.push(`/vol1/1000${cleanSyncPath.replace(`/${username}/`, '/')}/${cleanFilename}`);
    }

    const baseUrl = serverUrl.replace(/\/$/, '');
    const credentials = btoa(`${username}:${password}`);
    
    for (const filePath of pathsToTry) {
      const url = baseUrl + filePath;
      console.log('Background: 尝试上传', url);
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(syncData),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        console.log('Background: 上传响应', response.status, filePath);

        if (response.ok || response.status === 201 || response.status === 204) {
          return { success: true, path: filePath };
        }
        
        // 403/405 可能是路径问题，继续尝试其他路径
        if (response.status === 403 || response.status === 405) {
          console.log('Background: 路径可能被拒绝，尝试其他路径');
          continue;
        }
      } catch (error) {
        console.error('Background: 上传错误', error.message, filePath);
      }
    }
    
    return { success: false, error: '所有路径都上传失败' };
  }

  // 设置上下文菜单
  async setupContextMenus() {
    await chrome.contextMenus.removeAll();

    // 统一的收藏入口（所有内容类型：页面、选中文本、链接、图片）
    chrome.contextMenus.create({
      id: 'clip-content',
      title: '📝 收藏网页内容',
      contexts: ['page', 'selection', 'link', 'image']
    });

    // 快速添加提示词
    chrome.contextMenus.create({
      id: 'add-to-prompts',
      title: '💡 添加为提示词',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'add-site-to-blacklist',
      title: '🚫 将当前网站加入输入框检测黑名单',
      contexts: ['page', 'selection', 'link', 'image']
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab).catch(console.error);
    });
  }

  // 处理上下文菜单点击
  async handleContextMenuClick(info, tab) {
    const menuId = info.menuItemId;

    if (menuId === 'add-to-prompts' && info.selectionText) {
      await this.saveSelectionAsPrompt(info.selectionText, tab);
      return;
    }

    if (menuId === 'add-site-to-blacklist') {
      await this.addSiteToBlacklist(tab);
      return;
    }

    // 统一的网页内容收藏（智能识别：选中文本、链接、图片或整页）
    if (menuId === 'clip-content') {
      await this.openContentClipWindow(tab, info);
      return;
    }
  }

  async addSiteToBlacklist(tab) {
    const url = tab?.url;
    if (!url || !url.startsWith('http')) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '⚠️ 无法加入黑名单',
        message: '当前页面不支持加入黑名单'
      });
      return;
    }

    const hostname = new URL(url).hostname.toLowerCase();
    const result = await chrome.storage.local.get(['settings', 'aiConfig']);
    const settings = this.deepMerge(this.settings, result.settings || {});
    const blacklist = Array.isArray(settings.blacklist) ? settings.blacklist : [];

    if (!blacklist.includes(hostname)) {
      blacklist.push(hostname);
      settings.blacklist = blacklist;
      
      // 保存时保护aiConfig
      const dataToSave = { settings };
      if (result.aiConfig) {
        dataToSave.aiConfig = result.aiConfig;
      }
      await chrome.storage.local.set(dataToSave);
      
      this.settings = settings;
      await this.notifyTabsToRefresh();
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '✅ 已加入黑名单',
        message: hostname
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'ℹ️ 已在黑名单中',
        message: hostname
      });
    }
  }

  // 统一的网页内容收藏窗口（智能识别内容类型：文本、链接、图片、页面）
  async openContentClipWindow(tab, info) {
    try {
      let clipUrlParams = `tabId=${tab.id}&type=content`;
      
      // 处理图片（最高优先级）
      if (info.srcUrl) {
        clipUrlParams += `&imageUrl=${encodeURIComponent(info.srcUrl)}`;
        // 图片模式使用更大的窗口
        const clipUrl = chrome.runtime.getURL(`clip.html?${clipUrlParams}`);
        this.openEditWindow(clipUrl, { width: 1000, height: 800 });
        return;
      }
      
      // 处理选中文本
      if (info.selectionText) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return { text: '', html: '' };
            const selectedText = selection.toString().trim();
            if (!selectedText) return { text: '', html: '' };
            const range = selection.getRangeAt(0);
            const clonedSelection = range.cloneContents();
            const div = document.createElement('div');
            div.appendChild(clonedSelection);
            return { text: selectedText, html: div.innerHTML };
          }
        });
        
        const result = results[0]?.result;
        if (result?.text) {
          clipUrlParams += `&text=${encodeURIComponent(result.text)}&html=${encodeURIComponent(result.html)}`;
        }
      }
      // 处理链接
      else if (info.linkUrl) {
        clipUrlParams += `&linkUrl=${encodeURIComponent(info.linkUrl)}&linkText=${encodeURIComponent(info.linkText || '')}`;
      }

      const clipUrl = chrome.runtime.getURL(`clip.html?${clipUrlParams}`);
      this.openEditWindow(clipUrl);
    } catch (error) {
      console.error('打开收藏窗口失败:', error);
    }
  }

  // 快速保存图片
  async quickSaveImage(imageUrl, tab) {
    try {
      const result = await chrome.storage.local.get(['items']);
      const items = result.items || [];

      // 获取图片尺寸信息
      const imageInfo = await this.getImageInfo(imageUrl);

      const note = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        type: 'note',
        title: `图片收藏 - ${new Date().toLocaleString()}`,
        content: `![图片](${imageUrl})`,
        excerpt: '[图片]',
        url: tab.url,
        favicon: tab.favIconUrl,
        images: [imageUrl],
        imageInfo: imageInfo,
        category: '图片',
        tags: ['图片'],
        clipType: 'image',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      items.push(note);
      await chrome.storage.local.set({ items });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '✅ 图片已保存',
        message: `尺寸: ${imageInfo.width}x${imageInfo.height}`
      });
    } catch (error) {
      console.error('快速保存图片失败:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: '❌ 保存失败',
        message: '图片保存失败，请重试'
      });
    }
  }

  // 获取图片信息
  async getImageInfo(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: (img.naturalWidth / img.naturalHeight).toFixed(2)
        });
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0, aspectRatio: '0' });
      };
      img.src = url;
    });
  }

  // 保存选中文本为笔记
  async saveSelectionAsNote(selectedText, tab) {
    const result = await chrome.storage.local.get(['items']);
    const items = result.items || [];

    const note = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      type: 'note',
      title: selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''),
      content: selectedText,
      url: tab.url,
      category: '未分类',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    items.push(note);
    await chrome.storage.local.set({ items });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '✅ 笔记已保存',
      message: note.title
    });
  }

  // 保存选中文本为提示词
  async saveSelectionAsPrompt(selectedText, tab) {
    const result = await chrome.storage.local.get(['items']);
    const items = result.items || [];

    const prompt = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      type: 'prompt',
      title: selectedText.substring(0, 30) + (selectedText.length > 30 ? '...' : ''),
      content: selectedText,
      category: '通用',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    items.push(prompt);
    await chrome.storage.local.set({ items });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '✅ 提示词已保存',
      message: prompt.title
    });
  }

  // 打开文本收藏窗口
  async openTextClipWindow(tab) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return { text: '', html: '' };
          const selectedText = selection.toString().trim();
          if (!selectedText) return { text: '', html: '' };
          const range = selection.getRangeAt(0);
          const clonedSelection = range.cloneContents();
          const div = document.createElement('div');
          div.appendChild(clonedSelection);
          return { text: selectedText, html: div.innerHTML };
        }
      });

      const result = results[0]?.result;
      if (result?.text) {
        const clipUrl = chrome.runtime.getURL(`clip.html?tabId=${tab.id}&type=text&text=${encodeURIComponent(result.text)}&html=${encodeURIComponent(result.html)}`);
        this.openEditWindow(clipUrl);
      }
    } catch (error) {
      console.error('获取选中文本失败:', error);
    }
  }

  // 打开编辑窗口
  async openEditWindow(url, options = {}) {
    const defaultOptions = {
      url: url,
      type: 'popup',
      width: 900,
      height: 700
    };
    await chrome.windows.create({ ...defaultOptions, ...options });
  }

  // 通知所有标签页刷新
  async notifyTabsToRefresh() {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'refreshSettings' }).catch(() => {});
    });
  }
}

// WebDAV客户端
class WebDAVClient {
  constructor(config) {
    this.serverUrl = config.serverUrl || '';
    this.username = config.username || '';
    this.password = config.password || '';
    this.syncPath = config.syncPath || '/notebook-sync/';
    this.filename = config.filename || 'notebook-data.json';
    this.enabled = config.enabled || false;
  }

  isConfigured() {
    return this.enabled && this.serverUrl && this.username && this.password;
  }

  async uploadData(data) {
    console.log('WebDAVClient: uploadData 开始', { serverUrl: this.serverUrl, enabled: this.enabled });
    
    if (!this.isConfigured()) {
      console.log('WebDAVClient: 未配置');
      return { success: false, error: 'WebDAV未配置' };
    }

    const syncData = {
      version: '1.0',
      timestamp: Date.now(),
      data: data
    };

    const filePath = `${this.syncPath.replace(/\/$/, '')}/${this.filename}`;
    console.log('WebDAVClient: 准备上传', filePath);
    
    try {
      const result = await this.sendRequest('PUT', filePath, syncData);
      console.log('WebDAVClient: 上传结果', result);
      
      if (result.success) {
        return { success: true, path: filePath };
      }
      return { success: false, error: `上传失败: ${result.status || result.error || '未知错误'}` };
    } catch (error) {
      console.error('WebDAVClient: 上传异常', error);
      return { success: false, error: error.message };
    }
  }

  async sendRequest(method, path, data) {
    console.log('WebDAVClient: sendRequest', { method, path });
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
        console.log('WebDAVClient: sendRequest 响应', { method, path, result });
        if (chrome.runtime.lastError) {
          console.error('WebDAVClient: sendRequest 错误', chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(result || { success: false, error: '无响应' });
        }
      });
    });
  }
}

// 初始化
const backgroundService = new BackgroundService();

// 安装/更新处理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('扩展已' + (details.reason === 'install' ? '安装' : '更新'));
  if (details.reason === 'install') {
    chrome.storage.local.set({
      items: [],
      settings: { injectMode: 'all', whitelist: [], blacklist: [] },
      tags: [],
      categories: ['通用', '编程', '写作', '翻译', '创意', '其他']
    });
  }
});
