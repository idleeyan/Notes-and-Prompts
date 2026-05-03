// 网页收藏页面逻辑 - 一体化收藏（内容+图片）
class ClipPage {
  constructor() {
    this.tabId = null;
    this.noteId = null;
    this.pageInfo = null;
    this.selectedImages = new Set();
    this.currentTags = [];
    this.isEditMode = false;
    this.detectedContentType = 'article'; // 智能检测到的内容类型
    this.allPageImages = []; // 存储所有页面图片信息
    this.imagesExpanded = true; // 图片区域是否展开
    this.init();
  }

  async init() {
    // 从 URL 获取参数
    const urlParams = new URLSearchParams(window.location.search);
    this.tabId = parseInt(urlParams.get('tabId'));
    this.noteId = urlParams.get('id');

    // 获取特定类型的数据（需要解码）
    this.clipData = {
      text: urlParams.get('text') ? decodeURIComponent(urlParams.get('text')) : null,
      html: urlParams.get('html') ? decodeURIComponent(urlParams.get('html')) : null,
      linkUrl: urlParams.get('linkUrl') ? decodeURIComponent(urlParams.get('linkUrl')) : null,
      linkText: urlParams.get('linkText') ? decodeURIComponent(urlParams.get('linkText')) : null,
      imageUrl: urlParams.get('imageUrl') ? decodeURIComponent(urlParams.get('imageUrl')) : null
    };

    // 加载数据管理器
    await this.loadDataManager();

    // 如果有id参数，是编辑模式
    if (this.noteId) {
      this.isEditMode = true;
      await this.loadExistingNote();
    } else if (this.tabId) {
      // 新建收藏模式
      await this.fetchPageInfo();
    } else {
      this.showToast('未找到页面信息', 'error');
      return;
    }

    // 绑定事件
    this.bindEvents();
  }

  // 加载已有笔记数据（编辑模式）
  async loadExistingNote() {
    try {
      const note = dataManager.getItem(this.noteId);
      if (!note || note.type !== 'note') {
        this.showToast('收藏不存在', 'error');
        return;
      }

      this.pageInfo = {
        title: note.title,
        url: note.url,
        favicon: note.favicon,
        content: note.content
      };

      // 填充表单
      document.getElementById('page-title').textContent = note.title;
      document.getElementById('page-favicon').src = note.favicon || '';
      document.getElementById('note-title').value = note.title;
      document.getElementById('note-url').value = note.url || '';
      document.getElementById('note-content').value = note.content || '';
      document.getElementById('note-remark').value = note.remark || '';

      // 加载标签
      if (note.tags && note.tags.length > 0) {
        this.currentTags = [...note.tags];
        this.renderTags();
      }

      // 加载已选图片
      if (note.images && note.images.length > 0) {
        this.selectedImages = new Set(note.images);
      }

      // 检测内容类型并更新指示器
      this.detectedContentType = note.clipType || 'article';
      this.updateContentTypeIndicator();

      // 隐藏提取和选择按钮（编辑模式不需要）
      const contentActions = document.querySelector('.content-actions');
      if (contentActions) {
        contentActions.style.display = 'none';
      }

      // 隐藏图片区域（编辑模式下不显示图片选择）
      const imagesCollapsible = document.getElementById('images-collapsible');
      if (imagesCollapsible) {
        imagesCollapsible.style.display = 'none';
      }

      // 修改页面标题
      document.querySelector('h1').textContent = '📝 编辑收藏';

      // 加载推荐标签
      this.loadSuggestedTags();
    } catch (error) {
      console.error('加载收藏失败:', error);
      this.showToast('加载收藏失败', 'error');
    }
  }

  // 加载数据管理器
  async loadDataManager() {
    if (typeof dataManager === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'dataManager.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    await dataManager.init();
  }

  // 智能检测内容类型
  detectContentType() {
    // 优先根据传入的数据判断
    if (this.clipData.imageUrl) {
      return 'image';
    }
    if (this.clipData.text || this.clipData.html) {
      return 'selected-text';
    }
    if (this.clipData.linkUrl) {
      return 'link';
    }
    return 'article';
  }

  // 获取内容类型显示信息
  getContentTypeInfo(type) {
    const typeMap = {
      'selected-text': { icon: '📝', text: '选中文本', hint: '检测到页面选中的文本内容' },
      'link': { icon: '🔗', text: '链接', hint: '检测到链接地址' },
      'article': { icon: '📄', text: '文章', hint: '自动提取页面正文内容' },
      'image': { icon: '🖼️', text: '图片', hint: '检测到图片内容' }
    };
    return typeMap[type] || typeMap['article'];
  }

  // 获取页面信息
  async fetchPageInfo() {
    try {
      const response = await chrome.tabs.sendMessage(this.tabId, { action: 'getPageInfo' });
      this.pageInfo = response;
      
      // 智能检测内容类型
      this.detectedContentType = this.detectContentType();
      
      // 处理数据
      let title = response.title;
      let content = '';
      let url = response.url;
      
      // 如果有右键点击图片，自动选中
      if (this.clipData.imageUrl) {
        this.selectedImages.add(this.clipData.imageUrl);
        // 如果是图片模式，标题默认为页面标题
        title = response.title;
      }
      
      switch (this.detectedContentType) {
        case 'selected-text':
          // 选中文本 - 优先使用HTML格式保留原有格式
          if (this.clipData.html) {
            content = this.clipData.html;
          } else if (this.clipData.text) {
            content = this.clipData.text;
          } else {
            content = response.content || '';
          }
          title = (this.clipData.text || content).substring(0, 30) + 
                  ((this.clipData.text || content).length > 30 ? '...' : '') || response.title;
          break;

        case 'link':
          // 链接
          url = this.clipData.linkUrl || response.url;
          content = this.clipData.linkText || '';
          title = this.clipData.linkText || this.clipData.linkUrl || response.title;
          break;

        case 'image':
          // 图片模式 - 内容可以为空或保留页面正文作为上下文
          content = response.content || '';
          break;

        case 'article':
        default:
          // 文章，使用页面正文（优先使用HTML格式保留样式）
          if (response.contentHtml) {
            content = response.contentHtml;
            this.originalHtmlContent = response.contentHtml; // 保存原始HTML以便清除样式
          } else {
            content = response.content || '';
          }
          break;
      }
      
      // 填充表单
      document.getElementById('page-title').textContent = response.title;
      document.getElementById('page-favicon').src = response.favicon || '';
      document.getElementById('note-title').value = title;
      document.getElementById('note-url').value = url;
      document.getElementById('note-content').value = content;
      
      // 根据内容类型显示/隐藏清除样式按钮
      this.updateClearFormatButton();
      
      // 更新内容类型指示器
      this.updateContentTypeIndicator();
      
      // 加载页面图片
      this.allPageImages = response.images || [];
      this.loadImages(this.allPageImages);
      
      // 根据是否有选中图片更新界面
      this.updateImagesUI();
      
      // 加载推荐标签
      this.loadSuggestedTags();
    } catch (error) {
      console.error('获取页面信息失败:', error);
      this.showToast('获取页面信息失败', 'error');
    }
  }

  // 更新内容类型指示器
  updateContentTypeIndicator() {
    const badge = document.getElementById('detected-type-badge');
    const hint = document.querySelector('.detected-hint');
    
    if (!badge || !hint) return;
    
    const typeInfo = this.getContentTypeInfo(this.detectedContentType);
    
    badge.innerHTML = `
      <span class="badge-icon">${typeInfo.icon}</span>
      <span class="badge-text">${typeInfo.text}</span>
    `;
    
    hint.textContent = typeInfo.hint;
  }

  // 更新图片区域UI
  updateImagesUI() {
    const countEl = document.getElementById('selected-count');
    if (countEl) {
      const count = this.selectedImages.size;
      countEl.textContent = count > 0 ? `(${count})` : '';
      countEl.style.display = count > 0 ? 'inline' : 'none';
    }
  }

  // 绑定事件
  bindEvents() {
    // 提取正文按钮
    document.getElementById('extract-content-btn').addEventListener('click', () => {
      this.extractContent();
    });

    // 选择内容按钮
    document.getElementById('select-content-btn').addEventListener('click', () => {
      this.selectContent();
    });

    // 清除样式按钮
    const clearFormatBtn = document.getElementById('clear-format-btn');
    if (clearFormatBtn) {
      clearFormatBtn.addEventListener('click', () => {
        this.clearFormat();
      });
    }

    // 图片区域折叠/展开
    const imagesToggle = document.getElementById('images-toggle');
    if (imagesToggle) {
      imagesToggle.addEventListener('click', () => {
        this.toggleImagesSection();
      });
    }

    // 全选图片
    const selectAllBtn = document.getElementById('select-all-images');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        this.allPageImages.forEach(img => this.selectedImages.add(img.src));
        this.refreshImageSelection();
        this.updateImagesUI();
      });
    }

    // 取消全选
    const deselectAllBtn = document.getElementById('deselect-all-images');
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        this.selectedImages.clear();
        this.refreshImageSelection();
        this.updateImagesUI();
      });
    }

    // 标签输入
    const tagsInput = document.getElementById('note-tags');
    tagsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = tagsInput.value.trim();
        if (tag) {
          this.addTag(tag);
          tagsInput.value = '';
        }
      }
    });

    // 保存按钮
    document.getElementById('save-btn').addEventListener('click', () => {
      this.saveNote();
    });

    // 取消按钮
    document.getElementById('cancel-btn').addEventListener('click', () => {
      window.close();
    });
  }

  // 切换图片区域展开/折叠
  toggleImagesSection() {
    this.imagesExpanded = !this.imagesExpanded;
    const content = document.getElementById('images-content');
    const arrow = document.getElementById('toggle-arrow');
    
    if (content) {
      content.style.display = this.imagesExpanded ? 'block' : 'none';
    }
    if (arrow) {
      arrow.textContent = this.imagesExpanded ? '▼' : '▶';
    }
  }

  // 提取正文
  async extractContent() {
    try {
      const response = await chrome.tabs.sendMessage(this.tabId, { action: 'extractArticle' });
      if (response.content) {
        document.getElementById('note-content').value = response.content;
        this.updateClearFormatButton();
        this.showToast('正文提取成功');
        
        // 更新检测到的类型为文章
        this.detectedContentType = 'article';
        this.updateContentTypeIndicator();
      }
    } catch (error) {
      this.showToast('提取正文失败', 'error');
    }
  }

  // 选择页面内容
  async selectContent() {
    try {
      await chrome.tabs.sendMessage(this.tabId, { action: 'startContentSelection' });
      window.close(); // 关闭窗口让用户选择内容
    } catch (error) {
      this.showToast('启动选择模式失败', 'error');
    }
  }

  // 加载页面图片
  loadImages(images) {
    const grid = document.getElementById('images-grid');
    
    // 如果右键点击的图片不在页面图片列表中，添加它到开头
    if (this.clipData.imageUrl && !images.find(img => img.src === this.clipData.imageUrl)) {
      images.unshift({
        src: this.clipData.imageUrl,
        width: 0,
        height: 0,
        isMainImage: true
      });
    }
    
    // 存储所有图片
    this.allPageImages = images;
    
    if (images.length === 0) {
      // 没有图片时隐藏整个图片区域
      const imagesCollapsible = document.getElementById('images-collapsible');
      if (imagesCollapsible) {
        imagesCollapsible.style.display = 'none';
      }
      return;
    }

    // 按尺寸排序，大图在前
    const sortedImages = [...images].sort((a, b) => {
      const areaA = (a.width || 0) * (a.height || 0);
      const areaB = (b.width || 0) * (b.height || 0);
      return areaB - areaA;
    });

    grid.innerHTML = sortedImages.map((img, index) => `
      <div class="image-item ${this.selectedImages.has(img.src) ? 'selected' : ''} ${img.isMainImage ? 'main-image' : ''}" 
           data-src="${img.src}" 
           data-index="${index}"
           title="${img.width && img.height ? `${img.width}×${img.height}` : '尺寸未知'}">
        <img src="${img.src}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'">
        <div class="checkmark">✓</div>
        ${img.isMainImage ? '<div class="main-badge">当前</div>' : ''}
        ${img.width && img.height ? `<div class="image-dims">${img.width}×${img.height}</div>` : ''}
      </div>
    `).join('');

    // 绑定图片选择事件
    grid.querySelectorAll('.image-item').forEach(item => {
      item.addEventListener('click', () => {
        const src = item.dataset.src;
        if (this.selectedImages.has(src)) {
          this.selectedImages.delete(src);
          item.classList.remove('selected');
        } else {
          this.selectedImages.add(src);
          item.classList.add('selected');
        }
        this.updateImagesUI();
        this.updateImagesStats();
      });
    });
    
    this.updateImagesStats();
    this.updateImagesUI();
  }

  // 刷新图片选择状态
  refreshImageSelection() {
    const grid = document.getElementById('images-grid');
    if (!grid) return;
    
    grid.querySelectorAll('.image-item').forEach(item => {
      const src = item.dataset.src;
      item.classList.toggle('selected', this.selectedImages.has(src));
    });
    
    this.updateImagesStats();
  }

  // 更新图片统计
  updateImagesStats() {
    const statsEl = document.getElementById('images-stats');
    if (statsEl) {
      statsEl.textContent = `已选 ${this.selectedImages.size} / ${this.allPageImages.length} 张`;
    }
  }

  // 加载推荐标签
  loadSuggestedTags() {
    const allTags = dataManager.getAllTags();
    const container = document.getElementById('suggested-tags');
    
    if (allTags.length === 0) {
      container.style.display = 'none';
      return;
    }

    const label = container.querySelector('.suggested-label');
    container.innerHTML = '';
    container.appendChild(label);
    
    allTags.slice(0, 10).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'suggested-tag';
      span.textContent = tag;
      span.addEventListener('click', () => this.addTag(tag));
      container.appendChild(span);
    });
  }

  // 添加标签
  addTag(tag) {
    if (!this.currentTags.includes(tag)) {
      this.currentTags.push(tag);
      this.renderTags();
    }
  }

  // 移除标签
  removeTag(tag) {
    this.currentTags = this.currentTags.filter(t => t !== tag);
    this.renderTags();
  }

  // 渲染标签
  renderTags() {
    const container = document.getElementById('tags-list');
    container.innerHTML = this.currentTags.map(tag => `
      <span class="tag-item">
        ${tag}
        <span class="remove-tag" data-tag="${tag}">×</span>
      </span>
    `).join('');

    // 绑定移除事件
    container.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeTag(btn.dataset.tag);
      });
    });
  }

  buildAutoTitle(content, tags, images) {
    const text = (content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) {
      return text.substring(0, 30) + (text.length > 30 ? '...' : '');
    }
    if (tags && tags.length > 0) {
      return tags[0];
    }
    if (images && images.length > 0) {
      return `图片收藏 ${images.length}`;
    }
    return this.pageInfo?.title || '未命名';
  }

  // 保存笔记
  async saveNote() {
    let title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const remark = document.getElementById('note-remark').value.trim();

    const selectedImagesArray = Array.from(this.selectedImages);
    if (!title) {
      title = this.buildAutoTitle(content, this.currentTags, selectedImagesArray);
      document.getElementById('note-title').value = title;
    }

    try {
      if (this.isEditMode && this.noteId) {
        // 编辑模式：更新现有笔记
        const existingNote = dataManager.getItem(this.noteId);
        if (!existingNote) {
          this.showToast('收藏不存在', 'error');
          return;
        }

        const updatedNote = {
          ...existingNote,
          title,
          content: content,
          excerpt: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          url: document.getElementById('note-url').value.trim() || existingNote.url,
          tags: this.currentTags,
          images: Array.from(this.selectedImages),
          remark,
          updatedAt: new Date().toISOString()
        };

        // 更新数据
        const index = dataManager.items.findIndex(item => item.id === this.noteId);
        if (index !== -1) {
          dataManager.items[index] = updatedNote;
          // 更新标签集合
          dataManager.updateTags(this.currentTags);
          await dataManager.saveData();
          this.showToast('收藏已更新！', 'success');
        }
      } else {
        // 新建模式：添加新笔记
        // 如果有选中的图片，在内容后面添加图片引用
        let finalContent = content;

        if (selectedImagesArray.length > 0) {
          // 如果内容不为空，先换行
          if (finalContent) {
            finalContent += '\n\n';
          }
          // 添加图片引用
          finalContent += selectedImagesArray.map(url => `![图片](${url})`).join('\n\n');
        }

        const finalExcerpt = content.substring(0, 200) + (content.length > 200 ? '...' : '') ||
                            (selectedImagesArray.length > 0 ? `[${selectedImagesArray.length}张图片]` : '');

        const noteData = {
          title,
          content: finalContent,
          excerpt: finalExcerpt,
          url: this.pageInfo.url,
          favicon: this.pageInfo.favicon,
          images: selectedImagesArray,
          tags: this.currentTags,
          clipType: this.detectedContentType,
          remark
        };

        await dataManager.addNote(noteData);
        this.showToast('收藏成功！', 'success');
      }

      // 通知后台刷新
      chrome.runtime.sendMessage({ action: 'settingsChanged' });

      setTimeout(() => window.close(), 1500);
    } catch (error) {
      console.error('保存失败:', error);
      this.showToast('保存失败', 'error');
    }
  }

  // 显示提示
  showToast(message, type = 'success') {
    Utils.showToast(message, type);
  }

  // 更新清除样式按钮的显示状态
  updateClearFormatButton() {
    const clearFormatBtn = document.getElementById('clear-format-btn');
    if (!clearFormatBtn) return;
    
    const content = document.getElementById('note-content').value;
    // 检查内容是否包含 HTML 标签
    const hasHtmlTags = /<[^>]+>/.test(content);
    
    if (hasHtmlTags) {
      clearFormatBtn.style.display = 'inline-block';
    } else {
      clearFormatBtn.style.display = 'none';
    }
  }

  // 清除 HTML 样式，转换为纯文本
  clearFormat() {
    const contentTextarea = document.getElementById('note-content');
    const htmlContent = contentTextarea.value;
    
    // 创建临时元素来提取纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // 获取纯文本内容
    let plainText = tempDiv.innerText || tempDiv.textContent || '';
    
    // 清理多余的空白
    plainText = plainText
      .replace(/\n\s*\n/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
    
    // 更新文本框内容
    contentTextarea.value = plainText;
    
    // 隐藏清除样式按钮
    const clearFormatBtn = document.getElementById('clear-format-btn');
    if (clearFormatBtn) {
      clearFormatBtn.style.display = 'none';
    }
    
    this.showToast('已清除样式，转换为纯文本', 'success');
  }
}

// 初始化
const clipPage = new ClipPage();
