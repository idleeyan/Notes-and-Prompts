// 增量同步管理器 - 实现增量同步、冲突解决、离线支持
class IncrementalSyncManager {
  constructor() {
    this.deviceId = null;
    this.syncMeta = null;
    this.syncLog = [];
    this.pendingChanges = [];
    this.SYNC_VERSION = '3.0';
    this.MAX_SYNC_LOG = 100;
    this.TOMBSTONE_TTL_DAYS = 30;
    this.init();
  }

  async init() {
    await this.loadSyncMeta();
    console.log('增量同步管理器: 初始化完成', {
      deviceId: this.deviceId,
      lastSyncId: this.syncMeta?.lastSyncId
    });
  }

  // ========== 设备ID管理 ==========

  generateDeviceId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    const platform = navigator.platform.substring(0, 3).toLowerCase();
    return `dev_${platform}_${timestamp}_${random}`;
  }

  async getOrCreateDeviceId() {
    if (this.deviceId) return this.deviceId;
    
    const result = await chrome.storage.local.get(['syncDeviceId']);
    if (result.syncDeviceId) {
      this.deviceId = result.syncDeviceId;
    } else {
      this.deviceId = this.generateDeviceId();
      await chrome.storage.local.set({ syncDeviceId: this.deviceId });
    }
    return this.deviceId;
  }

  // ========== 同步元数据管理 ==========

  getDefaultSyncMeta() {
    return {
      version: this.SYNC_VERSION,
      deviceId: null,
      lastSyncId: null,
      lastSyncTime: 0,
      serverVersion: 0,
      dataChecksum: null,
      pendingChangesCount: 0
    };
  }

  async loadSyncMeta() {
    const result = await chrome.storage.local.get(['syncMeta', 'syncLog', 'pendingChanges']);
    this.syncMeta = result.syncMeta || this.getDefaultSyncMeta();
    this.syncLog = result.syncLog || [];
    this.pendingChanges = result.pendingChanges || [];
    
    if (!this.syncMeta.deviceId) {
      this.syncMeta.deviceId = await this.getOrCreateDeviceId();
    }
    this.deviceId = this.syncMeta.deviceId;
    
    return this.syncMeta;
  }

  async saveSyncMeta() {
    await chrome.storage.local.set({
      syncMeta: this.syncMeta,
      syncLog: this.syncLog,
      pendingChanges: this.pendingChanges
    });
  }

  // ========== 校验和计算 ==========

  async calculateChecksum(data) {
    const str = JSON.stringify(data, Object.keys(data).sort());
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  calculateItemChecksum(item) {
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

  // ========== 同步ID生成 ==========

  generateSyncId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `sync_${timestamp}_${random}`;
  }

  // ========== 变更追踪 ==========

  recordChange(action, itemType, item) {
    const change = {
      id: `chg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      action: action,
      itemType: itemType,
      itemId: item.id,
      itemVersion: item.version || 1,
      timestamp: Date.now(),
      deviceId: this.deviceId,
      checksum: item.checksum || this.calculateItemChecksum(item)
    };
    
    this.pendingChanges.push(change);
    this.syncMeta.pendingChangesCount = this.pendingChanges.length;
    this.saveSyncMeta();
    
    return change;
  }

  // ========== 同步日志 ==========

  addSyncLogEntry(entry) {
    const logEntry = {
      id: this.generateSyncId(),
      timestamp: Date.now(),
      deviceId: this.deviceId,
      ...entry
    };
    
    this.syncLog.unshift(logEntry);
    
    if (this.syncLog.length > this.MAX_SYNC_LOG) {
      this.syncLog = this.syncLog.slice(0, this.MAX_SYNC_LOG);
    }
    
    this.syncMeta.lastSyncId = logEntry.id;
    this.syncMeta.lastSyncTime = logEntry.timestamp;
    this.saveSyncMeta();
    
    return logEntry;
  }

  getSyncLogSince(sinceTimestamp) {
    return this.syncLog.filter(entry => entry.timestamp > sinceTimestamp);
  }

  // ========== 数据版本升级 ==========

  async migrateDataToV3(data) {
    if (!data || data.version === this.SYNC_VERSION) {
      return data;
    }
    
    console.log('增量同步管理器: 开始迁移数据到 v3');
    
    const migratedItems = (data.items || []).map(item => ({
      ...item,
      version: item.version || 1,
      checksum: item.checksum || this.calculateItemChecksum(item)
    }));
    
    const migratedDeletedItems = (data.deletedItems || []).map(t => ({
      ...t,
      version: t.version || 1
    }));
    
    const migratedData = {
      version: this.SYNC_VERSION,
      format: 'incremental',
      meta: {
        deviceId: await this.getOrCreateDeviceId(),
        lastSyncId: this.syncMeta.lastSyncId || null,
        lastSyncTime: this.syncMeta.lastSyncTime || 0,
        dataVersion: 1,
        checksum: await this.calculateChecksum({ items: migratedItems })
      },
      items: migratedItems,
      deletedItems: migratedDeletedItems,
      tags: data.tags || [],
      categories: data.categories || [],
      settings: data.settings || {},
      snapshotTime: Date.now()
    };
    
    console.log('增量同步管理器: 数据迁移完成', {
      itemsCount: migratedItems.length,
      deletedCount: migratedDeletedItems.length
    });
    
    return migratedData;
  }

  // ========== 增量检测 ==========

  async detectChanges(currentData, lastSyncData) {
    const changes = {
      created: [],
      updated: [],
      deleted: []
    };
    
    const currentItemsMap = new Map(currentData.items.map(item => [item.id, item]));
    const lastItemsMap = new Map((lastSyncData?.items || []).map(item => [item.id, item]));
    const currentDeletedIds = new Set((currentData.deletedItems || []).map(t => t.id));
    const lastDeletedIds = new Set((lastSyncData?.deletedItems || []).map(t => t.id));
    
    // 检测新增和更新
    for (const [id, item] of currentItemsMap) {
      const lastItem = lastItemsMap.get(id);
      
      if (!lastItem) {
        changes.created.push({
          action: 'create',
          item: item,
          timestamp: Date.now(),
          deviceId: this.deviceId
        });
      } else if (item.version > lastItem.version || item.checksum !== lastItem.checksum) {
        changes.updated.push({
          action: 'update',
          item: item,
          oldVersion: lastItem.version,
          newVersion: item.version,
          timestamp: Date.now(),
          deviceId: this.deviceId
        });
      }
    }
    
    // 检测删除
    for (const [id, lastItem] of lastItemsMap) {
      if (!currentItemsMap.has(id) || currentDeletedIds.has(id)) {
        if (!lastDeletedIds.has(id)) {
          changes.deleted.push({
            action: 'delete',
            itemId: id,
            itemType: lastItem.type,
            timestamp: Date.now(),
            deviceId: this.deviceId
          });
        }
      }
    }
    
    // 检测新的墓碑记录
    for (const tombstone of (currentData.deletedItems || [])) {
      if (!lastDeletedIds.has(tombstone.id)) {
        const alreadyRecorded = changes.deleted.some(c => c.itemId === tombstone.id);
        if (!alreadyRecorded) {
          changes.deleted.push({
            action: 'delete',
            itemId: tombstone.id,
            itemType: tombstone.type,
            timestamp: new Date(tombstone.deletedAt).getTime(),
            deviceId: this.deviceId
          });
        }
      }
    }
    
    return changes;
  }

  // ========== 冲突检测与解决 ==========

  detectConflict(localChange, remoteChange) {
    if (!localChange || !remoteChange) return null;
    if (localChange.itemId !== remoteChange.itemId) return null;
    
    if (localChange.action === 'delete' && remoteChange.action === 'update') {
      return { type: 'delete-update', local: localChange, remote: remoteChange };
    }
    if (localChange.action === 'update' && remoteChange.action === 'delete') {
      return { type: 'update-delete', local: localChange, remote: remoteChange };
    }
    if (localChange.action === 'update' && remoteChange.action === 'update') {
      if (localChange.checksum !== remoteChange.checksum) {
        return { type: 'update-update', local: localChange, remote: remoteChange };
      }
    }
    if (localChange.action === 'create' && remoteChange.action === 'create') {
      return { type: 'create-create', local: localChange, remote: remoteChange };
    }
    
    return null;
  }

  resolveConflict(conflict, strategy = 'newest') {
    const { type, local, remote } = conflict;
    
    switch (strategy) {
      case 'newest':
        return this.resolveByTimestamp(local, remote);
      case 'local':
        return { winner: 'local', change: local };
      case 'remote':
        return { winner: 'remote', change: remote };
      case 'manual':
        return { winner: 'manual', conflict: conflict };
      default:
        return this.resolveByTimestamp(local, remote);
    }
  }

  resolveByTimestamp(local, remote) {
    const localTime = local.timestamp || 0;
    const remoteTime = remote.timestamp || 0;
    
    if (remoteTime > localTime) {
      return { winner: 'remote', change: remote };
    } else if (localTime > remoteTime) {
      return { winner: 'local', change: local };
    } else {
      // 时间戳相同，比较校验和
      if (local.checksum !== remote.checksum) {
        return { winner: 'manual', conflict: { local, remote } };
      }
      return { winner: 'identical', change: local };
    }
  }

  // ========== 增量合并 ==========

  async mergeChanges(localData, remoteChanges) {
    const merged = {
      items: [...(localData.items || [])],
      deletedItems: [...(localData.deletedItems || [])],
      tags: new Set(localData.tags || []),
      categories: new Set(localData.categories || []),
      appliedCount: 0,
      skippedCount: 0,
      conflictCount: 0
    };
    
    const localItemMap = new Map(merged.items.map(item => [item.id, item]));
    const deletedIds = new Set(merged.deletedItems.map(t => t.id));
    
    for (const change of remoteChanges) {
      // 跳过本设备产生的变更
      if (change.deviceId === this.deviceId) {
        merged.skippedCount++;
        continue;
      }
      
      switch (change.action) {
        case 'create':
          if (!localItemMap.has(change.item.id) && !deletedIds.has(change.item.id)) {
            merged.items.push({
              ...change.item,
              version: change.item.version || 1
            });
            merged.appliedCount++;
          }
          break;
          
        case 'update':
          const existingItem = localItemMap.get(change.item.id);
          if (existingItem) {
            if (change.item.version > existingItem.version) {
              const index = merged.items.findIndex(i => i.id === change.item.id);
              if (index !== -1) {
                merged.items[index] = { ...change.item };
                merged.appliedCount++;
              }
            } else {
              merged.skippedCount++;
            }
          }
          break;
          
        case 'delete':
          if (!deletedIds.has(change.itemId)) {
            merged.items = merged.items.filter(i => i.id !== change.itemId);
            merged.deletedItems.push({
              id: change.itemId,
              type: change.itemType,
              deletedAt: new Date(change.timestamp).toISOString(),
              version: 1
            });
            merged.appliedCount++;
          }
          break;
      }
    }
    
    // 清理过期墓碑
    merged.deletedItems = this.cleanupOldTombstones(merged.deletedItems);
    
    return {
      ...merged,
      tags: Array.from(merged.tags),
      categories: Array.from(merged.categories)
    };
  }

  // ========== 墓碑清理 ==========

  cleanupOldTombstones(tombstones) {
    const ttlMs = this.TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - ttlMs;
    
    return tombstones.filter(t => {
      const deletedTime = new Date(t.deletedAt).getTime();
      return deletedTime > cutoffTime;
    });
  }

  // ========== 数据打包（用于上传）==========

  async prepareSyncPackage(data) {
    const syncId = this.generateSyncId();
    const deviceId = await this.getOrCreateDeviceId();
    
    const pkg = {
      version: this.SYNC_VERSION,
      format: 'incremental',
      meta: {
        syncId: syncId,
        deviceId: deviceId,
        timestamp: Date.now(),
        dataVersion: (this.syncMeta.serverVersion || 0) + 1,
        checksum: await this.calculateChecksum(data)
      },
      data: {
        items: data.items || [],
        deletedItems: data.deletedItems || [],
        tags: data.tags || [],
        categories: data.categories || [],
        settings: data.settings || {}
      },
      changes: this.pendingChanges,
      snapshotTime: Date.now()
    };
    
    return pkg;
  }

  // ========== 同步完成处理 ==========

  async completeSync(result) {
    this.pendingChanges = [];
    this.syncMeta.pendingChangesCount = 0;
    this.syncMeta.lastSyncTime = Date.now();
    
    if (result.serverVersion) {
      this.syncMeta.serverVersion = result.serverVersion;
    }
    
    this.addSyncLogEntry({
      type: 'sync_complete',
      success: result.success,
      uploaded: result.uploaded || 0,
      downloaded: result.downloaded || 0,
      conflicts: result.conflicts || 0
    });
    
    await this.saveSyncMeta();
  }

  // ========== 状态获取 ==========

  getStatus() {
    return {
      deviceId: this.deviceId,
      syncVersion: this.SYNC_VERSION,
      lastSyncTime: this.syncMeta?.lastSyncTime || 0,
      lastSyncId: this.syncMeta?.lastSyncId || null,
      pendingChangesCount: this.pendingChanges.length,
      serverVersion: this.syncMeta?.serverVersion || 0
    };
  }

  async getPendingChanges() {
    return this.pendingChanges;
  }
}

// 创建全局实例
const incrementalSyncManager = new IncrementalSyncManager();
