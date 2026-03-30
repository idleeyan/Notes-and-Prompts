class EnhancedEditor {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      placeholder: options.placeholder || '输入内容...',
      onChange: options.onChange || null,
      onSave: options.onSave || null,
      minHeight: options.minHeight || '200px',
      maxHeight: options.maxHeight || '500px',
      enableMarkdown: options.enableMarkdown !== false,
      enableRichText: options.enableRichText !== false,
      defaultMode: options.defaultMode || 'richtext',
      autosaveInterval: options.autosaveInterval || 30000,
      enableAutosave: options.enableAutosave !== false,
      draftKey: options.draftKey || null,
      ...options
    };

    this.mode = this.options.defaultMode;
    this.container = null;
    this.toolbar = null;
    this.editorWrapper = null;
    this.richEditor = null;
    this.markdownEditor = null;
    this.previewPane = null;
    this.statusBar = null;
    this.findReplaceBar = null;
    this.autosaveTimer = null;
    this.draftKey = null;
    this.wordCount = { chars: 0, words: 0 };
    this.isPreviewVisible = false;

    this.init();
  }

  init() {
    this.createContainer();
    this.createToolbar();
    this.createStatusBar();
    this.createEditorArea();
    this.bindEvents();

    if (this.options.enableAutosave) {
      this.startAutosave();
    }

    this.updateWordCount();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'enhanced-editor';

    this.element.style.display = 'none';
    this.element.parentNode.insertBefore(this.container, this.element);
    this.container.appendChild(this.element);
  }

  createToolbar() {
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'enhanced-editor-toolbar';
    this.toolbar.innerHTML = this.getToolbarHTML();
    this.container.appendChild(this.toolbar);

    this.bindToolbarEvents();
  }

  getToolbarHTML() {
    const groups = [
      {
        name: 'mode',
        items: [
          { type: 'button', id: 'mode-richtext', icon: '📝', title: '富文本模式', active: this.mode === 'richtext' },
          { type: 'button', id: 'mode-markdown', icon: '⌨️', title: 'Markdown模式', active: this.mode === 'markdown' }
        ]
      },
      {
        name: 'history',
        items: [
          { type: 'button', id: 'undo', icon: '↩', title: '撤销 (Ctrl+Z)' },
          { type: 'button', id: 'redo', icon: '↪', title: '重做 (Ctrl+Y)' }
        ]
      },
      {
        name: 'format',
        items: [
          { type: 'dropdown', id: 'heading', title: '标题', options: [
            { value: 'p', label: '正文' },
            { value: 'h1', label: '标题 1' },
            { value: 'h2', label: '标题 2' },
            { value: 'h3', label: '标题 3' },
            { value: 'h4', label: '标题 4' },
            { value: 'h5', label: '标题 5' },
            { value: 'h6', label: '标题 6' }
          ]},
          { type: 'dropdown', id: 'font-size', title: '字号', options: [
            { value: '1', label: '特小' },
            { value: '2', label: '较小' },
            { value: '3', label: '小' },
            { value: '4', label: '正常' },
            { value: '5', label: '大' },
            { value: '6', label: '较大' },
            { value: '7', label: '特大' }
          ]},
          { type: 'button', id: 'bold', icon: '<b>B</b>', title: '粗体 (Ctrl+B)' },
          { type: 'button', id: 'italic', icon: '<i>I</i>', title: '斜体 (Ctrl+I)' },
          { type: 'button', id: 'underline', icon: '<u>U</u>', title: '下划线 (Ctrl+U)' },
          { type: 'button', id: 'strikethrough', icon: '<s>S</s>', title: '删除线' },
          { type: 'button', id: 'superscript', icon: 'X²', title: '上标' },
          { type: 'button', id: 'subscript', icon: 'X₂', title: '下标' }
        ]
      },
      {
        name: 'color',
        items: [
          { type: 'color', id: 'forecolor', title: '文字颜色', defaultColor: '#000000' },
          { type: 'color', id: 'backcolor', title: '背景颜色', defaultColor: '#ffff00' }
        ]
      },
      {
        name: 'list',
        items: [
          { type: 'button', id: 'unordered-list', icon: '•', title: '无序列表' },
          { type: 'button', id: 'ordered-list', icon: '1.', title: '有序列表' },
          { type: 'button', id: 'task-list', icon: '☑', title: '任务列表' },
          { type: 'button', id: 'quote', icon: '"', title: '引用' },
          { type: 'button', id: 'indent', icon: '→', title: '增加缩进' },
          { type: 'button', id: 'outdent', icon: '←', title: '减少缩进' }
        ]
      },
      {
        name: 'insert',
        items: [
          { type: 'button', id: 'link', icon: '🔗', title: '插入链接' },
          { type: 'button', id: 'image', icon: '🖼', title: '插入图片' },
          { type: 'button', id: 'table', icon: '▦', title: '插入表格' },
          { type: 'button', id: 'code', icon: '</>', title: '代码块' },
          { type: 'button', id: 'divider', icon: '—', title: '分隔线' },
          { type: 'button', id: 'emoji', icon: '😀', title: '插入表情' },
          { type: 'button', id: 'special-char', icon: 'Ω', title: '特殊字符' }
        ]
      },
      {
        name: 'align',
        items: [
          { type: 'button', id: 'align-left', icon: '≡', title: '左对齐' },
          { type: 'button', id: 'align-center', icon: '☰', title: '居中' },
          { type: 'button', id: 'align-right', icon: '≡', title: '右对齐' },
          { type: 'button', id: 'align-justify', icon: '☰', title: '两端对齐' }
        ]
      },
      {
        name: 'ai',
        items: [
          { type: 'button', id: 'smart-format', icon: '✨', title: '智能排版', className: 'ai-btn' }
        ]
      },
      {
        name: 'tools',
        items: [
          { type: 'button', id: 'find-replace', icon: '🔍', title: '查找替换 (Ctrl+F)' },
          { type: 'button', id: 'preview', icon: '👁', title: '预览' },
          { type: 'button', id: 'fullscreen', icon: '⛶', title: '全屏' },
          { type: 'button', id: 'print', icon: '🖨', title: '打印' }
        ]
      },
      {
        name: 'clear',
        items: [
          { type: 'button', id: 'clear-format', icon: '🧹', title: '清除格式' },
          { type: 'button', id: 'remove-link', icon: '🔗', title: '移除链接' }
        ]
      }
    ];

    return groups.map(group => {
      const itemsHtml = group.items.map(item => {
        if (item.type === 'button') {
          const activeClass = item.active ? 'active' : '';
          const className = item.className || '';
          return `<button type="button" class="toolbar-btn ${activeClass} ${className}" data-action="${item.id}" title="${item.title}">${item.icon}</button>`;
        } else if (item.type === 'dropdown') {
          const className = item.className || '';
          const optionsHtml = item.options.map(opt =>
            `<option value="${opt.value}">${opt.label}</option>`
          ).join('');
          return `<select class="toolbar-dropdown ${className}" data-action="${item.id}" title="${item.title}">${optionsHtml}</select>`;
        } else if (item.type === 'color') {
          const defaultColor = item.defaultColor || '#000000';
          return `<input type="color" class="toolbar-color" data-action="${item.id}" value="${defaultColor}" title="${item.title}">`;
        }
      }).join('');
      return `<div class="toolbar-group" data-group="${group.name}">${itemsHtml}</div>`;
    }).join('<span class="toolbar-divider"></span>');
  }

  createEditorArea() {
    this.editorWrapper = document.createElement('div');
    this.editorWrapper.className = 'enhanced-editor-wrapper';
    this.container.appendChild(this.editorWrapper);

    this.createRichEditor();
    if (this.options.enableMarkdown) {
      this.createMarkdownEditor();
    }
    this.createPreviewPane();

    this.switchMode(this.mode);
  }

  createRichEditor() {
    this.richEditor = document.createElement('div');
    this.richEditor.className = 'enhanced-editor-content rich-editor';
    this.richEditor.contentEditable = true;
    this.richEditor.style.minHeight = this.options.minHeight;
    this.richEditor.style.maxHeight = this.options.maxHeight;
    this.richEditor.dataset.placeholder = this.options.placeholder;

    this.richEditor.addEventListener('input', () => {
      this.syncContent();
      this.updateWordCount();
      if (this.options.onChange) {
        this.options.onChange(this.getContent());
      }
    });

    this.richEditor.addEventListener('paste', (e) => this.handlePaste(e));
    this.richEditor.addEventListener('keydown', (e) => this.handleKeydown(e));

    this.editorWrapper.appendChild(this.richEditor);
  }

  createMarkdownEditor() {
    if (typeof EasyMDE === 'undefined') return;

    const textarea = document.createElement('textarea');
    textarea.className = 'markdown-textarea';
    this.editorWrapper.appendChild(textarea);

    this.markdownEditor = new EasyMDE({
      element: textarea,
      spellChecker: false,
      autosave: { enabled: false },
      placeholder: this.options.placeholder,
      status: false,
      toolbar: false,
      minHeight: this.options.minHeight,
      maxHeight: this.options.maxHeight,
      initialValue: this.element.value || ''
    });

    const cm = this.markdownEditor.codemirror;
    cm.on('change', () => {
      this.syncContent();
      this.updateWordCount();
      if (this.options.onChange) {
        this.options.onChange(this.getContent());
      }
    });

    cm.on('keydown', (cm, e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (this.options.onSave) {
          this.options.onSave();
        }
      }
    });
  }

  createPreviewPane() {
    this.previewPane = document.createElement('div');
    this.previewPane.className = 'enhanced-editor-preview';
    this.previewPane.style.display = 'none';
    this.editorWrapper.appendChild(this.previewPane);
  }

  createStatusBar() {
    this.statusBar = document.createElement('div');
    this.statusBar.className = 'enhanced-editor-statusbar';
    this.statusBar.innerHTML = `
      <div class="status-left">
        <span class="word-count">0 字符 | 0 词</span>
        <span class="autosave-status"></span>
      </div>
      <div class="status-right">
        <span class="editor-mode">${this.mode === 'richtext' ? '富文本' : 'Markdown'}</span>
        <button type="button" class="save-draft-btn" title="保存草稿">💾</button>
      </div>
    `;
    this.container.appendChild(this.statusBar);

    this.statusBar.querySelector('.save-draft-btn').addEventListener('click', () => {
      this.saveDraft();
    });
  }

  bindEvents() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (this.container.contains(document.activeElement)) {
          e.preventDefault();
          this.toggleFindReplace();
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      this.saveDraft();
    });
  }

  bindToolbarEvents() {
    this.toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;

      const action = btn.dataset.action;
      this.handleToolbarAction(action, btn);
    });

    this.toolbar.addEventListener('change', (e) => {
      const dropdown = e.target.closest('.toolbar-dropdown');
      const colorInput = e.target.closest('.toolbar-color');

      if (dropdown) {
        const action = dropdown.dataset.action;
        const value = dropdown.value;
        this.handleToolbarAction(action, null, value);
      } else if (colorInput) {
        const action = colorInput.dataset.action;
        const value = colorInput.value;
        this.handleToolbarAction(action, null, value);
      }
    });
  }

  handleToolbarAction(action, btn, value = null) {
    switch (action) {
      case 'mode-richtext':
        this.switchMode('richtext');
        break;
      case 'mode-markdown':
        this.switchMode('markdown');
        break;
      case 'bold':
        this.execCommand('bold');
        break;
      case 'italic':
        this.execCommand('italic');
        break;
      case 'underline':
        this.execCommand('underline');
        break;
      case 'strikethrough':
        this.execCommand('strikeThrough');
        break;
      case 'superscript':
        this.execCommand('superscript');
        break;
      case 'subscript':
        this.execCommand('subscript');
        break;
      case 'code':
        this.insertCode();
        break;
      case 'forecolor':
        this.execCommand('foreColor', value);
        break;
      case 'backcolor':
        this.execCommand('hiliteColor', value);
        break;
      case 'heading':
        this.execCommand('formatBlock', value);
        break;
      case 'font-size':
        this.execCommand('fontSize', value);
        break;
      case 'unordered-list':
        this.execCommand('insertUnorderedList');
        break;
      case 'ordered-list':
        this.execCommand('insertOrderedList');
        break;
      case 'task-list':
        this.insertTaskList();
        break;
      case 'quote':
        this.execCommand('formatBlock', 'blockquote');
        break;
      case 'indent':
        this.execCommand('indent');
        break;
      case 'outdent':
        this.execCommand('outdent');
        break;
      case 'link':
        this.insertLink();
        break;
      case 'image':
        this.insertImage();
        break;
      case 'table':
        this.insertTable();
        break;
      case 'divider':
        this.insertDivider();
        break;
      case 'emoji':
        this.insertEmoji();
        break;
      case 'special-char':
        this.insertSpecialChar();
        break;
      case 'align-left':
        this.execCommand('justifyLeft');
        break;
      case 'align-center':
        this.execCommand('justifyCenter');
        break;
      case 'align-right':
        this.execCommand('justifyRight');
        break;
      case 'align-justify':
        this.execCommand('justifyFull');
        break;
      case 'find-replace':
        this.toggleFindReplace();
        break;
      case 'preview':
        this.togglePreview();
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      case 'print':
        this.printContent();
        break;
      case 'undo':
        this.execCommand('undo');
        break;
      case 'redo':
        this.execCommand('redo');
        break;
      case 'clear-format':
        this.execCommand('removeFormat');
        break;
      case 'remove-link':
        this.execCommand('unlink');
        break;
      case 'smart-format':
        this.smartFormat();
        break;
    }

    if (btn) {
      this.updateToolbarState();
    }
  }

  // 智能排版功能
  smartFormat() {
    if (this.mode === 'richtext') {
      this.smartFormatRichText();
    } else if (this.mode === 'markdown') {
      this.smartFormatMarkdown();
    }
  }

  // 富文本模式智能排版
  smartFormatRichText() {
    const selection = window.getSelection();
    let content = '';
    
    if (selection.toString().trim()) {
      // 对选中内容排版
      content = selection.toString();
    } else {
      // 对全部内容排版
      content = this.richEditor.innerText;
    }

    if (!content.trim()) {
      this.showAIMessage('没有可排版的内容', 'warning');
      return;
    }

    const formatted = this.applySmartFormatting(content);
    
    if (selection.toString().trim()) {
      // 替换选中文本
      document.execCommand('insertText', false, formatted);
    } else {
      // 替换全部内容
      this.richEditor.innerHTML = formatted.replace(/\n/g, '<br>');
    }
    
    this.syncContent();
    this.updateWordCount();
    this.showAIMessage('✨ 智能排版完成');
  }

  // Markdown 模式智能排版
  smartFormatMarkdown() {
    if (!this.markdownEditor) return;
    
    const cm = this.markdownEditor.codemirror;
    const selection = cm.getSelection();
    let content = '';
    
    if (selection.trim()) {
      content = selection;
    } else {
      content = cm.getValue();
    }

    if (!content.trim()) {
      this.showAIMessage('没有可排版的内容', 'warning');
      return;
    }

    const formatted = this.applySmartFormatting(content);
    
    if (selection.trim()) {
      cm.replaceSelection(formatted);
    } else {
      cm.setValue(formatted);
    }
    
    this.syncContent();
    this.updateWordCount();
    this.showAIMessage('✨ 智能排版完成');
  }

  // 应用智能排版规则
  applySmartFormatting(text) {
    let result = text;

    // 1. 修复多余的空格
    result = result.replace(/[ \t]+/g, ' ');
    
    // 2. 修复多余空行（最多保留2个空行）
    result = result.replace(/\n{3,}/g, '\n\n');
    
    // 3. 段首空格规范化
    result = result.replace(/^[ \t]+/gm, '');
    
    // 4. 移除行尾空格
    result = result.replace(/[ \t]+$/gm, '');
    
    // 5. 中英文之间添加空格
    result = result.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2');
    result = result.replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
    
    // 6. 数字与中文之间添加空格
    result = result.replace(/(\d)([\u4e00-\u9fa5])/g, '$1 $2');
    result = result.replace(/([\u4e00-\u9fa5])(\d)/g, '$1 $2');
    
    // 7. 标点符号规范化
    result = result.replace(/[,，]+/g, '，');
    result = result.replace(/[.。]+/g, '。');
    result = result.replace(/[;；]+/g, '；');
    result = result.replace(/[:：]+/g, '：');
    
    // 8. 移除连续重复的标点
    result = result.replace(/([，。！？；：])\1+/g, '$1');
    
    // 9. 句末添加标点（如果没有）
    result = result.replace(/([^。！？\n])$/g, '$1。');
    
    // 10. 列表格式化 - 检测并规范化列表
    result = result.replace(/^[\d\-\*\•]+[\.、]\s*/gm, (match) => {
      if (match.match(/^\d+\./)) {
        return '';
      } else if (match.match(/^[-\*]/)) {
        return '- ';
      } else if (match.match(/^[•]/)) {
        return '- ';
      }
      return match;
    });

    // 11. 标题格式化 - 确保标题后有内容
    result = result.replace(/^(#{1,6})\s*(.+?)(?:#{1,6})?$/gm, (match, hashes, title) => {
      return `${hashes} ${title.trim()}`;
    });
    
    // 12. 链接自动转换（简化版）
    result = result.replace(/(^|[\s(])https?:\/\/[^\s]+/g, (match) => {
      const prefix = match.startsWith('http') ? '' : match[0];
      const url = match.startsWith('http') ? match : match.substring(1);
      return prefix + '[' + url + '](' + url + ')';
    });

    return result.trim();
  }

  // 显示 AI 消息提示
  showAIMessage(message, type = 'success') {
    // 查找或创建消息元素
    let msgEl = document.querySelector('.ai-message-toast');
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.className = 'ai-message-toast';
      msgEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'warning' ? '#ff9800' : '#4caf50'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: aiMsgSlide 0.3s ease;
      `;
      document.body.appendChild(msgEl);
    }
    
    msgEl.textContent = message;
    msgEl.style.background = type === 'warning' ? '#ff9800' : '#4caf50';
    
    setTimeout(() => {
      msgEl.remove();
    }, 2500);
  }

  switchMode(mode) {
    this.mode = mode;

    if (mode === 'richtext') {
      if (this.markdownEditor) {
        this.markdownEditor.toTextArea();
        this.markdownEditor = null;
      }
      if (!this.richEditor) {
        this.createRichEditor();
      }
      this.richEditor.style.display = 'block';
      this.richEditor.innerHTML = this.markdownToHtml(this.element.value || '');
    } else {
      const currentContent = this.getContent();
      if (this.richEditor) {
        this.richEditor.style.display = 'none';
      }
      this.createMarkdownEditor();
      if (this.markdownEditor) {
        this.markdownEditor.value(currentContent);
      } else {
        // 如果 Markdown 编辑器创建失败，回退到富文本模式
        console.warn('EasyMDE 未加载，回退到富文本模式');
        this.mode = 'richtext';
        if (!this.richEditor) {
          this.createRichEditor();
        }
        this.richEditor.style.display = 'block';
      }
    }

    this.updateToolbarButtons();
    this.updateStatusBar();
  }

  updateToolbarButtons() {
    const richtextBtn = this.toolbar.querySelector('[data-action="mode-richtext"]');
    const markdownBtn = this.toolbar.querySelector('[data-action="mode-markdown"]');

    if (richtextBtn) {
      richtextBtn.classList.toggle('active', this.mode === 'richtext');
    }
    if (markdownBtn) {
      markdownBtn.classList.toggle('active', this.mode === 'markdown');
    }
  }

  execCommand(command, value = null) {
    if (this.mode === 'richtext') {
      document.execCommand(command, false, value);
      this.richEditor.focus();
    } else if (this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      const selection = cm.getSelection();

      switch (command) {
        case 'bold':
          cm.replaceSelection(selection ? `**${selection}**` : '**粗体**');
          break;
        case 'italic':
          cm.replaceSelection(selection ? `*${selection}*` : '*斜体*');
          break;
        case 'strikeThrough':
          cm.replaceSelection(selection ? `~~${selection}~~` : '~~删除线~~');
          break;
        case 'formatBlock':
          if (value === 'blockquote') {
            cm.replaceSelection(selection.split('\n').map(line => `> ${line}`).join('\n'));
          } else if (value.startsWith('h')) {
            const level = value.replace('h', '');
            const hashes = '#'.repeat(parseInt(level));
            cm.replaceSelection(selection ? `${hashes} ${selection}` : `${hashes} 标题`);
          }
          break;
        case 'insertUnorderedList':
          cm.replaceSelection(selection.split('\n').map(line => `- ${line}`).join('\n'));
          break;
        case 'insertOrderedList':
          cm.replaceSelection(selection.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n'));
          break;
      }
    }
    this.syncContent();
  }

  insertCode() {
    if (this.mode === 'richtext') {
      const selection = window.getSelection().toString();
      const code = selection || '代码';
      document.execCommand('insertHTML', false, `<code>${code}</code>`);
    } else if (this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      const selection = cm.getSelection();
      cm.replaceSelection(selection ? `\`\`\`\n${selection}\n\`\`\`` : '\`\`\`\n代码\n\`\`\`');
    }
  }

  insertTaskList() {
    if (this.mode === 'richtext') {
      const html = '<ul style="list-style: none;"><li><input type="checkbox"> 任务项</li></ul>';
      document.execCommand('insertHTML', false, html);
    } else if (this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      const selection = cm.getSelection();
      cm.replaceSelection(selection.split('\n').map(line => `- [ ] ${line}`).join('\n'));
    }
  }

  insertLink() {
    const url = prompt('请输入链接地址:', 'https://');
    const text = prompt('请输入链接文字:', '链接');
    if (url && url !== 'https://') {
      if (this.mode === 'richtext') {
        document.execCommand('createLink', false, url);
      } else if (this.markdownEditor) {
        const cm = this.markdownEditor.codemirror;
        cm.replaceSelection(`[${text || url}](${url})`);
      }
    }
  }

  insertImage() {
    const url = prompt('请输入图片地址:');
    if (url) {
      if (this.mode === 'richtext') {
        document.execCommand('insertImage', false, url);
      } else if (this.markdownEditor) {
        const cm = this.markdownEditor.codemirror;
        cm.replaceSelection(`![图片描述](${url})`);
      }
    }
  }

  insertTable() {
    const rows = parseInt(prompt('行数:', '3')) || 3;
    const cols = parseInt(prompt('列数:', '3')) || 3;

    if (this.mode === 'richtext') {
      let html = '<table border="1" style="border-collapse: collapse; width: 100%;"><tbody>';
      for (let i = 0; i < rows; i++) {
        html += '<tr>';
        for (let j = 0; j < cols; j++) {
          html += '<td style="padding: 8px; border: 1px solid #ddd;">单元格</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      document.execCommand('insertHTML', false, html);
    } else if (this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      let md = '|' + ' 列 |'.repeat(cols) + '\n';
      md += '|' + ' --- |'.repeat(cols) + '\n';
      for (let i = 0; i < rows; i++) {
        md += '|' + ' 内容 |'.repeat(cols) + '\n';
      }
      cm.replaceSelection(md);
    }
  }

  insertDivider() {
    if (this.mode === 'richtext') {
      document.execCommand('insertHTML', false, '<hr>');
    } else if (this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      cm.replaceSelection('\n---\n');
    }
  }

  insertEmoji() {
    const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '👍', '👎', '👏', '🙌', '🤝', '❤️', '💔', '💯', '✅', '❌', '⭐', '🔥', '💡', '📌', '🎯', '✨', '🎉', '🚀', '💪', '🙏'];
    
    const popup = document.createElement('div');
    popup.className = 'emoji-picker-popup';
    popup.innerHTML = `
      <div class="emoji-picker-header">
        <span>选择表情</span>
        <button class="emoji-close-btn">&times;</button>
      </div>
      <div class="emoji-picker-grid">
        ${emojis.map(e => `<span class="emoji-item" data-emoji="${e}">${e}</span>`).join('')}
      </div>
    `;
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      max-width: 400px;
      max-height: 300px;
      overflow-y: auto;
    `;

    document.body.appendChild(popup);

    popup.querySelector('.emoji-close-btn').addEventListener('click', () => popup.remove());

    popup.querySelectorAll('.emoji-item').forEach(item => {
      item.style.cssText = 'cursor: pointer; font-size: 24px; padding: 4px; display: inline-block;';
      item.addEventListener('click', () => {
        const emoji = item.dataset.emoji;
        if (this.mode === 'richtext') {
          document.execCommand('insertText', false, emoji);
        } else if (this.markdownEditor) {
          const cm = this.markdownEditor.codemirror;
          cm.replaceSelection(emoji);
        }
        popup.remove();
      });
    });

    const closeOnOutside = (e) => {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', closeOnOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 100);
  }

  insertSpecialChar() {
    const chars = [
      { label: '常用', items: ['©', '®', '™', '°', '±', '×', '÷', '≠', '≈', '≤', '≥', '∞'] },
      { label: '箭头', items: ['←', '→', '↑', '↓', '↔', '⇐', '⇒', '⇑', '⇓', '⇔'] },
      { label: '数学', items: ['∑', '∏', '∫', '∂', '√', '∛', '∜', 'π', 'Ω', 'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'σ', 'φ', 'ψ', 'ω'] },
      { label: '货币', items: ['¥', '$', '€', '£', '¢', '₹', '₽', '₩', '₿'] },
      { label: '标点', items: ['「', '」', '『', '』', '【', '】', '《', '》', '〈', '〉', '〔', '〕', '…', '—', '～'] },
      { label: '符号', items: ['☆', '★', '○', '●', '◎', '◇', '◆', '□', '■', '△', '▲', '▽', '▼', '♠', '♣', '♥', '♦'] }
    ];

    const popup = document.createElement('div');
    popup.className = 'special-char-popup';
    
    let html = `
      <div class="special-char-header">
        <span>特殊字符</span>
        <button class="char-close-btn">&times;</button>
      </div>
      <div class="special-char-content">
    `;

    chars.forEach(group => {
      html += `
        <div class="char-group">
          <div class="char-group-label">${group.label}</div>
          <div class="char-group-items">
            ${group.items.map(c => `<span class="char-item" data-char="${c}">${c}</span>`).join('')}
          </div>
        </div>
      `;
    });

    html += '</div>';
    popup.innerHTML = html;
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      max-width: 500px;
      max-height: 400px;
      overflow-y: auto;
    `;

    document.body.appendChild(popup);

    popup.querySelector('.char-close-btn').addEventListener('click', () => popup.remove());

    popup.querySelectorAll('.char-item').forEach(item => {
      item.style.cssText = 'cursor: pointer; font-size: 18px; padding: 4px 8px; display: inline-block; border-radius: 4px;';
      item.addEventListener('mouseenter', () => item.style.background = '#f0f0f0');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');
      item.addEventListener('click', () => {
        const char = item.dataset.char;
        if (this.mode === 'richtext') {
          document.execCommand('insertText', false, char);
        } else if (this.markdownEditor) {
          const cm = this.markdownEditor.codemirror;
          cm.replaceSelection(char);
        }
        popup.remove();
      });
    });

    const closeOnOutside = (e) => {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', closeOnOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside), 100);
  }

  printContent() {
    const content = this.getContent();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>打印</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; line-height: 1.6; }
          h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; }
          code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
          pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
          blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 16px; color: #666; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #ddd; padding: 8px; }
          img { max-width: 100%; }
        </style>
      </head>
      <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        this.handleImageUpload(file);
        break;
      }
    }
  }

  handleImageUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (this.mode === 'richtext') {
        document.execCommand('insertImage', false, e.target.result);
      }
      this.syncContent();
    };
    reader.readAsDataURL(file);
  }

  handleKeydown(e) {
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
        case 's':
          e.preventDefault();
          if (this.options.onSave) {
            this.options.onSave();
          }
          break;
        case 'k':
          e.preventDefault();
          this.insertLink();
          break;
      }
    }
  }

  togglePreview() {
    this.isPreviewVisible = !this.isPreviewVisible;

    if (this.isPreviewVisible) {
      this.previewPane.style.display = 'block';
      this.updatePreview();
      this.editorWrapper.classList.add('with-preview');
    } else {
      this.previewPane.style.display = 'none';
      this.editorWrapper.classList.remove('with-preview');
    }

    const previewBtn = this.toolbar.querySelector('[data-action="preview"]');
    if (previewBtn) {
      previewBtn.classList.toggle('active', this.isPreviewVisible);
    }
  }

  updatePreview() {
    const content = this.getContent();
    if (typeof marked !== 'undefined') {
      this.previewPane.innerHTML = marked.parse(content);
    } else {
      this.previewPane.innerHTML = this.markdownToHtml(content);
    }
  }

  toggleFullscreen() {
    this.container.classList.toggle('fullscreen');
    const btn = this.toolbar.querySelector('[data-action="fullscreen"]');
    if (btn) {
      btn.classList.toggle('active', this.container.classList.contains('fullscreen'));
    }
  }

  toggleFindReplace() {
    if (!this.findReplaceBar) {
      this.createFindReplaceBar();
    }
    this.findReplaceBar.classList.toggle('visible');
    if (this.findReplaceBar.classList.contains('visible')) {
      this.findReplaceBar.querySelector('.find-input').focus();
    }
  }

  createFindReplaceBar() {
    this.findReplaceBar = document.createElement('div');
    this.findReplaceBar.className = 'find-replace-bar';
    this.findReplaceBar.innerHTML = `
      <input type="text" class="find-input" placeholder="查找...">
      <input type="text" class="replace-input" placeholder="替换为...">
      <button type="button" class="find-btn" data-action="find-next">下一个</button>
      <button type="button" class="find-btn" data-action="find-prev">上一个</button>
      <button type="button" class="find-btn" data-action="replace">替换</button>
      <button type="button" class="find-btn" data-action="replace-all">全部替换</button>
      <button type="button" class="find-btn close-btn" data-action="close">✕</button>
    `;

    this.findReplaceBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.find-btn');
      if (!btn) return;

      const action = btn.dataset.action;
      const findInput = this.findReplaceBar.querySelector('.find-input');
      const replaceInput = this.findReplaceBar.querySelector('.replace-input');
      const findText = findInput.value;
      const replaceText = replaceInput.value;

      switch (action) {
        case 'find-next':
          this.findText(findText, true);
          break;
        case 'find-prev':
          this.findText(findText, false);
          break;
        case 'replace':
          this.replaceText(findText, replaceText, false);
          break;
        case 'replace-all':
          this.replaceText(findText, replaceText, true);
          break;
        case 'close':
          this.findReplaceBar.classList.remove('visible');
          break;
      }
    });

    this.container.insertBefore(this.findReplaceBar, this.editorWrapper);
  }

  findText(text, forward = true) {
    if (!text) return;

    if (this.mode === 'richtext') {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      const content = this.richEditor.innerHTML;
      const searchIndex = forward
        ? content.indexOf(text, range.endOffset)
        : content.lastIndexOf(text, range.startOffset - text.length);

      if (searchIndex !== -1) {
        const newRange = document.createRange();
        const textNode = this.richEditor.firstChild;
        if (textNode) {
          newRange.setStart(textNode, searchIndex);
          newRange.setEnd(textNode, searchIndex + text.length);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }
    } else if (this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      const cursor = cm.getSearchCursor(text, forward ? cm.getCursor() : undefined);
      const found = forward ? cursor.findNext() : cursor.findPrevious();
      if (found) {
        cm.setSelection(cursor.from(), cursor.to());
        cm.scrollIntoView(cursor.from());
      }
    }
  }

  replaceText(find, replace, all = false) {
    if (!find) return;

    if (this.mode === 'richtext') {
      const content = this.richEditor.innerHTML;
      if (all) {
        this.richEditor.innerHTML = content.split(find).join(replace);
      } else {
        const selection = window.getSelection().toString();
        if (selection === find) {
          document.execCommand('insertText', false, replace);
        }
      }
    } else if (this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      if (all) {
        const content = cm.getValue();
        cm.setValue(content.split(find).join(replace));
      } else {
        const cursor = cm.getSearchCursor(find);
        if (cursor.findNext()) {
          cm.replaceRange(replace, cursor.from(), cursor.to());
        }
      }
    }
    this.syncContent();
  }

  syncContent() {
    const content = this.getContent();
    this.element.value = content;
    if (this.isPreviewVisible) {
      this.updatePreview();
    }
  }

  getContent() {
    if (this.mode === 'richtext') {
      if (this.richEditor) {
        return this.richEditor.innerHTML || '';
      }
    } else if (this.mode === 'markdown') {
      if (this.markdownEditor) {
        return this.markdownEditor.value() || '';
      }
    }
    return this.element?.value || '';
  }

  getContentText() {
    if (this.mode === 'richtext' && this.richEditor) {
      return this.richEditor.innerText;
    } else if (this.mode === 'markdown' && this.markdownEditor) {
      return this.markdownEditor.value();
    }
    return this.element.value || '';
  }

  setContent(content) {
    if (this.mode === 'richtext' && this.richEditor) {
      this.richEditor.innerHTML = this.markdownToHtml(content);
    } else if (this.mode === 'markdown' && this.markdownEditor) {
      this.markdownEditor.value(content);
    }
    this.element.value = content;
    this.updateWordCount();
  }

  markdownToHtml(markdown) {
    if (!markdown) return '';

    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
      .replace(/\*(.*)\*/gim, '<i>$1</i>')
      .replace(/~~(.*)~~/gim, '<s>$1</s>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/```[\s\S]*?```/gim, '<pre><code>$&</code></pre>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img alt="$1" src="$2">')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
      .replace(/^\d+\. (.*$)/gim, '<ol><li>$1</li></ol>')
      .replace(/\n/gim, '<br>');
  }

  updateWordCount() {
    const text = this.getContentText();
    this.wordCount.chars = text.length;
    this.wordCount.words = text.trim() ? text.trim().split(/\s+/).length : 0;

    if (!this.statusBar) return;
    const countEl = this.statusBar.querySelector('.word-count');
    if (countEl) {
      countEl.textContent = `${this.wordCount.chars} 字符 | ${this.wordCount.words} 词`;
    }
  }

  updateStatusBar() {
    if (!this.statusBar) return;
    const modeEl = this.statusBar.querySelector('.editor-mode');
    if (modeEl) {
      modeEl.textContent = this.mode === 'richtext' ? '富文本' : 'Markdown';
    }
  }

  updateToolbarState() {
    if (this.mode !== 'richtext') return;

    const buttons = this.toolbar.querySelectorAll('.toolbar-btn');
    buttons.forEach(btn => {
      const action = btn.dataset.action;
      if (['bold', 'italic', 'underline'].includes(action)) {
        const isActive = document.queryCommandState(action);
        btn.classList.toggle('active', isActive);
      }
    });
  }

  startAutosave() {
    this.autosaveTimer = setInterval(() => {
      this.saveDraft();
    }, this.options.autosaveInterval);
  }

  stopAutosave() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  saveDraft() {
    const content = this.getContent();
    if (!content) return;

    const draftKey = this.getDraftKey();
    const draft = {
      content: content,
      mode: this.mode,
      timestamp: Date.now()
    };

    localStorage.setItem(draftKey, JSON.stringify(draft));

    const statusEl = this.statusBar.querySelector('.autosave-status');
    if (statusEl) {
      statusEl.textContent = '已保存草稿';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    }
  }

  loadDraft() {
    const draftKey = this.getDraftKey();
    const draftJson = localStorage.getItem(draftKey);

    if (draftJson) {
      try {
        const draft = JSON.parse(draftJson);
        const hoursSinceSave = (Date.now() - draft.timestamp) / (1000 * 60 * 60);

        if (hoursSinceSave < 24) {
          if (confirm(`发现 ${Math.round(hoursSinceSave * 60)} 分钟前的草稿，是否恢复？`)) {
            this.setContent(draft.content);
            if (draft.mode && draft.mode !== this.mode) {
              this.switchMode(draft.mode);
            }
            return true;
          }
        }
      } catch (e) {
        console.error('加载草稿失败:', e);
      }
    }
    return false;
  }

  clearDraft() {
    const draftKey = this.getDraftKey();
    localStorage.removeItem(draftKey);
  }

  getDraftKey() {
    if (this.options.draftKey) {
      return `editor_draft_${this.options.draftKey}`;
    }
    return `editor_draft_${this.element.id || this.element.name || 'default'}`;
  }

  focus() {
    if (this.mode === 'richtext' && this.richEditor) {
      this.richEditor.focus();
    } else if (this.mode === 'markdown' && this.markdownEditor) {
      this.markdownEditor.codemirror.focus();
    }
  }

  getSelection() {
    if (this.mode === 'richtext' && this.richEditor) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        return range.toString();
      }
    } else if (this.mode === 'markdown' && this.markdownEditor) {
      return this.markdownEditor.codemirror.getSelection();
    }
    return '';
  }

  replaceSelection(text) {
    if (this.mode === 'richtext' && this.richEditor) {
      document.execCommand('insertText', false, text);
      this.syncContent();
    } else if (this.mode === 'markdown' && this.markdownEditor) {
      this.markdownEditor.codemirror.replaceSelection(text);
    }
  }

  insertText(text) {
    if (this.mode === 'richtext' && this.richEditor) {
      this.richEditor.focus();
      document.execCommand('insertText', false, text);
      this.syncContent();
    } else if (this.mode === 'markdown' && this.markdownEditor) {
      const cm = this.markdownEditor.codemirror;
      cm.replaceSelection(text);
    }
  }

  destroy() {
    this.stopAutosave();
    this.clearDraft();

    if (this.markdownEditor) {
      this.markdownEditor.toTextArea();
    }

    if (this.container && this.container.parentNode) {
      this.element.style.display = '';
      this.container.parentNode.insertBefore(this.element, this.container);
      this.container.remove();
    }
  }
}

window.EnhancedEditor = EnhancedEditor;
