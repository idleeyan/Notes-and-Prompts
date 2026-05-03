class VisualEditor {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      placeholder: options.placeholder || '输入内容...',
      onChange: options.onChange || null,
      onImageUpload: options.onImageUpload || null,
      minHeight: options.minHeight || '150px',
      maxHeight: options.maxHeight || '400px',
      ...options
    };
    this.toolbar = null;
    this.editArea = null;
    this.init();
  }

  init() {
    this.createEditor();
    this.bindEvents();
  }

  createEditor() {
    const container = document.createElement('div');
    container.className = 'visual-editor-container';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'visual-editor-toolbar';
    this.toolbar.innerHTML = this.createToolbarHTML();

    this.editArea = document.createElement('div');
    this.editArea.className = 'visual-editor-content';
    this.editArea.contentEditable = true;
    this.editArea.style.minHeight = this.options.minHeight;
    this.editArea.style.maxHeight = this.options.maxHeight;
    this.editArea.dataset.placeholder = this.options.placeholder;

    if (this.element.value) {
      this.editArea.innerHTML = this.element.value;
    }

    container.appendChild(this.toolbar);
    container.appendChild(this.editArea);

    this.element.style.display = 'none';
    this.element.parentNode.insertBefore(container, this.element);
    container.appendChild(this.element);

    this.container = container;
  }

  createToolbarHTML() {
    const buttons = [
      { cmd: 'bold', icon: '<b>B</b>', title: '粗体 (Ctrl+B)' },
      { cmd: 'italic', icon: '<i>I</i>', title: '斜体 (Ctrl+I)' },
      { cmd: 'underline', icon: '<u>U</u>', title: '下划线 (Ctrl+U)' },
      { cmd: 'strikeThrough', icon: '<s>S</s>', title: '删除线' },
      { type: 'separator' },
      { cmd: 'formatBlock', value: 'h1', icon: 'H1', title: '标题1' },
      { cmd: 'formatBlock', value: 'h2', icon: 'H2', title: '标题2' },
      { cmd: 'formatBlock', value: 'h3', icon: 'H3', title: '标题3' },
      { cmd: 'formatBlock', value: 'p', icon: 'P', title: '段落' },
      { type: 'separator' },
      { cmd: 'insertUnorderedList', icon: '•', title: '无序列表' },
      { cmd: 'insertOrderedList', icon: '1.', title: '有序列表' },
      { type: 'separator' },
      { cmd: 'createLink', icon: '🔗', title: '插入链接' },
      { cmd: 'insertImage', icon: '🖼️', title: '插入图片' },
      { type: 'separator' },
      { cmd: 'justifyLeft', icon: '⬅', title: '左对齐' },
      { cmd: 'justifyCenter', icon: '⬌', title: '居中对齐' },
      { cmd: 'justifyRight', icon: '➡', title: '右对齐' },
      { type: 'separator' },
      { cmd: 'removeFormat', icon: '✖', title: '清除格式' },
      { cmd: 'undo', icon: '↩', title: '撤销 (Ctrl+Z)' },
      { cmd: 'redo', icon: '↪', title: '重做 (Ctrl+Y)' },
      { type: 'separator' },
      { cmd: 'ai-polish', icon: '✨', title: 'AI润色', isAI: true, action: 'polish' },
      { cmd: 'ai-simplify', icon: '📝', title: 'AI精简', isAI: true, action: 'simplify' },
      { cmd: 'ai-expand', icon: '📖', title: 'AI扩充', isAI: true, action: 'expand' },
      { cmd: 'ai-translate', icon: '🌐', title: 'AI翻译', isAI: true, action: 'translate' },
      { cmd: 'ai-menu', icon: '🤖', title: 'AI工具', isAI: true, action: 'menu' }
    ];

    return buttons.map(btn => {
      if (btn.type === 'separator') {
        return '<span class="toolbar-separator"></span>';
      }
      if (btn.isAI) {
        return `<button type="button" class="toolbar-btn toolbar-btn-ai" data-ai-action="${btn.action}" title="${btn.title}">${btn.icon}</button>`;
      }
      return `<button type="button" class="toolbar-btn" data-cmd="${btn.cmd}" data-value="${btn.value || ''}" title="${btn.title}">${btn.icon}</button>`;
    }).join('');
  }

  bindEvents() {
    this.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;

      // 处理 AI 按钮点击
      const aiAction = btn.dataset.aiAction;
      if (aiAction) {
        if (this.options.onAIAction) {
          this.options.onAIAction(aiAction, this);
        }
        return;
      }

      const cmd = btn.dataset.cmd;
      const value = btn.dataset.value || null;

      this.execCommand(cmd, value);
    });

    this.editArea.addEventListener('input', () => {
      this.syncToTextarea();
      if (this.options.onChange) {
        this.options.onChange(this.getContent());
      }
    });

    this.editArea.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            this.execCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            this.execCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            this.execCommand('underline');
            break;
        }
      }
    });

    this.editArea.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = item.getAsFile();
          this.handleImagePaste(file);
          break;
        }
      }
    });

    this.editArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.editArea.classList.add('drag-over');
    });

    this.editArea.addEventListener('dragleave', () => {
      this.editArea.classList.remove('drag-over');
    });

    this.editArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.editArea.classList.remove('drag-over');

      const files = e.dataTransfer?.files;
      if (files) {
        for (const file of files) {
          if (file.type.indexOf('image') !== -1) {
            this.handleImagePaste(file);
            break;
          }
        }
      }
    });

    this.editArea.addEventListener('focus', () => {
      this.editArea.classList.add('focused');
    });

    this.editArea.addEventListener('blur', () => {
      this.editArea.classList.remove('focused');
    });
  }

  execCommand(cmd, value = null) {
    if (cmd === 'createLink') {
      const url = prompt('请输入链接地址:', 'https://');
      if (url && url !== 'https://') {
        document.execCommand(cmd, false, url);
      }
    } else if (cmd === 'insertImage') {
      if (this.options.onImageUpload) {
        this.options.onImageUpload();
      } else {
        const url = prompt('请输入图片地址:');
        if (url) {
          document.execCommand(cmd, false, url);
        }
      }
    } else if (cmd === 'formatBlock' && value) {
      document.execCommand(cmd, false, `<${value}>`);
    } else {
      document.execCommand(cmd, false, value);
    }

    this.editArea.focus();
    this.syncToTextarea();
  }

  async handleImagePaste(file) {
    if (this.options.onImageUpload) {
      const url = await this.options.onImageUpload(file);
      if (url) {
        document.execCommand('insertImage', false, url);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        document.execCommand('insertImage', false, e.target.result);
        this.syncToTextarea();
      };
      reader.readAsDataURL(file);
    }
  }

  insertImage(url) {
    this.editArea.focus();
    document.execCommand('insertImage', false, url);
    this.syncToTextarea();
  }

  getContent() {
    return this.editArea.innerHTML;
  }

  getContentText() {
    return this.editArea.innerText;
  }

  setContent(html) {
    this.editArea.innerHTML = html;
    this.syncToTextarea();
  }

  syncToTextarea() {
    this.element.value = this.editArea.innerHTML;
  }

  focus() {
    this.editArea.focus();
  }

  clear() {
    this.editArea.innerHTML = '';
    this.element.value = '';
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.element.style.display = '';
      this.container.parentNode.insertBefore(this.element, this.container);
      this.container.remove();
    }
  }

  setEnabled(enabled) {
    this.editArea.contentEditable = enabled;
    this.toolbar.style.opacity = enabled ? '1' : '0.5';
    this.toolbar.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

window.VisualEditor = VisualEditor;
