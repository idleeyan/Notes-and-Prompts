class NoteEdit {
  constructor() {
    this.noteId = null;
    this.enhancedEditor = null;
    this.tagEditor = null;
    this.currentTags = [];
    this.editingImages = [];
    this.isSaved = false;
    this.init();
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    this.noteId = urlParams.get('id');

    await this.loadDataManager();
    await this.loadData();
    this.initEditor();
    this.bindEvents();
  }

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

  async loadData() {
    if (this.noteId) {
      const note = dataManager.getItem(this.noteId);
      if (!note || note.type !== 'note') {
        this.showToast('笔记不存在', 'error');
        return;
      }

      this.noteData = note;
      this.currentTags = note.tags ? [...note.tags] : [];
      this.editingImages = note.images ? [...note.images] : [];

      document.getElementById('edit-title').value = note.title;
      document.getElementById('edit-source').value = note.source || '';

      this.renderImages();

      document.getElementById('meta-info').innerHTML = `
        <p>创建时间：${new Date(note.createdAt).toLocaleString('zh-CN')}</p>
        ${note.updatedAt ? `<p>更新时间：${new Date(note.updatedAt).toLocaleString('zh-CN')}</p>` : ''}
      `;

      document.title = `编辑笔记 - ${note.title}`;
    } else {
      document.title = '新建笔记 - 笔记收藏与提示词管理器';
    }
  }

  initEditor() {
    const textarea = document.getElementById('edit-content');

    if (this.noteData && this.noteData.content) {
      textarea.value = this.noteData.content;
    }

    if (typeof EnhancedEditor !== 'undefined') {
      this.enhancedEditor = new EnhancedEditor(textarea, {
        placeholder: '输入笔记内容，支持富文本和 Markdown 格式、拖拽/粘贴图片',
        minHeight: '400px',
        maxHeight: '600px',
        defaultMode: 'richtext',
        enableMarkdown: true,
        enableRichText: true,
        enableAutosave: false,
        autosaveInterval: 30000,
        onSave: () => this.saveNote()
      });
    }

    this.initTagEditor();
  }

  initTagEditor() {
    const container = document.getElementById('tags-container');
    if (!container) return;

    if (typeof TagEditor !== 'undefined') {
      this.tagEditor = new TagEditor(container, {
        tags: this.currentTags,
        suggestions: dataManager.getAllTags(),
        placeholder: '输入标签，按回车添加',
        onChange: (tags) => {
          this.currentTags = tags;
        }
      });
    }
  }

  renderImages() {
    const imagesGroup = document.getElementById('images-group');
    const imagesGrid = document.getElementById('images-grid');

    if (this.editingImages && this.editingImages.length > 0) {
      imagesGroup.style.display = 'block';
      imagesGrid.innerHTML = this.editingImages.map((img, index) => `
        <div class="image-item" data-index="${index}">
          <img src="${this.escapeHtml(img)}" alt="图片">
          <button class="delete-btn" data-index="${index}" title="删除图片">×</button>
        </div>
      `).join('');

      imagesGrid.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteImage(parseInt(btn.dataset.index));
        });
      });
    } else {
      imagesGroup.style.display = 'none';
      imagesGrid.innerHTML = '';
    }
  }

  deleteImage(index) {
    if (confirm('确定要删除这张图片吗？')) {
      this.editingImages.splice(index, 1);
      this.renderImages();
      this.showToast('图片已删除');
    }
  }

  bindEvents() {
    const saveBtn = document.getElementById('save-btn');
    const closeBtn = document.getElementById('close-btn');

    if (!saveBtn) {
      console.error('保存按钮未找到');
      this.showToast('页面加载错误：保存按钮未找到', 'error');
      return;
    }

    saveBtn.addEventListener('click', async () => {
      console.log('保存按钮被点击');
      await this.saveNote();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (this.enhancedEditor) {
          this.enhancedEditor.clearDraft();
        }
        window.close();
      });
    }

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        console.log('Ctrl+S 快捷键触发保存');
        this.saveNote();
      }
    });

    window.addEventListener('beforeunload', () => {
      if (this.enhancedEditor && !this.isSaved) {
        this.enhancedEditor.saveDraft();
      }
    });
  }

  async saveNote() {
    console.log('开始执行保存操作...');

    try {
      const titleInput = document.getElementById('edit-title');
      const sourceInput = document.getElementById('edit-source');
      const saveBtn = document.getElementById('save-btn');

      if (!titleInput) {
        console.error('必要的表单元素未找到');
        this.showToast('页面加载错误：表单元素未找到', 'error');
        return;
      }

      let title = titleInput.value.trim();
      console.log('标题:', title);

      let content = '';
      if (this.enhancedEditor) {
        content = this.enhancedEditor.getContent().trim();
      } else {
        const contentTextarea = document.getElementById('edit-content');
        content = contentTextarea ? contentTextarea.value.trim() : '';
      }
      console.log('内容长度:', content.length);

      const source = sourceInput ? sourceInput.value.trim() : '';
      const tags = this.tagEditor ? this.tagEditor.getTags() : this.currentTags;

      if (!title) {
        title = this.buildAutoTitle(content, tags, this.editingImages);
        titleInput.value = title;
        console.log('自动生成标题:', title);
      }

      if (saveBtn) {
        saveBtn.textContent = '保存中...';
        saveBtn.disabled = true;
      }

      if (this.enhancedEditor) {
        this.enhancedEditor.clearDraft();
      }

      if (!dataManager) {
        console.error('dataManager 未初始化');
        this.showToast('数据管理器未初始化，请刷新页面重试', 'error');
        if (saveBtn) {
          saveBtn.textContent = '保存';
          saveBtn.disabled = false;
        }
        return;
      }

      console.log('调用 dataManager 保存方法, noteId:', this.noteId);

      let result;
      if (this.noteId) {
        result = await dataManager.updateNote(this.noteId, {
          title: title,
          content: content,
          tags: tags,
          source: source,
          remark: source,
          excerpt: content.replace(/<[^>]*>/g, '').substring(0, 200) + (content.length > 200 ? '...' : ''),
          images: [...this.editingImages]
        });
      } else {
        result = await dataManager.addNote({
          title,
          content,
          tags,
          source,
          remark: source,
          images: [...this.editingImages]
        });
      }

      console.log('保存结果:', result);

      if (!result) {
        throw new Error('保存返回空结果');
      }

      this.isSaved = true;

      // 发送消息通知其他页面数据已更改
      try {
        chrome.runtime.sendMessage({ action: 'settingsChanged' });
      } catch (e) {
        console.warn('发送消息失败:', e);
      }

      this.showToast('✅ 笔记保存成功！', 'success');

      setTimeout(() => {
        window.close();
      }, 1000);

    } catch (error) {
      console.error('保存笔记失败:', error);
      console.error('错误堆栈:', error.stack);
      this.showToast('❌ 保存失败: ' + (error.message || '未知错误'), 'error');
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) {
        saveBtn.textContent = '保存';
        saveBtn.disabled = false;
      }
    }
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

  escapeHtml(text) {
    return Utils.escapeHtml(text);
  }

  showToast(message, type = 'success') {
    Utils.showToast(message, type);
  }
}

const noteEdit = new NoteEdit();
