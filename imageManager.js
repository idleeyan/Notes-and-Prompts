class ImageManager {
  constructor() {
    this.IMAGE_KEY_PREFIX = 'img_';
    this.ITEM_META_PREFIX = 'itemImgMeta_';
    this.CHUNK_SIZE = 7000; // 每个分片约7KB，留有余量避免超限
  }

  isLargeImageData(str) {
    return typeof str === 'string' && str.startsWith('data:image/');
  }

  stripImagesFromItem(item) {
    const stripped = { ...item };
    if (stripped.images && Array.isArray(stripped.images)) {
      const hasLargeImages = stripped.images.some(img => this.isLargeImageData(img));
      if (hasLargeImages) {
        stripped._hasImages = true;
        stripped.images = stripped.images.map(img =>
          this.isLargeImageData(img) ? '' : img
        );
      }
    }
    if (stripped.previewImage && this.isLargeImageData(stripped.previewImage)) {
      stripped._hasPreviewImage = true;
      stripped.previewImage = '';
    }
    return stripped;
  }

  stripImagesFromItems(items) {
    return items.map(item => this.stripImagesFromItem(item));
  }

  getImageKey(itemId, index) {
    return this.IMAGE_KEY_PREFIX + itemId + '_' + index;
  }

  getPreviewImageKey(itemId) {
    return this.IMAGE_KEY_PREFIX + itemId + '_preview';
  }

  getMetaKey(itemId) {
    return this.ITEM_META_PREFIX + itemId;
  }

  // 将大字符串分片
  chunkString(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.substring(i, i + size));
    }
    return chunks;
  }

  // 保存分片数据到 storage
  async saveChunks(baseKey, data) {
    const chunks = this.chunkString(data, this.CHUNK_SIZE);
    const keysToSave = {};

    for (let i = 0; i < chunks.length; i++) {
      keysToSave[baseKey + '_chunk_' + i] = chunks[i];
    }

    await chrome.storage.local.set(keysToSave);
    return chunks.length;
  }

  // 从 storage 加载分片数据
  async loadChunks(baseKey, chunkCount) {
    const keys = [];
    for (let i = 0; i < chunkCount; i++) {
      keys.push(baseKey + '_chunk_' + i);
    }

    const result = await chrome.storage.local.get(keys);
    let data = '';
    for (let i = 0; i < chunkCount; i++) {
      const chunk = result[baseKey + '_chunk_' + i];
      if (chunk !== undefined) {
        data += chunk;
      }
    }
    return data;
  }

  // 删除分片数据
  async deleteChunks(baseKey, chunkCount) {
    const keysToRemove = [];
    for (let i = 0; i < chunkCount; i++) {
      keysToRemove.push(baseKey + '_chunk_' + i);
    }
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  }

  async saveItemImages(itemId, imageData) {
    const meta = { imageCount: 0, hasPreview: false, images: [], preview: null };

    // 先删除旧的图片数据
    await this.deleteItemImages(itemId);

    if (imageData.images && Array.isArray(imageData.images)) {
      let imgIndex = 0;
      for (let i = 0; i < imageData.images.length; i++) {
        const img = imageData.images[i];
        if (this.isLargeImageData(img)) {
          const imageKey = this.getImageKey(itemId, imgIndex);
          const chunkCount = await this.saveChunks(imageKey, img);
          meta.images.push({ index: imgIndex, originalIndex: i, chunkCount });
          imgIndex++;
        }
      }
      meta.imageCount = imgIndex;
    }

    if (imageData.previewImage && this.isLargeImageData(imageData.previewImage)) {
      const previewKey = this.getPreviewImageKey(itemId);
      const chunkCount = await this.saveChunks(previewKey, imageData.previewImage);
      meta.preview = { chunkCount };
      meta.hasPreview = true;
    }

    if (meta.imageCount > 0 || meta.hasPreview) {
      await chrome.storage.local.set({ [this.getMetaKey(itemId)]: meta });
    }
  }

  async saveItemsImages(items) {
    for (const item of items) {
      const imageData = this.extractImageData(item);
      if (imageData) {
        await this.saveItemImages(item.id, imageData);
      }
    }
  }

  async saveAllItemImages(items) {
    for (const item of items) {
      const imageData = this.extractImageData(item);
      if (imageData) {
        await this.saveItemImages(item.id, imageData);
      }
    }
  }

  async loadItemImages(itemId) {
    const metaResult = await chrome.storage.local.get(this.getMetaKey(itemId));
    const meta = metaResult[this.getMetaKey(itemId)];
    if (!meta) return null;

    const data = {};

    // 兼容旧格式
    if (meta.imageCount > 0 && !meta.images) {
      // 旧格式直接存储
      data.images = [];
      for (let i = 0; i < meta.imageCount; i++) {
        const img = await this.loadSingleImageOldFormat(itemId, i);
        if (img) data.images.push(img);
      }
    } else if (meta.images && meta.images.length > 0) {
      // 新分片格式
      data.images = [];
      for (const imgMeta of meta.images) {
        const imageKey = this.getImageKey(itemId, imgMeta.index);
        const img = await this.loadChunks(imageKey, imgMeta.chunkCount);
        if (img) {
          // 确保按原始索引位置放置
          while (data.images.length <= imgMeta.originalIndex) {
            data.images.push('');
          }
          data.images[imgMeta.originalIndex] = img;
        }
      }
    }

    if (meta.hasPreview) {
      if (meta.preview && meta.preview.chunkCount) {
        const previewKey = this.getPreviewImageKey(itemId);
        const preview = await this.loadChunks(previewKey, meta.preview.chunkCount);
        if (preview) data.previewImage = preview;
      } else {
        // 旧格式
        const preview = await this.loadSingleImageOldFormat(itemId, 'preview');
        if (preview) data.previewImage = preview;
      }
    }

    return Object.keys(data).length > 0 ? data : null;
  }

  async loadSingleImageOldFormat(itemId, index) {
    const key = this.getImageKey(itemId, index);
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  }

  async loadAllItemImages(itemIds) {
    if (!itemIds || itemIds.length === 0) return {};
    const imagesMap = {};
    for (const itemId of itemIds) {
      const imageData = await this.loadItemImages(itemId);
      if (imageData) {
        imagesMap[itemId] = imageData;
      }
    }
    return imagesMap;
  }

  extractImageData(item) {
    const data = {};
    if (item.images && Array.isArray(item.images)) {
      const largeImages = item.images.filter(img => this.isLargeImageData(img));
      if (largeImages.length > 0) {
        data.images = [...item.images];
      }
    }
    if (item.previewImage && this.isLargeImageData(item.previewImage)) {
      data.previewImage = item.previewImage;
    }
    return Object.keys(data).length > 0 ? data : null;
  }

  restoreImagesToItem(item, imageData) {
    if (!imageData) return item;
    const restored = { ...item };
    if (restored._hasImages && imageData.images) {
      restored.images = imageData.images;
      delete restored._hasImages;
    }
    if (restored._hasPreviewImage && imageData.previewImage) {
      restored.previewImage = imageData.previewImage;
      delete restored._hasPreviewImage;
    }
    return restored;
  }

  restoreImagesToItems(items, imagesMap) {
    return items.map(item => {
      const imageData = imagesMap[item.id];
      return imageData ? this.restoreImagesToItem(item, imageData) : item;
    });
  }

  async deleteItemImages(itemId) {
    const metaResult = await chrome.storage.local.get(this.getMetaKey(itemId));
    const meta = metaResult[this.getMetaKey(itemId)];
    const keysToRemove = [this.getMetaKey(itemId)];

    if (meta) {
      // 删除新格式的分片
      if (meta.images) {
        for (const imgMeta of meta.images) {
          const imageKey = this.getImageKey(itemId, imgMeta.index);
          if (imgMeta.chunkCount) {
            await this.deleteChunks(imageKey, imgMeta.chunkCount);
          } else {
            keysToRemove.push(imageKey);
          }
        }
      } else {
        // 旧格式
        for (let i = 0; i < (meta.imageCount || 0); i++) {
          keysToRemove.push(this.getImageKey(itemId, i));
        }
      }

      if (meta.hasPreview) {
        const previewKey = this.getPreviewImageKey(itemId);
        if (meta.preview && meta.preview.chunkCount) {
          await this.deleteChunks(previewKey, meta.preview.chunkCount);
        } else {
          keysToRemove.push(previewKey);
        }
      }
    }

    await chrome.storage.local.remove(keysToRemove);
  }

  async deleteMultipleItemImages(itemIds) {
    for (const itemId of itemIds) {
      await this.deleteItemImages(itemId);
    }
  }

  async migrateInlineImages(items) {
    let migrated = false;
    for (const item of items) {
      const imageData = this.extractImageData(item);
      if (imageData) {
        migrated = true;
        await this.saveItemImages(item.id, imageData);
      }
    }
    return migrated;
  }

  async getOrphanedImageKeys(itemIds) {
    const allKeys = await this.getAllImageKeys();
    const validPrefixes = new Set(itemIds.map(id => this.IMAGE_KEY_PREFIX + id + '_'));
    return allKeys.filter(key => {
      return !Array.from(validPrefixes).some(prefix => key.startsWith(prefix));
    });
  }

  async getAllImageKeys() {
    const allData = await chrome.storage.local.get(null);
    return Object.keys(allData).filter(key =>
      key.startsWith(this.IMAGE_KEY_PREFIX) || key.startsWith(this.ITEM_META_PREFIX)
    );
  }

  async cleanupOrphanedImages(items) {
    const itemIds = items.map(item => item.id);
    const orphanedKeys = await this.getOrphanedImageKeys(itemIds);
    if (orphanedKeys.length > 0) {
      await chrome.storage.local.remove(orphanedKeys);
    }
    return orphanedKeys.length;
  }
}

const imageManager = new ImageManager();
