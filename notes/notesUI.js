// UI 渲染模块
class NotesUI {
  constructor(manager) {
    this.manager = manager;
  }

  render() {
    this.renderTagCloud();
    this.renderItems();
    this.manager.updateCounts();
    this.manager.updateViewToggle();
    this.manager.updateTagFilterIndicator();
  }

  renderTagCloud() {
    const container = document.getElementById('tag-cloud');
    if (!container) return;

    const tags = dataManager.getAllTags();

    if (tags.length === 0) {
      container.innerHTML = '<p style="color: #999; font-size: 12px;">暂无标签</p>';
      return;
    }

    // 标签筛选模式下额外显示一个"清除筛选"按钮
    let headerHtml = '';
    if (this.manager.tagFilterMode) {
      headerHtml = `
        <div class="tag-filter-indicator">
          <span class="tag-filter-badge">标签筛选: ${this.manager.escapeHtml(this.manager.currentTag)}</span>
          <button class="tag-filter-clear" id="clear-tag-filter">✕ 清除</button>
        </div>
      `;
    }

    const tagsHtml = tags.map(tag => {
      const escapedTag = this.manager.escapeHtml(tag);
      return `
        <span class="tag-item ${this.manager.currentTag === tag ? 'active' : ''}" data-tag="${escapedTag}">
          ${escapedTag}
        </span>
      `;
    }).join('');

    container.innerHTML = headerHtml + tagsHtml;

    // 绑定清除按钮
    const clearBtn = document.getElementById('clear-tag-filter');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.manager.selectTag(this.manager.currentTag);
      });
    }

    container.querySelectorAll('.tag-item').forEach(tag => {
      tag.addEventListener('click', () => {
        this.manager.selectTag(tag.dataset.tag);
      });
    });
  }

  renderItems() {
    const container = document.getElementById('items-container');
    const emptyState = document.getElementById('empty-state');

    if (!container || !emptyState) return;

    if (this.manager.filteredItems.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    if (this.manager.currentType === 'gallery') {
      container.className = 'gallery-grid';
      container.innerHTML = this.manager.filteredItems.map(item => this.createGalleryItem(item)).join('');
      this.bindGalleryEvents();
      return;
    }

    if (this.manager.currentType === 'sticky') {
      container.className = 'sticky-grid';
      container.innerHTML = this.manager.filteredItems.map(item => this.createStickyCard(item)).join('');
      container.querySelectorAll('.sticky-card').forEach(card => {
        card.addEventListener('click', () => {
          this.manager.openNote(card.dataset.id);
        });
      });
      return;
    }

    container.className = this.manager.viewMode === 'grid' ? 'notes-grid' : 'notes-list';

    // 标签筛选模式下，根据每项的实际类型渲染
    if (this.manager.tagFilterMode) {
      container.innerHTML = this.manager.filteredItems.map(item => {
        if (item.clipType === 'sticky') {
          return this.createStickyCard(item);
        } else if (item.type === 'prompt') {
          return this.createPromptCard(item);
        } else {
          return this.createNoteCard(item);
        }
      }).join('');

      container.querySelectorAll('.note-card, .prompt-card, .sticky-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.id;
          // 判断类型
          const item = this.manager.filteredItems.find(i => i.id === id);
          if (item) {
            if (item.type === 'prompt') {
              this.manager.openPrompt(id);
            } else {
              this.manager.openNote(id);
            }
          }
        });
      });
      return;
    }

    container.innerHTML = this.manager.filteredItems.map(item => {
      if (this.manager.currentType === 'notes') {
        return this.createNoteCard(item);
      } else {
        return this.createPromptCard(item);
      }
    }).join('');

    container.querySelectorAll('.note-card, .prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        if (this.manager.currentType === 'notes') {
          this.manager.openNote(card.dataset.id);
        } else {
          this.manager.openPrompt(card.dataset.id);
        }
      });
    });
  }

  createNoteCard(note) {
    const date = new Date(note.updatedAt || note.createdAt).toLocaleDateString('zh-CN');
    const tagsHtml = note.tags && note.tags.length > 0
      ? note.tags.map(tag => `<span class="tag">${this.manager.escapeHtml(tag)}</span>`).join('')
      : '';

    let contentPreview = '';
    let imageHtml = '';
    const hasImages = note.images && note.images.length > 0;

    if (hasImages) {
      const imageUrl = note.images[0];
      imageHtml = `<div class="note-image"><img src="${this.manager.escapeHtml(imageUrl)}" alt="图片" loading="lazy"></div>`;
      if (note.images.length > 1) {
        imageHtml += `<div class="image-count">+${note.images.length - 1}</div>`;
      }
    }

    contentPreview = note.content ? this.manager.stripHtml(note.content).substring(0, hasImages ? 60 : 100) + (note.content.length > (hasImages ? 60 : 100) ? '...' : '') : '';

    return `
      <div class="note-card" data-id="${note.id}">
        <div class="note-header">
          <h3 class="note-title">${this.manager.escapeHtml(note.title)}</h3>
        </div>
        ${imageHtml}
        <div class="note-content">${this.manager.escapeHtml(contentPreview)}</div>
        <div class="note-footer">
          <div class="note-tags">${tagsHtml}</div>
          <div class="note-date">${date}</div>
        </div>
      </div>
    `;
  }

  createStickyCard(sticky) {
    const date = new Date(sticky.updatedAt || sticky.createdAt).toLocaleDateString('zh-CN');
    const time = new Date(sticky.updatedAt || sticky.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    const content = sticky.content || '';
    
    const colors = ['#fff9c4', '#c8e6c9', '#b3e5fc', '#f8bbd0', '#e1bee7', '#ffe0b2', '#d7ccc8'];
    const colorIndex = sticky.title ? sticky.title.length % colors.length : 0;
    const bgColor = colors[colorIndex];
    
    return `
      <div class="sticky-card" data-id="${sticky.id}" style="background-color: ${bgColor}">
        <div class="sticky-content">${this.manager.escapeHtml(content)}</div>
        <div class="sticky-footer">
          <span class="sticky-date">${date} ${time}</span>
        </div>
      </div>
    `;
  }

  createPromptCard(prompt) {
    const date = new Date(prompt.updatedAt || prompt.createdAt).toLocaleDateString('zh-CN');
    const tagsHtml = prompt.tags && prompt.tags.length > 0
      ? prompt.tags.map(tag => `<span class="tag">${this.manager.escapeHtml(tag)}</span>`).join('')
      : '';
    const contentPreview = prompt.content ? prompt.content.substring(0, 80) + (prompt.content.length > 80 ? '...' : '') : '';

    let previewImageHtml = '';
    if (prompt.previewImage) {
      let paramsHtml = '';
      if (prompt.generationInfo) {
        const params = [];
        if (prompt.generationInfo.model) params.push(`模型: ${prompt.generationInfo.model}`);
        if (prompt.generationInfo.steps) params.push(`步数: ${prompt.generationInfo.steps}`);
        if (prompt.generationInfo.cfgScale) params.push(`CFG: ${prompt.generationInfo.cfgScale}`);
        if (prompt.generationInfo.sampler) params.push(`采样器: ${prompt.generationInfo.sampler}`);
        if (prompt.generationInfo.seed) params.push(`种子: ${prompt.generationInfo.seed}`);
        if (params.length > 0) {
          paramsHtml = `
            <div class="prompt-generation-params">
              ${params.map(p => `<span class="param">${this.manager.escapeHtml(p)}</span>`).join('')}
            </div>
          `;
        }
      }

      previewImageHtml = `
        <div class="prompt-preview-image">
          <img src="${this.manager.escapeHtml(prompt.previewImage)}" alt="预览效果" loading="lazy">
          ${paramsHtml ? `<div class="prompt-preview-info">${paramsHtml}</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="prompt-card" data-id="${prompt.id}">
        ${previewImageHtml}
        <div class="prompt-header">
          <h3 class="prompt-title">${this.manager.escapeHtml(prompt.title)}</h3>
        </div>
        <div class="prompt-content">${this.manager.escapeHtml(contentPreview)}</div>
        <div class="prompt-footer">
          <div class="prompt-tags">${tagsHtml}</div>
          <div class="prompt-date">${date}</div>
        </div>
      </div>
    `;
  }

  createGalleryItem(image) {
    const date = new Date(image.createdAt).toLocaleDateString('zh-CN');
    return `
      <div class="gallery-item" data-note-id="${image.noteId}" data-image-src="${this.manager.escapeHtml(image.src)}">
        <div class="gallery-image-wrapper">
          <img src="${this.manager.escapeHtml(image.src)}" alt="${this.manager.escapeHtml(image.noteTitle)}" loading="lazy">
        </div>
        <div class="gallery-info">
          <h4 class="gallery-title">${this.manager.escapeHtml(image.noteTitle)}</h4>
          <span class="gallery-date">${date}</span>
        </div>
      </div>
    `;
  }

  bindGalleryEvents() {
    const container = document.getElementById('items-container');
    container.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const noteId = item.dataset.noteId;
        const imageSrc = item.dataset.imageSrc;
        this.manager.openImageViewer(imageSrc, noteId);
      });
    });
  }

  openImageViewer(imageSrc, noteId) {
    // 获取当前笔记的所有图片
    const note = dataManager.getItem(noteId);
    const images = note && note.images ? note.images : [imageSrc];
    const currentIndex = images.indexOf(imageSrc);
    
    const modal = document.createElement('div');
    modal.className = 'modal image-viewer-modal active';
    document.body.appendChild(modal);

    const updateViewer = (index) => {
      const img = images[index];
      modal.innerHTML = `
        <div class="modal-content image-viewer-content">
          <button class="image-viewer-close">&times;</button>
          ${index > 0 ? '<button class="image-viewer-nav prev" id="prev-image">❮</button>' : ''}
          ${index < images.length - 1 ? '<button class="image-viewer-nav next" id="next-image">❯</button>' : ''}
          <img src="${this.manager.escapeHtml(img)}" alt="查看图片">
          <div class="image-viewer-counter">${index + 1} / ${images.length}</div>
          <div class="image-viewer-actions">
            <button class="btn btn-primary" id="view-source-note">查看来源笔记</button>
            <button class="btn btn-secondary" id="close-image-viewer">关闭</button>
          </div>
        </div>
      `;
      
      // 绑定事件
      modal.querySelector('.image-viewer-close').addEventListener('click', () => modal.remove());
      modal.querySelector('#close-image-viewer').addEventListener('click', () => modal.remove());
      modal.querySelector('#view-source-note').addEventListener('click', () => {
        modal.remove();
        this.manager.openNote(noteId);
      });
      
      if (index > 0) {
        modal.querySelector('#prev-image').addEventListener('click', () => updateViewer(index - 1));
      }
      if (index < images.length - 1) {
        modal.querySelector('#next-image').addEventListener('click', () => updateViewer(index + 1));
      }
    };

    updateViewer(currentIndex);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // 键盘导航
    const handleKeydown = (e) => {
      if (e.key === 'Escape') modal.remove();
      if (e.key === 'ArrowLeft' && currentIndex > 0) updateViewer(currentIndex - 1);
      if (e.key === 'ArrowRight' && currentIndex < images.length - 1) updateViewer(currentIndex + 1);
    };
    document.addEventListener('keydown', handleKeydown);
    modal.addEventListener('remove', () => document.removeEventListener('keydown', handleKeydown));
  }
}

if (typeof window !== 'undefined') {
  window.NotesUI = NotesUI;
}
