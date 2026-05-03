// 编辑页面逻辑
class EditPrompt {
  constructor() {
    this.promptId = null;
    this.easyMDE = null;
    this.init();
  }

  async init() {
    // 从 URL 获取提示词 ID
    const urlParams = new URLSearchParams(window.location.search);
    this.promptId = urlParams.get('id');

    if (!this.promptId) {
      this.showToast('未找到提示词ID', 'error');
      setTimeout(() => window.close(), 2000);
      return;
    }

    // 加载数据管理器
    await this.loadDataManager();
    await this.loadData();
    this.initMarkdownEditor();
    this.bindEvents();
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

  // 加载数据
  async loadData() {
    const prompt = dataManager.getItem(this.promptId);
    if (!prompt || prompt.type !== 'prompt') {
      this.showToast('提示词不存在', 'error');
      setTimeout(() => window.close(), 2000);
      return;
    }

    // 保存提示词数据供后续使用
    this.promptData = prompt;
    
    // 填充表单（先填充非编辑器字段）
    document.getElementById('edit-category').value = prompt.category;
    document.getElementById('edit-title').value = prompt.title;
    document.getElementById('created-at').textContent = this.formatDate(prompt.createdAt);
    document.getElementById('updated-at').textContent = this.formatDate(prompt.updatedAt);
  }

  // 初始化 Markdown 编辑器
  initMarkdownEditor() {
    const textarea = document.getElementById('edit-prompt');
    
    // 设置 textarea 的初始值
    if (this.promptData && this.promptData.content) {
      textarea.value = this.promptData.content;
    }
    
    this.easyMDE = new EasyMDE({
      element: textarea,
      spellChecker: false,
      autosave: {
        enabled: false
      },
      placeholder: '输入提示词内容，支持 Markdown 格式，使用 AI 工具栏可智能编辑',
      status: ['lines', 'words', 'characters'],
      statusbarCallback: (element) => {
        const text = element.innerHTML;
        element.innerHTML = text
          .replace(/(\d+)\s*lines/g, '$1 行')
          .replace(/(\d+)\s*words/g, '$1 词')
          .replace(/(\d+)\s*characters/g, '$1 字符');
      },
      toolbar: [
        { name: 'bold', action: EasyMDE.toggleBold, className: 'fa fa-bold toolbar-btn-text', title: '粗体' },
        { name: 'italic', action: EasyMDE.toggleItalic, className: 'fa fa-italic toolbar-btn-text', title: '斜体' },
        { name: 'heading', action: EasyMDE.toggleHeadingSmaller, className: 'fa fa-header toolbar-btn-text', title: '标题' },
        '|',
        { name: 'quote', action: EasyMDE.toggleBlockquote, className: 'fa fa-quote-left toolbar-btn-text', title: '引用' },
        { name: 'unordered-list', action: EasyMDE.toggleUnorderedList, className: 'fa fa-list-ul toolbar-btn-text', title: '无序' },
        { name: 'ordered-list', action: EasyMDE.toggleOrderedList, className: 'fa fa-list-ol toolbar-btn-text', title: '有序' },
        '|',
        { name: 'link', action: EasyMDE.drawLink, className: 'fa fa-link toolbar-btn-text', title: '链接' },
        { name: 'image', action: EasyMDE.drawImage, className: 'fa fa-image toolbar-btn-text', title: '图片' },
        { name: 'code', action: EasyMDE.toggleCodeBlock, className: 'fa fa-code toolbar-btn-text', title: '代码' },
        { name: 'table', action: EasyMDE.drawTable, className: 'fa fa-table toolbar-btn-text', title: '表格' },
        '|',
        { name: 'preview', action: EasyMDE.togglePreview, className: 'fa fa-eye toolbar-btn-text', title: '预览' },
        { name: 'side-by-side', action: EasyMDE.toggleSideBySide, className: 'fa fa-columns toolbar-btn-text', title: '分屏' },
        { name: 'fullscreen', action: EasyMDE.toggleFullScreen, className: 'fa fa-arrows-alt toolbar-btn-text', title: '全屏' },
        '|',
        { name: 'guide', action: 'https://www.markdownguide.org/basic-syntax/', className: 'fa fa-question-circle toolbar-btn-text', title: '帮助' },
        '|',
        { name: 'ai-polish', action: (editor) => this.handleAIOperation('polish', editor), className: 'fa fa-magic toolbar-btn-text', title: '润色' },
        { name: 'ai-simplify', action: (editor) => this.handleAIOperation('simplify', editor), className: 'fa fa-compress-alt toolbar-btn-text', title: '精简' },
        { name: 'ai-expand', action: (editor) => this.handleAIOperation('expand', editor), className: 'fa fa-expand toolbar-btn-text', title: '扩充' },
        { name: 'ai-correct', action: (editor) => this.handleAIOperation('correct', editor), className: 'fa fa-spell-check toolbar-btn-text', title: '纠错' },
        { name: 'ai-translate', action: (editor) => this.showTranslateMenu(editor), className: 'fa fa-language toolbar-btn-text', title: '翻译' },
        { name: 'ai-analyze', action: (editor) => this.handleAIOperation('analyze', editor), className: 'fa fa-chart-bar toolbar-btn-text', title: '分析' },
        { name: 'ai-summary', action: (editor) => this.handleAIOperation('summary', editor), className: 'fa fa-list-alt toolbar-btn-text', title: '摘要' }
      ],
      minHeight: '300px',
      maxHeight: '500px',
      renderingConfig: {
        singleLineBreaks: false,
        codeSyntaxHighlighting: false
      }
    });
  }

  // 显示AI加载提示
  showAILoading(operation) {
    const overlay = document.createElement('div');
    overlay.className = 'ai-loading-overlay';
    overlay.id = 'ai-loading-overlay';

    const operationNames = {
      polish: 'AI润色',
      simplify: 'AI精简',
      expand: 'AI扩充',
      correct: 'AI纠错',
      translate: 'AI翻译',
      analyze: 'AI分析',
      summary: 'AI摘要'
    };

    overlay.innerHTML = `
      <div class="ai-loading-content">
        <div class="ai-loading-spinner"></div>
        <div class="ai-loading-text">${operationNames[operation] || 'AI处理'}中...</div>
        <div class="ai-loading-subtext">正在调用AI模型，请稍候</div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // 隐藏AI加载提示
  hideAILoading() {
    const overlay = document.getElementById('ai-loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  // 显示翻译语言选择菜单
  showTranslateMenu(editor) {
    // 先检查是否有选中的文本
    const selectedText = editor.codemirror.getSelection();
    if (!selectedText || selectedText.trim() === '') {
      this.showToast('请先选中要处理的文本', 'warning');
      return;
    }

    // 移除已存在的菜单
    const existingMenu = document.getElementById('ai-translate-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'ai-menu';
    menu.id = 'ai-translate-menu';

    const languages = [
      { code: 'zh', name: '翻译成中文' },
      { code: 'en', name: '翻译成英文' },
      { code: 'ja', name: '翻译成日文' },
      { code: 'ko', name: '翻译成韩文' }
    ];

    languages.forEach(lang => {
      const item = document.createElement('div');
      item.className = 'ai-menu-item';
      item.textContent = lang.name;
      item.addEventListener('click', async () => {
        if (menu && menu.parentNode) {
          menu.remove();
        }
        this.handleAIOperation('translate', editor, lang.code);
      });
      menu.appendChild(item);
    });

    // 定位菜单
    let toolbar = null;
    if (editor && editor.element) {
      const container = editor.element.closest('.EasyMDEContainer');
      if (container) {
        toolbar = container.querySelector('.editor-toolbar');
      }
    }

    if (toolbar) {
      const rect = toolbar.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.left = rect.left + 'px';
      menu.style.top = (rect.bottom + 5) + 'px';
    } else {
      menu.style.position = 'fixed';
      menu.style.left = '50%';
      menu.style.top = '50%';
      menu.style.transform = 'translate(-50%, -50%)';
    }

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (menu && menu.parentNode && !menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);

    document.body.appendChild(menu);
  }

  // 处理AI操作
  async handleAIOperation(operation, editor, targetLang = 'en') {
    // 延迟创建AI操作管理器实例，确保模块已加载
    let aiOpManager;
    try {
      if (typeof getAIOperationManager === 'function') {
        aiOpManager = await getAIOperationManager();
      } else {
        throw new Error('AI模块未加载');
      }
    } catch (error) {
      this.showToast('AI模块未加载，请刷新页面重试', 'error');
      return;
    }

    let btn = null;
    try {
      let selectedText = editor.codemirror.getSelection();

      if (!selectedText || selectedText.trim() === '') {
        editor.codemirror.execCommand('selectAll');
        selectedText = editor.codemirror.getSelection();
      }

      // 显示加载提示
      this.showAILoading(operation);

      btn = document.querySelector(`[data-action="ai-${operation}"]`);
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ 处理中...';
      }

      let result;
      switch (operation) {
        case 'polish':
          result = await aiOpManager.optimizeText(selectedText, 'polish');
          break;
        case 'simplify':
          result = await aiOpManager.optimizeText(selectedText, 'simplify');
          break;
        case 'expand':
          result = await aiOpManager.generateContent(selectedText, 'extend');
          break;
        case 'correct':
          result = await aiOpManager.optimizeText(selectedText, 'correct');
          break;
        case 'translate':
          result = await aiOpManager.translateText(selectedText, targetLang);
          break;
        case 'analyze':
          result = await aiOpManager.analyzeText(selectedText);
          break;
        case 'summary':
          result = await aiOpManager.generateSummary(selectedText);
          break;
      }

      // 隐藏加载提示
      this.hideAILoading();

      if (result) {
        // 使用 replaceSelection 只替换选中的文本，而不是整个编辑器内容
        editor.codemirror.replaceSelection(result);
        editor.codemirror.focus();
        this.showToast('✅ AI处理完成');
      } else {
        this.showToast('❌ AI处理失败');
      }
    } catch (error) {
      // 隐藏加载提示
      this.hideAILoading();
      console.error('AI操作失败:', error);
      this.showToast(`❌ AI操作失败: ${error.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = this.getActionLabel(operation);
      }
    }
  }

  getActionLabel(operation) {
    const labels = {
      polish: '润色',
      simplify: '精简',
      expand: '扩充',
      correct: '纠错',
      translate: '翻译',
      analyze: '分析',
      summary: '摘要'
    };
    return labels[operation] || operation;
  }

  // 绑定事件
  bindEvents() {
    // 保存按钮
    document.getElementById('save-btn').addEventListener('click', () => {
      this.savePrompt();
    });

    // 取消按钮
    document.getElementById('cancel-btn').addEventListener('click', () => {
      window.close();
    });

    // 分类选择变化时，清空新分类输入框
    document.getElementById('edit-category').addEventListener('change', () => {
      document.getElementById('edit-new-category').value = '';
    });
  }

  // 保存提示词
  async savePrompt() {
    const categorySelect = document.getElementById('edit-category');
    const newCategory = document.getElementById('edit-new-category').value.trim();
    const category = newCategory || categorySelect.value;
    const title = document.getElementById('edit-title').value.trim();
    const content = this.easyMDE.value().trim();

    if (!title || !content) {
      this.showToast('请填写标题和内容', 'error');
      return;
    }

    // 使用 dataManager 更新提示词
    const updatedPrompt = await dataManager.updatePrompt(this.promptId, {
      category,
      title,
      content
    });

    if (!updatedPrompt) {
      this.showToast('提示词不存在', 'error');
      return;
    }

    // 通知后台设置已更改（触发刷新）
    chrome.runtime.sendMessage({ action: 'settingsChanged' });

    this.showToast('提示词已保存！');

    // 更新显示时间
    document.getElementById('updated-at').textContent = this.formatDate(updatedPrompt.updatedAt);

    // 2秒后关闭窗口
    setTimeout(() => window.close(), 1500);
  }

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // 显示提示
  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.background = type === 'error' ? '#dc3545' : '#333';
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// 初始化
const editPrompt = new EditPrompt();
