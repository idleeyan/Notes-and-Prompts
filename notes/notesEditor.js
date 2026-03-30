// 笔记编辑模块
class NotesEditor {
  constructor(manager) {
    this.manager = manager;
  }

  openNote(id) {
    const note = dataManager.items.find(n => n.id === id);
    if (!note) return;

    this.manager.viewingId = id;

    document.getElementById('view-note-title').textContent = note.title;

    const contentEl = document.getElementById('view-note-content');
    const imagesEl = document.getElementById('view-note-images');
    const hasImages = note.images && note.images.length > 0;
    
    if (hasImages) {
      imagesEl.innerHTML = note.images.map(img => `
        <div class="view-image-item">
          <img src="${this.manager.escapeHtml(img)}" alt="图片" loading="lazy" onclick="window.open('${this.manager.escapeHtml(img)}', '_blank')">
        </div>
      `).join('');
      imagesEl.style.display = 'grid';
    } else {
      imagesEl.innerHTML = '';
      imagesEl.style.display = 'none';
    }

    if (note.clipType === 'image' && hasImages) {
      contentEl.innerHTML = '';
    } else {
      const content = note.content || '';
      if (content.includes('<') && content.includes('>')) {
        contentEl.innerHTML = content;
      } else if (typeof marked !== 'undefined') {
        contentEl.innerHTML = marked.parse(content);
      } else {
        contentEl.textContent = content;
      }
    }

    const tagsEl = document.getElementById('view-note-tags');
    if (note.tags && note.tags.length > 0) {
      tagsEl.innerHTML = note.tags.map(tag => `<span class="view-tag">${this.manager.escapeHtml(tag)}</span>`).join('');
    } else {
      tagsEl.innerHTML = '';
    }

    const sourceEl = document.getElementById('view-note-source');
    if (note.source || note.url) {
      sourceEl.innerHTML = `
        ${note.source ? `<p>来源：${this.manager.escapeHtml(note.source)}</p>` : ''}
        ${note.url ? `<p>链接：<a href="${this.manager.escapeHtml(note.url)}" target="_blank">${this.manager.escapeHtml(note.url)}</a></p>` : ''}
      `;
    } else {
      sourceEl.innerHTML = '';
    }

    document.getElementById('view-note-meta').innerHTML = `
      <p>创建时间：${new Date(note.createdAt).toLocaleString('zh-CN')}</p>
      ${note.updatedAt ? `<p>更新时间：${new Date(note.updatedAt).toLocaleString('zh-CN')}</p>` : ''}
    `;

    document.getElementById('view-modal').classList.add('active');
  }

  closeViewModal() {
    document.getElementById('view-modal').classList.remove('active');
    this.manager.viewingId = null;
  }

  async deleteItemFromView() {
    if (!confirm('确定要删除这条笔记吗？')) return;

    const viewingId = this.manager.viewingId;
    await dataManager.deleteItem(viewingId);
    await dataManager.loadData();
    this.manager.loadItems();
    this.manager.render();
    this.closeViewModal();
    this.manager.showToast('笔记已删除');
  }

  openEditModal(id) {
    const note = dataManager.items.find(n => n.id === id);
    if (!note) return;

    this.manager.editingId = id;
    this.manager.currentTags = note.tags ? [...note.tags] : [];
    this.manager.editingImages = note.images ? [...note.images] : [];
    this.manager.editingClipType = note.clipType;

    document.getElementById('edit-note-title').value = note.title;
    document.getElementById('edit-note-source').value = note.source || '';

    this.renderEditTags();
    this.renderEditImages();

    document.getElementById('note-meta').innerHTML = `
      <p>创建时间：${new Date(note.createdAt).toLocaleString('zh-CN')}</p>
      <p>更新时间：${new Date(note.updatedAt || note.createdAt).toLocaleString('zh-CN')}</p>
    `;

    const saveBtn = document.getElementById('save-note-btn');
    if (saveBtn) {
      saveBtn.textContent = '保存';
      saveBtn.disabled = false;
    }

    document.getElementById('note-modal').classList.add('active');

    this.initNoteEditor(note.content || '', note.clipType);
  }

  openNoteEditInTab(id) {
    const url = chrome.runtime.getURL(`note-edit.html?id=${id}`);
    window.open(url, '_blank');
  }

  closeEditModal() {
    document.getElementById('note-modal').classList.remove('active');
    this.manager.editingId = null;
    this.manager.currentTags = [];
    this.manager.editingImages = [];

    if (this.manager.noteEnhancedEditor) {
      this.manager.noteEnhancedEditor.destroy();
      this.manager.noteEnhancedEditor = null;
    }
  }

  initNoteEditor(content, clipType = 'normal') {
    const textarea = document.getElementById('edit-note-content');
    if (!textarea) return;

    textarea.value = content || '';

    // 只有便签(clipType === 'sticky')使用纯文本编辑器
    // 其他类型都使用 EnhancedEditor
    if (clipType === 'sticky') {
      textarea.style.height = '200px';
      textarea.style.resize = 'vertical';
      textarea.style.width = '100%';
      textarea.style.padding = '12px';
      textarea.style.border = '1px solid #ddd';
      textarea.style.borderRadius = '6px';
      textarea.style.fontFamily = 'inherit';
      textarea.style.fontSize = '14px';
      textarea.style.lineHeight = '1.6';
      return;
    }

    // 其他类型使用 EnhancedEditor（如果可用）
    if (typeof EnhancedEditor !== 'undefined') {
      this.manager.noteEnhancedEditor = new EnhancedEditor(textarea, {
        placeholder: '输入笔记内容，支持富文本和 Markdown 格式、拖拽/粘贴图片',
        minHeight: '200px',
        maxHeight: '400px',
        defaultMode: 'richtext',
        enableMarkdown: true,
        enableRichText: true,
        enableAutosave: false,
        autosaveInterval: 30000,
        onSave: () => {
          this.saveNote();
        }
      });

      if (content) {
        this.manager.noteEnhancedEditor.setContent(content);
      }
    }
  }

  getEditorContent() {
    if (this.manager.noteEnhancedEditor) {
      return this.manager.noteEnhancedEditor.getContent().trim();
    }
    const textarea = document.getElementById('edit-note-content');
    return textarea ? textarea.value : '';
  }

  renderEditImages() {
    const imagesGroup = document.getElementById('edit-images-group');
    const imagesGrid = document.getElementById('edit-images-grid');
    
    if (this.manager.editingImages && this.manager.editingImages.length > 0) {
      imagesGroup.style.display = 'block';
      imagesGrid.innerHTML = this.manager.editingImages.map((img, index) => `
        <div class="edit-image-item" draggable="true" data-index="${index}">
          <img src="${this.manager.escapeHtml(img)}" alt="图片" loading="lazy">
          <button class="delete-image-btn" data-index="${index}" title="删除图片">×</button>
          <div class="drag-handle">⋮⋮</div>
        </div>
      `).join('');
      
      imagesGrid.querySelectorAll('.delete-image-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(btn.dataset.index);
          this.deleteImage(index);
        });
      });
      
      this.setupDragAndDrop(imagesGrid);
    } else {
      imagesGroup.style.display = 'none';
      imagesGrid.innerHTML = '';
    }
  }

  deleteImage(index) {
    if (confirm('确定要删除这张图片吗？')) {
      this.manager.editingImages.splice(index, 1);
      this.renderEditImages();
      this.manager.showToast('图片已删除');
    }
  }

  setupDragAndDrop(container) {
    let draggedItem = null;
    let draggedIndex = null;
    
    container.querySelectorAll('.edit-image-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        draggedIndex = parseInt(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        draggedItem = null;
        draggedIndex = null;
        this.renderEditImages();
      });
      
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedItem || item === draggedItem) return;
        
        const targetIndex = parseInt(item.dataset.index);
        const items = Array.from(container.children);
        const draggedCurrentIndex = items.indexOf(draggedItem);
        const targetElement = items[targetIndex];
        
        if (draggedCurrentIndex < targetIndex) {
          container.insertBefore(draggedItem, targetElement.nextSibling);
        } else {
          container.insertBefore(draggedItem, targetElement);
        }
      });
      
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedItem || item === draggedItem) return;
        
        const targetIndex = parseInt(item.dataset.index);
        const temp = this.manager.editingImages[draggedIndex];
        this.manager.editingImages.splice(draggedIndex, 1);
        this.manager.editingImages.splice(targetIndex, 0, temp);
      });
    });
  }

  renderEditTags() {
    const container = document.getElementById('note-tags-container') || document.getElementById('edit-tags-list');
    if (!container) return;

    const inputContainer = container.querySelector('.tags-input-wrapper') || container;
    inputContainer.innerHTML = this.manager.currentTags.map(tag => `
      <span class="tag-item">
        ${tag}
        <span class="remove-tag" data-tag="${tag}">×</span>
      </span>
    `).join('');

    container.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeTag(btn.dataset.tag);
      });
    });
  }

  addTag(tag) {
    if (!this.manager.currentTags.includes(tag)) {
      this.manager.currentTags.push(tag);
      this.renderEditTags();
    }
  }

  removeTag(tag) {
    this.manager.currentTags = this.manager.currentTags.filter(t => t !== tag);
    this.renderEditTags();
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
    return '未命名';
  }

  async saveNote() {
    let title = document.getElementById('edit-note-title').value.trim();
    let content = this.getEditorContent();
    const source = document.getElementById('edit-note-source').value.trim();

    if (!title) {
      title = this.buildAutoTitle(content, this.manager.currentTags, this.manager.editingImages);
      document.getElementById('edit-note-title').value = title;
    }

    const saveBtn = document.getElementById('save-note-btn');
    if (saveBtn) {
      saveBtn.textContent = '保存中...';
      saveBtn.disabled = true;
    }

    try {
      const keywords = dataManager.extractKeywords(title + ' ' + content, 5);
      const autoTags = keywords.filter(k => !this.manager.currentTags.includes(k));
      const finalTags = [...this.manager.currentTags, ...autoTags];

      if (this.manager.editingId) {
        const updateData = {
          title: title,
          content: content,
          tags: finalTags,
          source: source,
          remark: source,
          excerpt: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          images: [...this.manager.editingImages]
        };
        await dataManager.updateNote(this.manager.editingId, updateData);
      }

      this.manager.loadItems();
      this.manager.render();
      this.closeEditModal();
      this.manager.showToast(autoTags.length > 0 ? `✅ 笔记已保存，自动添加标签：${autoTags.join(', ')}` : '✅ 笔记已保存');

    } catch (error) {
      console.error('保存笔记失败:', error);
      this.manager.showToast('❌ 保存失败');
      if (saveBtn) {
        saveBtn.textContent = '保存';
        saveBtn.disabled = false;
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.NotesEditor = NotesEditor;
}
