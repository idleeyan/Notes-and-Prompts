// 数据管理器 - 统一管理提示词和笔记
class DataManager {
  constructor() {
    this.items = [];
    this.deletedItems = [];
    this.settings = {
      injectMode: 'all',
      whitelist: [],
      blacklist: [],
      sidebarPosition: 'left',
      viewMode: 'list',
      blockedInputs: {},
      webdav: {
        enabled: false,
        serverUrl: '',
        username: '',
        password: '',
        syncPath: '/notebook-sync/',
        filename: 'notebook-data.json'
      }
    };
    this.tags = new Set();
    this.dataVersion = '3.0';
    this.syncManagerReady = false;
    this.ITEMS_CHUNK_PREFIX = 'items_chunk_';
    this.ITEMS_CHUNK_SIZE = 50;
  }

  async init() {
    await this.loadData();
    await this.migrateOldData();
    await this.ensureItemVersions();
  }

  async ensureItemVersions() {
    let needsSave = false;
    
    for (const item of this.items) {
      if (item.version === undefined) {
        item.version = 1;
        item.checksum = this.calculateItemChecksum(item);
        needsSave = true;
      }
    }
    
    for (const tombstone of this.deletedItems) {
      if (tombstone.version === undefined) {
        tombstone.version = 1;
        needsSave = true;
      }
    }
    
    if (needsSave) {
      console.log('数据管理器: 为现有数据添加版本号');
      await this.saveData();
    }
  }

  calculateItemChecksum(item) {
    return Utils.calculateItemChecksum(item);
  }

  recordSyncChange(action, item) {
  }

  // 加载数据
  async loadData() {
    const result = await chrome.storage.local.get([
      'settings', 'tags', 'prompts', 'notes',
      'webdavConfig', 'deletedItems', 'itemsChunkCount'
    ]);

    this.deletedItems = Array.isArray(result.deletedItems) ? result.deletedItems : [];

    // 加载分片 items
    this.items = await this.loadItemsChunks(result.itemsChunkCount);

    // 兼容旧格式：如果分片不存在，尝试加载旧的 items
    if (this.items.length === 0) {
      const oldResult = await chrome.storage.local.get(['items']);
      if (Array.isArray(oldResult.items) && oldResult.items.length > 0) {
        this.items = oldResult.items;
        console.log('DataManager: 从旧格式加载 items', this.items.length);
      }
    }

    try {
      if (typeof imageManager !== 'undefined') {
        const needsMigration = this.items.some(item =>
          (item.images && item.images.some(img => imageManager.isLargeImageData(img))) ||
          (item.previewImage && imageManager.isLargeImageData(item.previewImage))
        );

        if (needsMigration) {
          console.log('DataManager: 检测到内联图片数据，执行迁移');
          await imageManager.saveAllItemImages(this.items);
          const strippedItems = imageManager.stripImagesFromItems(this.items);
          this.items = strippedItems;
          await this.saveItemsChunks(strippedItems);
          await chrome.storage.local.remove(['items']);
          console.log('DataManager: 图片数据迁移完成');
        }

        const itemIds = this.items.map(item => item.id);
        const imagesMap = await imageManager.loadAllItemImages(itemIds);
        this.items = imageManager.restoreImagesToItems(this.items, imagesMap);
      }
    } catch (e) {
      console.error('DataManager: 图片数据处理失败，使用原始数据', e);
    }

    console.log('DataManager: 加载数据', {
      items: this.items.length,
      deletedItems: this.deletedItems.length,
      deletedIds: this.deletedItems.map(t => t.id)
    });

    this.settings = this.deepMerge(this.settings, result.settings || {});
    if (result.webdavConfig) {
      this.settings.webdav = this.deepMerge(this.settings.webdav || {}, result.webdavConfig);
    }
    this.tags = new Set(result.tags || []);

    this.extractTagsFromItems();
  }

  // 加载分片 items
  async loadItemsChunks(chunkCount) {
    if (!chunkCount || chunkCount <= 0) return [];
    const keys = [];
    for (let i = 0; i < chunkCount; i++) {
      keys.push(this.ITEMS_CHUNK_PREFIX + i);
    }
    const result = await chrome.storage.local.get(keys);
    let items = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunk = result[this.ITEMS_CHUNK_PREFIX + i];
      if (Array.isArray(chunk)) {
        items = items.concat(chunk);
      }
    }
    return items;
  }

  // 保存分片 items
  async saveItemsChunks(items) {
    const chunks = [];
    for (let i = 0; i < items.length; i += this.ITEMS_CHUNK_SIZE) {
      chunks.push(items.slice(i, i + this.ITEMS_CHUNK_SIZE));
    }

    const oldResult = await chrome.storage.local.get(['itemsChunkCount']);
    const oldChunkCount = oldResult.itemsChunkCount || 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        await chrome.storage.local.set({
          [this.ITEMS_CHUNK_PREFIX + i]: chunks[i]
        });
      } catch (e) {
        console.error(`saveItemsChunks: chunk ${i} 写入失败 (${JSON.stringify(chunks[i]).length} bytes)`, e);
        throw new Error(`数据分片 ${i} 写入失败: ${e.message}`);
      }
    }
    await chrome.storage.local.set({ itemsChunkCount: chunks.length });

    if (oldChunkCount > chunks.length) {
      const keysToRemove = [];
      for (let i = chunks.length; i < oldChunkCount; i++) {
        keysToRemove.push(this.ITEMS_CHUNK_PREFIX + i);
      }
      await chrome.storage.local.remove(keysToRemove);
    }
  }

  // 深度合并对象
  deepMerge(target, source) {
    return Utils.deepMerge(target, source);
  }

  // 从现有项目中提取标签
  extractTagsFromItems() {
    this.items.forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
          if (tag && tag.trim()) {
            this.tags.add(tag.trim());
          }
        });
      }
    });
  }

  // 迁移旧数据（从旧版本升级）
  async migrateOldData() {
    const result = await chrome.storage.local.get(['prompts']);
    if (result.prompts && result.prompts.length > 0) {
      // 将旧提示词转换为新格式
      const migratedItems = result.prompts.map(prompt => ({
        ...prompt,
        type: 'prompt',
        tags: prompt.tags || []
      }));
      
      this.items = [...this.items, ...migratedItems];
      await this.saveData();
      
      // 清除旧数据
      await chrome.storage.local.remove(['prompts']);
      console.log('数据迁移完成');
    }
  }

  async saveData(changedItemIds = null) {
    const existing = await chrome.storage.local.get(['syncConfig', 'webdavConfig']);

    let itemsToSave = this.items;
    if (typeof imageManager !== 'undefined') {
      if (changedItemIds) {
        const changedItems = this.items.filter(item => changedItemIds.includes(item.id));
        await imageManager.saveItemsImages(changedItems);
      } else {
        await imageManager.saveAllItemImages(this.items);
      }
      itemsToSave = imageManager.stripImagesFromItems(this.items);
    }

    await this.saveItemsChunks(itemsToSave);

    await chrome.storage.local.set({
      deletedItems: this.deletedItems,
      settings: this.settings,
      tags: Array.from(this.tags)
    });

    if (existing.syncConfig) {
      await chrome.storage.local.set({ syncConfig: existing.syncConfig });
    }

    if (existing.webdavConfig) {
      await chrome.storage.local.set({ webdavConfig: existing.webdavConfig });
    }
  }

  // ========== 提示词操作 ==========
  
  // 添加提示词
  async addPrompt(data) {
    const prompt = {
      id: this.generateId(),
      type: 'prompt',
      title: data.title,
      content: data.content,
      tags: data.tags ? [...data.tags] : [],
      previewImage: data.previewImage || '',
      generationInfo: data.generationInfo || null,
      version: 1,
      checksum: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    prompt.checksum = this.calculateItemChecksum(prompt);

    this.items.push(prompt);
    this.updateTags(prompt.tags);
    this.recordSyncChange('create', prompt);
    await this.saveData([prompt.id]);
    return prompt;
  }

  // 更新提示词
  async updatePrompt(id, data) {
    const index = this.items.findIndex(item => item.id === id && item.type === 'prompt');
    if (index === -1) return null;

    const updateData = { ...data };
    if (data.tags) {
      updateData.tags = [...data.tags];
    }

    const oldVersion = this.items[index].version || 1;

    this.items[index] = {
      ...this.items[index],
      ...updateData,
      version: oldVersion + 1,
      updatedAt: new Date().toISOString()
    };
    this.items[index].checksum = this.calculateItemChecksum(this.items[index]);

    if (updateData.tags) this.updateTags(updateData.tags);
    this.recordSyncChange('update', this.items[index]);
    await this.saveData([id]);
    return this.items[index];
  }

  // 获取所有提示词
  getPrompts() {
    return this.items.filter(item => item.type === 'prompt');
  }

  // ========== 笔记操作 ==========

  // 添加笔记
  async addNote(data) {
    const note = {
      id: this.generateId(),
      type: 'note',
      title: data.title,
      content: data.content,
      excerpt: data.excerpt || data.content.substring(0, 200) + '...',
      url: data.url || '',
      favicon: data.favicon || '',
      images: data.images ? [...data.images] : [],
      tags: data.tags ? [...data.tags] : [],
      clipType: data.clipType || 'text',
      remark: data.remark || '',
      version: 1,
      checksum: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    note.checksum = this.calculateItemChecksum(note);

    this.items.push(note);
    this.updateTags(note.tags);
    this.recordSyncChange('create', note);
    await this.saveData([note.id]);
    return note;
  }

  // 更新笔记
  async updateNote(id, data) {
    const index = this.items.findIndex(item => item.id === id && item.type === 'note');
    if (index === -1) return null;

    const updateData = { ...data };
    if (data.tags) {
      updateData.tags = [...data.tags];
    }
    if (data.images) {
      updateData.images = [...data.images];
    }

    const oldVersion = this.items[index].version || 1;
    
    this.items[index] = {
      ...this.items[index],
      ...updateData,
      version: oldVersion + 1,
      updatedAt: new Date().toISOString()
    };
    this.items[index].checksum = this.calculateItemChecksum(this.items[index]);

    if (updateData.tags) this.updateTags(updateData.tags);
    this.recordSyncChange('update', this.items[index]);
    await this.saveData([id]);
    return this.items[index];
  }

  // 获取所有笔记
  getNotes() {
    return this.items.filter(item => item.type === 'note');
  }

  // ========== 通用操作 ==========

  // 删除项目（记录墓碑）
  async deleteItem(id) {
    const item = this.items.find(item => item.id === id);
    if (item) {
      const tombstone = {
        id: id,
        type: item.type,
        deletedAt: new Date().toISOString(),
        version: (item.version || 1) + 1,
        checksum: item.checksum
      };
      this.deletedItems.push(tombstone);
      this.cleanupOldTombstones();
      this.recordSyncChange('delete', { ...item, version: tombstone.version });
      
      console.log('DataManager: 删除项目，添加墓碑', {
        itemId: id,
        tombstone: tombstone,
        totalDeletedItems: this.deletedItems.length
      });
    }
    this.items = this.items.filter(item => item.id !== id);
    if (typeof imageManager !== 'undefined') {
      await imageManager.deleteItemImages(id);
    }
    await this.saveData();
    
    // 验证保存成功
    const saved = await chrome.storage.local.get(['deletedItems']);
    console.log('DataManager: 保存后验证 deletedItems', {
      savedCount: saved.deletedItems?.length || 0,
      savedItems: saved.deletedItems?.map(t => t.id) || []
    });
  }

  // 清理过期的墓碑记录（30天前）
  cleanupOldTombstones() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.deletedItems = this.deletedItems.filter(t => 
      new Date(t.deletedAt).getTime() > thirtyDaysAgo
    );
  }

  // 检查项目是否已被删除
  isItemDeleted(id) {
    return this.deletedItems.some(t => t.id === id);
  }

  // 获取单个项目
  getItem(id) {
    return this.items.find(item => item.id === id);
  }

  // 搜索项目（支持提示词和笔记联合搜索）
  searchItems(query, filters = {}) {
    let results = this.items;

    // 类型过滤
    if (filters.type) {
      results = results.filter(item => item.type === filters.type);
    }

    // 标签过滤
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(item =>
        filters.tags.some(tag => item.tags.includes(tag))
      );
    }

    // 关键词搜索
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(item =>
        item.title.toLowerCase().includes(lowerQuery) ||
        item.content.toLowerCase().includes(lowerQuery) ||
        item.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      );
    }

    // 按更新时间排序
    results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return results;
  }

  // 更新标签集合
  updateTags(tags) {
    if (tags && Array.isArray(tags)) {
      tags.forEach(tag => {
        if (tag && tag.trim()) {
          this.tags.add(tag.trim());
        }
      });
    }
  }

  extractKeywords(text, maxKeywords = 5) {
    if (!text || typeof text !== 'string') return [];

    const stopWords = new Set([
      '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
      '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
      '自己', '这', '那', '它', '他', '她', '吗', '呢', '吧', '啊', '哦', '嗯', '噢',
      '什么', '怎么', '这个', '那个', '这样', '那样', '如何', '为什么', '因为', '所以',
      '如果', '虽然', '但是', '然而', '而且', '或者', '还是', '以及', '关于', '对于',
      '从', '向', '对', '与', '和', '把', '被', '让', '给', '替', '按', '根据',
      '年', '月', '日', '时', '分', '秒', '号', '期', '周', '次', '些', '种',
      '可以', '能够', '应该', '必须', '需要', '可能', '一定', '大概', '也许',
      '已经', '正在', '将要', '曾经', '刚才', '现在', '今天', '明天', '昨天',
      '这里', '那里', '哪里', '哪个', '哪些', '怎样', '怎么样'
    ]);

    const wordFreq = new Map();
    const cnCharRegex = /[\u4e00-\u9fa5]+/g;
    let match;

    while ((match = cnCharRegex.exec(text)) !== null) {
      const word = match[0];
      if (word.length >= 2 && word.length <= 6 && !stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    const words = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);

    return words;
  }

  // 获取所有标签
  getAllTags() {
    return Array.from(this.tags);
  }

  // 导出数据到固定文件夹
  async exportData() {
    const data = {
      items: this.items,
      deletedItems: this.deletedItems,
      tags: Array.from(this.tags),
      settings: {
        injectMode: this.settings.injectMode,
        whitelist: this.settings.whitelist,
        blacklist: this.settings.blacklist,
        sidebarPosition: this.settings.sidebarPosition,
        viewMode: this.settings.viewMode,
        blockedInputs: this.settings.blockedInputs || {}
      },
      exportDate: new Date().toISOString(),
      version: '3.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(':').slice(0, 2).join('');
    const filename = `NotebookBackup/notebook_backup_${date}_${time}.json`;

    try {
      const downloadId = await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      });

      // 等待下载完成并获取文件路径
      return new Promise((resolve) => {
        chrome.downloads.onChanged.addListener(function onChanged(delta) {
          if (delta.id === downloadId && delta.state && delta.state.current === 'complete') {
            chrome.downloads.onChanged.removeListener(onChanged);
            chrome.downloads.search({ id: downloadId }, (results) => {
              if (results && results[0]) {
                resolve({
                  success: true,
                  filename: results[0].filename,
                  filepath: results[0].filename
                });
              } else {
                resolve({ success: true, filename: filename });
              }
            });
          }
        });

        // 超时处理
        setTimeout(() => {
          resolve({ success: true, filename: filename });
        }, 3000);
      });
    } catch (error) {
      console.error('导出失败:', error);
      throw error;
    }
  }

  // 从固定文件夹导入数据
  async importDataFromFolder() {
    return new Promise((resolve, reject) => {
      // 创建文件输入元素
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.webkitdirectory = true; // 允许选择文件夹
      input.directory = true;

      input.onchange = async (e) => {
        const files = Array.from(e.target.files);

        // 筛选备份文件夹中的JSON文件
        const backupFiles = files.filter(file =>
          file.name.endsWith('.json') &&
          (file.name.includes('notebook_backup') || file.name.includes('prompts_backup'))
        );

        if (backupFiles.length === 0) {
          reject(new Error('未找到备份文件'));
          return;
        }

        // 按修改时间排序，选择最新的文件
        backupFiles.sort((a, b) => b.lastModified - a.lastModified);
        const latestFile = backupFiles[0];

        try {
          const result = await this.importData(latestFile);
          resolve({
            ...result,
            filename: latestFile.name
          });
        } catch (error) {
          reject(error);
        }
      };

      input.click();
    });
  }

  // 导入数据（从文件对象或数据对象）- 使用ID去重
  async importData(source) {
    // 如果传入的是文件对象（Blob），先读取并解析
    if (source instanceof Blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = JSON.parse(e.target.result);
            const result = await this.processImportData(data);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsText(source);
      });
    }

    // 如果传入的是已解析的数据对象
    if (source && typeof source === 'object') {
      return this.processImportData(source);
    }

    return Promise.reject(new Error('无效的导入数据'));
  }

  // 处理导入数据（核心逻辑）
  async processImportData(data) {
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let deletedCount = 0;

    // 合并项目墓碑记录
    if (data.deletedItems && Array.isArray(data.deletedItems)) {
      const localDeletedMap = new Map(this.deletedItems.map(t => [t.id, t]));
      data.deletedItems.forEach(remoteTombstone => {
        const localTombstone = localDeletedMap.get(remoteTombstone.id);
        if (!localTombstone || new Date(remoteTombstone.deletedAt) > new Date(localTombstone.deletedAt)) {
          localDeletedMap.set(remoteTombstone.id, remoteTombstone);
        }
      });
      this.deletedItems = Array.from(localDeletedMap.values());
    }

    // 创建已删除ID集合
    const deletedIds = new Set(this.deletedItems.map(t => t.id));

    if (data.items && Array.isArray(data.items)) {
      const existingItemsMap = new Map(this.items.map(item => [item.id, item]));

      data.items.forEach(newItem => {
        if (deletedIds.has(newItem.id)) {
          deletedCount++;
          return;
        }
        
        if (!newItem.id) {
          newItem.id = this.generateId();
          this.items.push(newItem);
          addedCount++;
        } else if (existingItemsMap.has(newItem.id)) {
          const existingItem = existingItemsMap.get(newItem.id);
          const newTime = new Date(newItem.updatedAt || 0);
          const existingTime = new Date(existingItem.updatedAt || 0);

          if (newTime > existingTime) {
            const index = this.items.findIndex(item => item.id === newItem.id);
            if (index !== -1) {
              this.items[index] = newItem;
              updatedCount++;
            }
          } else {
            skippedCount++;
          }
        } else {
          this.items.push(newItem);
          addedCount++;
        }
      });

      this.items = this.items.filter(item => !deletedIds.has(item.id));
    }

    if (data.tags && Array.isArray(data.tags)) {
      data.tags.forEach(tag => this.tags.add(tag));
    }

    if (data.settings && typeof data.settings === 'object') {
      this.settings = this.deepMerge(this.settings, data.settings);
    }

    // 清理过期墓碑
    this.cleanupOldTombstones();
    
    await this.saveData();
    return {
      success: true,
      added: addedCount,
      updated: updatedCount,
      skipped: skippedCount,
      deleted: deletedCount,
      total: data.items?.length || 0
    };
  }

  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// 创建全局数据管理器实例
const dataManager = new DataManager();
