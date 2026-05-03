// 笔记收藏与提示词管理器 - Popup 主逻辑
class PopupManager {
  constructor() {
    this.selectedTags = new Set();
    this.init();
  }

  async init() {
    // 初始化数据管理器
    await dataManager.init();

    // 绑定事件
    this.bindEvents();

    // 加载初始数据
    this.renderPromptsList();
  }

  // 绑定事件
  bindEvents() {
    // 搜索和筛选
    document.getElementById('search-prompt').addEventListener('input', () => {
      this.renderPromptsList();
    });

    // 列表项点击事件（事件委托）
    document.getElementById('prompts-list').addEventListener('click', (e) => {
      this.handleItemClick(e, 'prompt');
    });

    // 图片预览点击事件（事件委托）
    document.getElementById('prompts-list').addEventListener('click', (e) => {
      const imageWrapper = e.target.closest('.item-image[data-preview]');
      if (imageWrapper) {
        e.stopPropagation();
        this.openImagePreview(imageWrapper.dataset.preview);
      }
    });

    // 图片预览弹窗关闭事件
    const previewModal = document.getElementById('image-preview-modal');
    previewModal.querySelector('.image-preview-overlay').addEventListener('click', () => {
      this.closeImagePreview();
    });
    previewModal.querySelector('.image-preview-close').addEventListener('click', () => {
      this.closeImagePreview();
    });

    // 一级入口按钮
    const quickNoteBtn = document.getElementById('quick-note-btn');
    if (quickNoteBtn) {
      quickNoteBtn.addEventListener('click', () => {
        this.openQuickNotePage();
      });
    }

    const viewNotesBtn = document.getElementById('view-notes-btn');
    if (viewNotesBtn) {
      viewNotesBtn.addEventListener('click', () => {
        this.openNotesPage();
      });
    }

    // 收藏当前网页按钮
    const clipPageBtn = document.getElementById('clip-page-btn');
    if (clipPageBtn) {
      clipPageBtn.addEventListener('click', () => {
        this.openClipPage('content');
      });
    }
  }

  // 渲染提示词列表
  renderPromptsList() {
    const container = document.getElementById('prompts-list');
    const searchTerm = document.getElementById('search-prompt').value;

    const prompts = dataManager.searchItems(searchTerm, { type: 'prompt' });

    if (prompts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💡</div>
          <div>暂无提示词</div>
          <div style="font-size: 12px; color: #999; margin-top: 8px;">请在管理页面中添加提示词</div>
        </div>
      `;
      return;
    }

    container.innerHTML = prompts.map(prompt => this.renderItemCard(prompt)).join('');
  }

  // 渲染项目卡片
  renderItemCard(item) {
    const isPrompt = item.type === 'prompt';
    const metaInfo = isPrompt
      ? `<span>💡 提示词</span>`
      : `<img src="${item.favicon || ''}" alt="" onerror="this.style.display='none'"><span>${new URL(item.url || 'http://example.com').hostname}</span>`;

    const tagsHtml = item.tags && item.tags.length > 0
      ? `<div class="item-tags">${item.tags.map(tag => `<span class="item-tag">${tag}</span>`).join('')}</div>`
      : '';

    let imageHtml = '';
    if (!isPrompt && item.images && item.images.length > 0) {
      const imageUrl = item.images[0];
      imageHtml = `
        <div class="item-image" data-preview="${this.escapeHtml(imageUrl)}">
          <img src="${this.escapeHtml(imageUrl)}" alt="图片" loading="lazy">
          ${item.images.length > 1 ? `<div class="item-image-count">+${item.images.length - 1}</div>` : ''}
        </div>
      `;
    } else if (isPrompt && item.previewImage) {
      imageHtml = `
        <div class="item-image item-image-preview" data-preview="${this.escapeHtml(item.previewImage)}">
          <img src="${this.escapeHtml(item.previewImage)}" alt="预览效果" loading="lazy">
        </div>
      `;
    }

    return `
      <div class="item-card" data-id="${item.id}" data-type="${item.type}">
        <div class="item-header">
          <span class="item-title">${this.escapeHtml(item.title)}</span>
        </div>
        ${imageHtml}
        <div class="item-content">${this.escapeHtml(item.excerpt || item.content)}</div>
        <div class="item-meta">${metaInfo}</div>
        ${tagsHtml}
        <div class="item-actions">
          ${isPrompt ? `<button class="btn btn-use" data-action="use">使用</button>` : `<button class="btn btn-use" data-action="open">打开</button>`}
          <button class="btn btn-edit" data-action="edit">编辑</button>
          <button class="btn btn-danger" data-action="delete">删除</button>
        </div>
      </div>
    `;
  }

  // 处理列表项点击
  handleItemClick(e, type) {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const card = button.closest('.item-card');
    if (!card) return;

    const id = card.dataset.id;
    const action = button.dataset.action;

    switch (action) {
      case 'use':
        this.usePrompt(id);
        break;
      case 'open':
        this.openNote(id);
        break;
      case 'edit':
        this.editItem(id, type);
        break;
      case 'delete':
        this.deleteItem(id);
        break;
    }
  }

  // 使用提示词
  async usePrompt(id) {
    const prompt = dataManager.getItem(id);
    if (!prompt) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        action: 'fillInput',
        content: prompt.content
      });
      this.showToast('提示词已发送到页面');
    } catch (error) {
      // 复制到剪贴板作为备选
      navigator.clipboard.writeText(prompt.content);
      this.showToast('已复制到剪贴板');
    }
  }

  // 打开笔记链接
  openNote(id) {
    const note = dataManager.getItem(id);
    if (note && note.url) {
      chrome.tabs.create({ url: note.url });
    }
  }

  // 编辑项目
  editItem(id, type) {
    const editUrl = chrome.runtime.getURL(`notes.html?edit=${type}&id=${id}`);
    chrome.tabs.create({ url: editUrl });
  }

  // 删除项目
  async deleteItem(id) {
    if (!confirm('确定要删除吗？')) return;
    
    await dataManager.deleteItem(id);
    this.renderPromptsList();
    this.showToast('已删除');
  }

  // 打开收藏页面
  async openClipPage(type) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      this.showToast('无法收藏此页面', 'error');
      return;
    }

    const clipUrl = chrome.runtime.getURL(`clip.html?tabId=${tab.id}&type=${type}`);
    chrome.runtime.sendMessage({
      action: 'openEditWindow',
      url: clipUrl
    });
  }

  // 打开快速添加笔记页面
  openQuickNotePage() {
    const quickNoteUrl = chrome.runtime.getURL('quick-note.html');
    chrome.runtime.sendMessage({
      action: 'openEditWindow',
      url: quickNoteUrl
    });
  }

  // 打开笔记管理页面
  openNotesPage() {
    const notesUrl = chrome.runtime.getURL('notes.html');
    chrome.tabs.create({ url: notesUrl });
  }

  // 打开图片预览
  openImagePreview(imageUrl) {
    const modal = document.getElementById('image-preview-modal');
    const img = document.getElementById('image-preview-img');
    img.src = imageUrl;
    modal.classList.add('active');
  }

  // 关闭图片预览
  closeImagePreview() {
    const modal = document.getElementById('image-preview-modal');
    modal.classList.remove('active');
    document.getElementById('image-preview-img').src = '';
  }

  // HTML转义
  escapeHtml(text) {
    return Utils.escapeHtml(text);
  }

  showToast(message, type = 'success') {
    Utils.showToast(message, type);
  }
}

// 初始化
const popupManager = new PopupManager();
