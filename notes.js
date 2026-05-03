// 笔记与提示词管理页面逻辑
class NotesManager {
  constructor() {
    this.currentType = 'notes'; // 'notes' 或 'prompts'
    this.items = [];
    this.filteredItems = [];
    this.currentCategory = 'all';
    this.currentTag = null;
    this.searchQuery = '';
    this.sortBy = 'newest';
    this.viewMode = 'list';
    this.editingId = null;
    this.viewingId = null;
    this.currentTags = [];
    this.editingImages = [];
    this.promptCurrentTags = [];
    this.promptEditor = null; // 提示词 EasyMDE 编辑器实例
    this.noteEditor = null; // 笔记 EasyMDE 编辑器实例
    // 可视化编辑器实例
    this.noteVisualEditor = null;
    this.promptVisualEditor = null;
    this.noteTagEditor = null;
    this.promptTagEditor = null;
    // 编辑器模式：'visual' 或 'markdown'
    this.editorMode = 'visual';
    this.init();
  }
  
  // 获取AI编辑器工具栏配置
  getAIEDitorToolbar() {
    return [
      { name: 'ai-polish', action: (editor) => this.handleAIOperation('polish', editor), className: 'fa fa-magic', title: 'AI润色' },
      { name: 'ai-simplify', action: (editor) => this.handleAIOperation('simplify', editor), className: 'fa fa-compress-alt', title: 'AI精简' },
      { name: 'ai-expand', action: (editor) => this.handleAIOperation('expand', editor), className: 'fa fa-expand', title: 'AI扩充' },
      { name: 'ai-correct', action: (editor) => this.handleAIOperation('correct', editor), className: 'fa fa-spell-check', title: 'AI纠错' },
      { name: 'ai-translate', action: (editor) => this.showTranslateMenu(editor), className: 'fa fa-language', title: 'AI翻译' },
      { name: 'ai-analyze', action: (editor) => this.handleAIOperation('analyze', editor), className: 'fa fa-chart-bar', title: 'AI分析' },
      { name: 'ai-summary', action: (editor) => this.handleAIOperation('summary', editor), className: 'fa fa-list-alt', title: 'AI摘要' },
      { name: 'ai-menu', action: (editor) => this.showAIMenu(editor), className: 'fa fa-ellipsis-h', title: 'AI工具' }
    ];
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

  // 处理AI操作
  async handleAIOperation(operation, editor, targetLang = 'zh') {
    let btn = null;
    try {
      // 获取AI操作管理器实例
      let aiManager;
      if (typeof getAIOperationManager === 'function') {
        aiManager = await getAIOperationManager();
      } else if (typeof aiOperationManager !== 'undefined') {
        aiManager = aiOperationManager;
      } else {
        this.showToast('AI模块未加载，请刷新页面重试', 'error');
        return;
      }

      if (!aiManager || !aiManager.aiService) {
        this.showToast('AI服务未初始化，请先在AI设置中配置API密钥并刷新页面', 'error');
        return;
      }

      // 获取选中的文本 - 兼容 VisualEditor 和 EasyMDE
      let selectedText = '';
      let isVisualEditor = false;
      
      if (editor && editor.codemirror) {
        // EasyMDE 使用 CodeMirror
        selectedText = editor.codemirror.getSelection();
        if (!selectedText || selectedText.trim() === '') {
          editor.codemirror.execCommand('selectAll');
          selectedText = editor.codemirror.getSelection();
        }
      } else if (editor && editor.editArea) {
        // VisualEditor
        isVisualEditor = true;
        const selection = window.getSelection();
        selectedText = selection.toString();
        if (!selectedText || selectedText.trim() === '') {
          editor.editArea.focus();
          document.execCommand('selectAll');
          selectedText = editor.editArea.innerText;
        }
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
          result = await aiManager.optimizeText(selectedText, 'polish');
          break;
        case 'simplify':
          result = await aiManager.optimizeText(selectedText, 'simplify');
          break;
        case 'expand':
          result = await aiManager.generateContent(selectedText, 'extend');
          break;
        case 'correct':
          result = await aiManager.optimizeText(selectedText, 'correct');
          break;
        case 'translate':
          result = await aiManager.translateText(selectedText, targetLang);
          break;
        case 'analyze':
          result = await aiManager.analyzeText(selectedText);
          break;
        case 'summary':
          result = await aiManager.generateSummary(selectedText);
          break;
      }

      // 隐藏加载提示
      this.hideAILoading();

      if (result) {
        // 替换选中的文本
        if (isVisualEditor && editor && editor.editArea) {
          // VisualEditor: 使用 execCommand 插入文本
          document.execCommand('insertText', false, result);
          editor.syncToTextarea();
        } else if (editor && editor.codemirror) {
          // EasyMDE: 使用 CodeMirror 的 replaceSelection
          editor.codemirror.replaceSelection(result);
          editor.codemirror.focus();
        }
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
      // 恢复按钮状态
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

  // 处理 VisualEditor 的 AI 操作
  handleVisualEditorAIAction(action, editor) {
    if (action === 'menu') {
      this.showAIMenu(editor);
    } else if (action === 'translate') {
      this.showTranslateMenu(editor);
    } else {
      this.handleAIOperation(action, editor);
    }
  }

  // 显示AI菜单
  showAIMenu(editor) {
    const menu = document.createElement('div');
    menu.className = 'ai-menu';
    menu.id = 'ai-main-menu';

    const menuItems = [
      { action: 'polish', label: 'AI润色文本' },
      { action: 'simplify', label: 'AI精简文本' },
      { action: 'expand', label: 'AI扩充文本' },
      { action: 'correct', label: 'AI纠错文本' },
      { action: 'translate', label: 'AI翻译文本', isTranslate: true },
      { action: 'analyze', label: 'AI分析文本' },
      { action: 'summary', label: 'AI生成摘要' }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'ai-menu-item';
      menuItem.textContent = item.label;

      if (item.isTranslate) {
        // 翻译选项直接显示语言选择
        menuItem.addEventListener('click', async (e) => {
          e.stopPropagation();
          // 关闭主菜单
          if (menu && menu.parentNode) {
            menu.remove();
          }
          // 直接显示翻译语言选择菜单
          this.showTranslateMenu(editor);
        });
      } else {
        menuItem.addEventListener('click', async () => {
          if (menu && menu.parentNode) {
            menu.remove();
          }
          this.handleAIOperation(item.action, editor);
        });
      }

      menu.appendChild(menuItem);
    });

    this.positionAndShowMenu(menu, editor);
  }

  // 显示翻译语言选择菜单
  showTranslateMenu(editor) {
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

    this.positionAndShowMenu(menu, editor);
  }

  // 定位并显示菜单
  positionAndShowMenu(menu, editor) {
    let toolbar = null;
    
    // 检查是否是 VisualEditor
    if (editor && editor.toolbar) {
      toolbar = editor.toolbar;
    } else if (editor && editor.element) {
      // EasyMDE: 从编辑器元素向上查找 EasyMDEContainer
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
      // 如果找不到toolbar，默认放置在屏幕中央
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

  // 创建翻译子菜单
  createTranslateSubmenu(editor, parentMenu) {
    const submenu = document.createElement('div');
    submenu.className = 'ai-menu ai-translate-submenu';
    
    const languages = [
      { code: 'zh', name: '中文' },
      { code: 'en', name: '英文' },
      { code: 'ja', name: '日文' },
      { code: 'ko', name: '韩文' }
    ];
    
    languages.forEach(lang => {
      const item = document.createElement('div');
      item.className = 'ai-menu-item';
      item.textContent = `翻译成${lang.name}`;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (parentMenu && parentMenu.parentNode) {
          parentMenu.remove();
        }
        if (submenu && submenu.parentNode) {
          submenu.remove();
        }
        this.handleAIOperation('translate', editor, lang.code);
      });
      submenu.appendChild(item);
    });
    
    submenu.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!submenu.matches(':hover')) {
          submenu.remove();
        }
      }, 200);
    });
    
    return submenu;
  }

  async init() {
    await dataManager.init();
    this.loadSettingsToUI(); // 先加载设置（包括视图模式）
    this.loadItems();
    this.bindEvents();
    this.render();
    this.displayVersion(); // 显示版本号
    this.checkUrlParams(); // 检查URL参数，自动打开编辑模态框
  }

  // 检查URL参数，自动打开编辑模态框
  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const editType = urlParams.get('edit');
    const editId = urlParams.get('id');

    if (editType && editId) {
      setTimeout(() => {
        if (editType === 'prompt') {
          this.switchType('prompts');
          setTimeout(() => {
            this.openPromptEditModal(editId);
          }, 100);
        } else if (editType === 'note') {
          this.switchType('notes');
          setTimeout(() => {
            this.openEditModal(editId);
          }, 100);
        }
      }, 300);
    }
  }

  // 显示扩展版本号
  displayVersion() {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;
    const versionEl = document.getElementById('version-info');
    if (versionEl) {
      versionEl.textContent = `v${version}`;
    }
  }

  // 加载项目
  loadItems() {
    if (this.currentType === 'notes') {
      // 笔记收藏：所有普通笔记（非便签）
      this.items = dataManager.items.filter(item => 
        item.type === 'note' && item.clipType !== 'sticky'
      );
    } else if (this.currentType === 'sticky') {
      // 便签：clipType 为 sticky 的笔记
      this.items = dataManager.items.filter(item => 
        item.type === 'note' && item.clipType === 'sticky'
      );
    } else if (this.currentType === 'prompts') {
      this.items = dataManager.items.filter(item => item.type === 'prompt');
    } else if (this.currentType === 'gallery') {
      // 图片相册：收集所有笔记中的图片
      this.items = this.collectAllImages();
    }
    this.applyFilters();
  }

  // 收集所有笔记中的图片
  collectAllImages() {
    const images = [];
    const notes = dataManager.items.filter(item => item.type === 'note');

    notes.forEach(note => {
      if (note.images && note.images.length > 0) {
        note.images.forEach(img => {
          images.push({
            id: `${note.id}-${Math.random().toString(36).substr(2, 9)}`,
            src: img,
            noteId: note.id,
            noteTitle: note.title,
            noteUrl: note.url,
            createdAt: note.createdAt
          });
        });
      }
    });

    return images;
  }

  // 应用筛选和排序
  applyFilters() {
    let result = [...this.items];

    // 按分类筛选
    if (this.currentCategory !== 'all') {
      result = result.filter(item => item.category === this.currentCategory);
    }

    // 按标签筛选
    if (this.currentTag) {
      result = result.filter(item => item.tags && item.tags.includes(this.currentTag));
    }

    // 搜索筛选
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(item =>
        item.title.toLowerCase().includes(query) ||
        (item.content && item.content.toLowerCase().includes(query)) ||
        (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

    // 排序
    result.sort((a, b) => {
      switch (this.sortBy) {
        case 'newest':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'updated':
          return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        default:
          return 0;
      }
    });

    this.filteredItems = result;
  }

  // 绑定事件
  bindEvents() {
    // 内容类型切换
    document.querySelectorAll('#content-type-list .content-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchType(btn.dataset.type);
      });
    });

    // 新建按钮
    document.getElementById('new-item-btn').addEventListener('click', () => {
      if (this.currentType === 'notes' || this.currentType === 'sticky') {
        // 笔记收藏和便签都打开快速添加页面（创建便签）
        this.openQuickNotePage();
      } else {
        this.openPromptModal();
      }
    });

    // 设置按钮
    document.getElementById('settings-btn').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('active');
      this.renderSettingsCategories();
      this.switchSettingsPage('input');
    });

    // 设置页面导航
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        this.switchSettingsPage(page);
      });
    });

    // 搜索
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.applyFilters();
      this.renderItems();
    });

    // 排序
    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.applyFilters();
      this.renderItems();
    });

    // 视图切换
    document.getElementById('view-list').addEventListener('click', () => {
      this.viewMode = 'list';
      this.saveViewMode();
      this.updateViewToggle();
      this.renderItems();
    });
    document.getElementById('view-grid').addEventListener('click', () => {
      this.viewMode = 'grid';
      this.saveViewMode();
      this.updateViewToggle();
      this.renderItems();
    });

    // 布局切换
    document.getElementById('layout-toggle').addEventListener('click', () => {
      this.toggleLayout();
    });

    // 查看模态框关闭
    document.getElementById('view-modal-close').addEventListener('click', () => {
      this.closeViewModal();
    });
    document.getElementById('close-view-modal-btn').addEventListener('click', () => {
      this.closeViewModal();
    });

    // 编辑按钮
    document.getElementById('edit-note-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = this.viewingId;
      this.closeViewModal();
      setTimeout(() => {
        this.openEditModal(id);
      }, 100);
    });

    // 查看模态框删除按钮
    document.getElementById('delete-view-note-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteItemFromView();
    });

    // 编辑模态框关闭
    document.querySelector('#note-modal .modal-close').addEventListener('click', () => {
      this.closeEditModal();
    });
    document.getElementById('close-modal-btn').addEventListener('click', () => {
      this.closeEditModal();
    });

    // 保存笔记
    document.getElementById('save-note-btn').addEventListener('click', () => {
      this.saveNote();
    });

    // 提示词查看模态框
    document.getElementById('prompt-view-modal-close').addEventListener('click', () => {
      this.closePromptViewModal();
    });
    document.getElementById('close-prompt-view-btn').addEventListener('click', () => {
      this.closePromptViewModal();
    });
    document.getElementById('copy-prompt-btn').addEventListener('click', () => {
      this.copyPromptContent();
    });
    document.getElementById('edit-prompt-btn').addEventListener('click', () => {
      const id = this.viewingId;
      this.closePromptViewModal();
      setTimeout(() => {
        this.openPromptEditModal(id);
      }, 100);
    });
    document.getElementById('delete-prompt-btn').addEventListener('click', () => {
      this.deletePrompt();
    });

    // 提示词编辑模态框
    document.querySelector('#prompt-modal .modal-close').addEventListener('click', () => {
      this.closePromptModal();
    });
    document.getElementById('close-prompt-modal-btn').addEventListener('click', () => {
      this.closePromptModal();
    });
    document.getElementById('save-prompt-btn').addEventListener('click', () => {
      this.savePrompt();
    });

    // 预览图片URL输入
    const imageUrlInput = document.getElementById('edit-prompt-image-url');
    if (imageUrlInput) {
      imageUrlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        const previewContainer = document.getElementById('edit-prompt-preview-container');
        const previewImg = document.getElementById('edit-prompt-preview-img');
        const genInfoContainer = document.getElementById('edit-prompt-generation-info');
        
        if (previewContainer && genInfoContainer) {
          if (url) {
            if (previewImg) previewImg.src = url;
            previewContainer.style.display = 'block';
            genInfoContainer.style.display = 'block';
          } else {
            previewContainer.style.display = 'none';
            genInfoContainer.style.display = 'none';
          }
        }
      });
    }

    // 移除预览图片
    const removeImageBtn = document.getElementById('edit-prompt-remove-image');
    if (removeImageBtn) {
      removeImageBtn.addEventListener('click', () => {
        const previewContainer = document.getElementById('edit-prompt-preview-container');
        const imageUrlInput = document.getElementById('edit-prompt-image-url');
        const genInfoContainer = document.getElementById('edit-prompt-generation-info');
        
        if (previewContainer) previewContainer.style.display = 'none';
        if (imageUrlInput) imageUrlInput.value = '';
        if (genInfoContainer) genInfoContainer.style.display = 'none';
      });
    }

    // 上传图片按钮
    document.getElementById('edit-prompt-upload-image').addEventListener('click', () => {
      document.getElementById('edit-prompt-image-file').click();
    });

    // 文件选择
    document.getElementById('edit-prompt-image-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          document.getElementById('edit-prompt-image-url').value = event.target.result;
          document.getElementById('edit-prompt-preview-img').src = event.target.result;
          document.getElementById('edit-prompt-preview-container').style.display = 'block';
          document.getElementById('edit-prompt-generation-info').style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    // 设置模态框
    document.getElementById('settings-modal-close').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('active');
    });
    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('settings-modal')) {
        document.getElementById('settings-modal').classList.remove('active');
      }
    });

    // 设置选项
    document.querySelectorAll('input[name="inject-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        dataManager.settings.injectMode = e.target.value;
        this.updateInjectModeUI(e.target.value);
        this.saveSettings();
      });
    });
    document.getElementById('whitelist').addEventListener('change', (e) => {
      dataManager.settings.whitelist = e.target.value.split('\n').map(s => this.cleanUrl(s.trim())).filter(s => s);
      this.saveSettings();
    });
    document.getElementById('blacklist').addEventListener('change', (e) => {
      dataManager.settings.blacklist = e.target.value.split('\n').map(s => this.cleanUrl(s.trim())).filter(s => s);
      this.saveSettings();
    });

    // 分类管理
    document.getElementById('add-category-btn').addEventListener('click', () => {
      this.addCategory();
    });
    document.getElementById('new-category-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.addCategory();
      }
    });

    // 导入导出
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });
    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file && file instanceof Blob) {
        this.importData(file);
      } else {
        alert('请选择有效的JSON文件');
      }
      // 重置文件输入，允许再次选择同一文件
      e.target.value = '';
    });

    // 屏蔽输入框管理
    document.getElementById('blocked-host-select')?.addEventListener('change', () => {
      this.renderBlockedInputsList();
    });
    document.getElementById('refresh-blocked-btn')?.addEventListener('click', () => {
      this.renderBlockedInputsManager();
    });

    // WebDAV设置
    this.initWebDAVSettings();

    // 监听存储变化
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      if (changes.items || changes.tags || changes.categories) {
        await dataManager.loadData();
        this.loadItems();
        this.render();
      }
    });
  }

  // 切换内容类型
  switchType(type) {
    this.currentType = type;
    this.currentCategory = 'all';
    this.currentTag = null;
    this.searchQuery = '';
    document.getElementById('search-input').value = '';

    // 更新侧边栏选中状态
    document.querySelectorAll('#content-type-list .content-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    // 更新新建按钮文字和显示
    const newItemBtn = document.getElementById('new-item-btn');
    if (newItemBtn) {
      if (type === 'gallery') {
        newItemBtn.style.display = 'none';
      } else {
        newItemBtn.style.display = 'block';
        let btnText = '新建';
        if (type === 'notes' || type === 'sticky') {
          btnText = '便签'; // 笔记和便签都创建便签
        } else if (type === 'prompts') {
          btnText = '提示词';
        }
        newItemBtn.innerHTML = `<span>+</span> 新建${btnText}`;
      }
    }

    // 更新分类区域显示
    document.getElementById('category-section').style.display = type === 'gallery' ? 'none' : 'block';

    // 更新视图切换按钮显示
    const viewToggle = document.querySelector('.view-toggle');
    if (viewToggle) {
      viewToggle.style.display = type === 'gallery' ? 'none' : 'flex';
    }

    this.loadItems();
    this.render();
  }

  // 渲染页面
  render() {
    this.renderCategories();
    this.renderTagCloud();
    this.renderItems();
    this.updateCounts();
    this.updateViewToggle();
  }

  // 渲染分类列表
  renderCategories() {
    const list = document.getElementById('category-list');
    if (!list) return;

    const categories = dataManager.getAllCategories();

    list.innerHTML = `
      <li class="${this.currentCategory === 'all' ? 'active' : ''}" data-category="all">
        <span class="icon">📁</span>
        <span>全部</span>
        <span class="count">${this.items.length}</span>
      </li>
      ${categories.map(cat => {
        const count = this.items.filter(item => item.category === cat).length;
        return `
          <li class="${this.currentCategory === cat ? 'active' : ''}" data-category="${cat}">
            <span class="icon">📂</span>
            <span>${cat}</span>
            <span class="count">${count}</span>
          </li>
        `;
      }).join('')}
    `;

    // 绑定分类点击事件
    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        this.currentCategory = li.dataset.category;
        this.applyFilters();
        this.renderCategories();
        this.renderItems();
      });
    });
  }

  // 渲染标签云
  renderTagCloud() {
    const container = document.getElementById('tag-cloud');
    if (!container) return;

    const tags = dataManager.getAllTags();

    if (tags.length === 0) {
      container.innerHTML = '<p style="color: #999; font-size: 12px;">暂无标签</p>';
      return;
    }

    container.innerHTML = tags.map(tag => {
      const escapedTag = this.escapeHtml(tag);
      return `
        <span class="tag-item ${this.currentTag === tag ? 'active' : ''}" data-tag="${escapedTag}">
          ${escapedTag}
        </span>
      `;
    }).join('');

    // 绑定标签点击事件
    container.querySelectorAll('.tag-item').forEach(tag => {
      tag.addEventListener('click', () => {
        this.selectTag(tag.dataset.tag);
      });
    });
  }

  // 选择标签
  selectTag(tag) {
    this.currentTag = this.currentTag === tag ? null : tag;
    this.applyFilters();
    this.renderTagCloud();
    this.renderItems();
  }

  // 渲染项目列表
  renderItems() {
    const container = document.getElementById('items-container');
    const emptyState = document.getElementById('empty-state');

    if (!container || !emptyState) return;

    if (this.filteredItems.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    // 图片相册使用特殊的网格布局
    if (this.currentType === 'gallery') {
      container.className = 'gallery-grid';
      container.innerHTML = this.filteredItems.map(item => this.createGalleryItem(item)).join('');
      this.bindGalleryEvents();
      return;
    }

    // 便签使用特殊的网格布局
    if (this.currentType === 'sticky') {
      container.className = 'sticky-grid';
      container.innerHTML = this.filteredItems.map(item => this.createStickyCard(item)).join('');
      // 绑定便签卡片事件
      container.querySelectorAll('.sticky-card').forEach(card => {
        card.addEventListener('click', () => {
          this.openNote(card.dataset.id);
        });
      });
      return;
    }

    container.className = this.viewMode === 'grid' ? 'notes-grid' : 'notes-list';

    container.innerHTML = this.filteredItems.map(item => {
      if (this.currentType === 'notes') {
        return this.createNoteCard(item);
      } else {
        return this.createPromptCard(item);
      }
    }).join('');

    // 绑定卡片点击事件
    container.querySelectorAll('.note-card, .prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        if (this.currentType === 'notes') {
          this.openNote(card.dataset.id);
        } else {
          this.openPrompt(card.dataset.id);
        }
      });
    });
  }

  // 创建笔记卡片HTML
  createNoteCard(note) {
    const date = new Date(note.updatedAt || note.createdAt).toLocaleDateString('zh-CN');
    const tagsHtml = note.tags && note.tags.length > 0
      ? note.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')
      : '';
    
    let contentPreview = '';
    let imageHtml = '';
    const hasImages = note.images && note.images.length > 0;

    if (hasImages) {
      const imageUrl = note.images[0];
      imageHtml = `<div class="note-image"><img src="${this.escapeHtml(imageUrl)}" alt="图片" loading="lazy"></div>`;
      if (note.images.length > 1) {
        imageHtml += `<div class="image-count">+${note.images.length - 1}</div>`;
      }
    }

    contentPreview = note.content ? this.stripHtml(note.content).substring(0, hasImages ? 60 : 100) + (note.content.length > (hasImages ? 60 : 100) ? '...' : '') : '';

    return `
      <div class="note-card" data-id="${note.id}">
        <div class="note-header">
          <h3 class="note-title">${this.escapeHtml(note.title)}</h3>
          <span class="note-category">${note.category || '未分类'}</span>
        </div>
        ${imageHtml}
        <div class="note-content">${this.escapeHtml(contentPreview)}</div>
        <div class="note-footer">
          <div class="note-tags">${tagsHtml}</div>
          <div class="note-date">${date}</div>
        </div>
      </div>
    `;
  }

  // 创建便签卡片HTML - 简洁展示
  createStickyCard(sticky) {
    const date = new Date(sticky.updatedAt || sticky.createdAt).toLocaleDateString('zh-CN');
    const time = new Date(sticky.updatedAt || sticky.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    // 便签只展示内容，简洁明了
    const content = sticky.content || '';
    
    // 获取便签颜色（基于分类或随机）
    const colors = ['#fff9c4', '#c8e6c9', '#b3e5fc', '#f8bbd0', '#e1bee7', '#ffe0b2', '#d7ccc8'];
    const colorIndex = sticky.title ? sticky.title.length % colors.length : 0;
    const bgColor = colors[colorIndex];
    
    return `
      <div class="sticky-card" data-id="${sticky.id}" style="background-color: ${bgColor}">
        <div class="sticky-content">${this.escapeHtml(content)}</div>
        <div class="sticky-footer">
          <span class="sticky-date">${date} ${time}</span>
          ${sticky.category && sticky.category !== '未分类' ? `<span class="sticky-category">${this.escapeHtml(sticky.category)}</span>` : ''}
        </div>
      </div>
    `;
  }

  // 创建提示词卡片HTML
  createPromptCard(prompt) {
    const date = new Date(prompt.updatedAt || prompt.createdAt).toLocaleDateString('zh-CN');
    const tagsHtml = prompt.tags && prompt.tags.length > 0
      ? prompt.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')
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
              ${params.map(p => `<span class="param">${this.escapeHtml(p)}</span>`).join('')}
            </div>
          `;
        }
      }

      previewImageHtml = `
        <div class="prompt-preview-image">
          <img src="${this.escapeHtml(prompt.previewImage)}" alt="预览效果" loading="lazy">
          ${paramsHtml ? `<div class="prompt-preview-info">${paramsHtml}</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="prompt-card" data-id="${prompt.id}">
        ${previewImageHtml}
        <div class="prompt-header">
          <h3 class="prompt-title">${this.escapeHtml(prompt.title)}</h3>
          <span class="prompt-category">${prompt.category || '通用'}</span>
        </div>
        <div class="prompt-content">${this.escapeHtml(contentPreview)}</div>
        <div class="prompt-footer">
          <div class="prompt-tags">${tagsHtml}</div>
          <div class="prompt-date">${date}</div>
        </div>
      </div>
    `;
  }

  // 创建图片相册项目
  createGalleryItem(image) {
    const date = new Date(image.createdAt).toLocaleDateString('zh-CN');
    return `
      <div class="gallery-item" data-note-id="${image.noteId}" data-image-src="${this.escapeHtml(image.src)}">
        <div class="gallery-image-wrapper">
          <img src="${this.escapeHtml(image.src)}" alt="${this.escapeHtml(image.noteTitle)}" loading="lazy">
        </div>
        <div class="gallery-info">
          <h4 class="gallery-title">${this.escapeHtml(image.noteTitle)}</h4>
          <span class="gallery-date">${date}</span>
        </div>
      </div>
    `;
  }

  // 绑定图片相册事件
  bindGalleryEvents() {
    const container = document.getElementById('items-container');
    container.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const noteId = item.dataset.noteId;
        const imageSrc = item.dataset.imageSrc;
        this.openImageViewer(imageSrc, noteId);
      });
    });
  }

  // 打开图片查看器
  openImageViewer(imageSrc, noteId) {
    // 创建图片查看模态框
    const modal = document.createElement('div');
    modal.className = 'modal image-viewer-modal active';
    modal.innerHTML = `
      <div class="modal-content image-viewer-content">
        <button class="image-viewer-close">&times;</button>
        <img src="${this.escapeHtml(imageSrc)}" alt="查看图片">
        <div class="image-viewer-actions">
          <button class="btn btn-primary" id="view-source-note">查看来源笔记</button>
          <button class="btn btn-secondary" id="close-image-viewer">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 绑定关闭事件
    modal.querySelector('.image-viewer-close').addEventListener('click', () => {
      modal.remove();
    });
    modal.querySelector('#close-image-viewer').addEventListener('click', () => {
      modal.remove();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // 绑定查看来源笔记事件
    modal.querySelector('#view-source-note').addEventListener('click', () => {
      modal.remove();
      this.openNote(noteId);
    });
  }

  // 打开笔记查看模态框
  openNote(id) {
    const note = dataManager.items.find(n => n.id === id);
    if (!note) return;

    this.viewingId = id;

    document.getElementById('view-note-title').textContent = note.title;
    
    // 渲染分类下拉菜单
    this.renderCategoryDropdown('view-note-category', note.category || '未分类', id);
    
    const contentEl = document.getElementById('view-note-content');
    const imagesEl = document.getElementById('view-note-images');
    const hasImages = note.images && note.images.length > 0;
    if (hasImages) {
      imagesEl.innerHTML = note.images.map(img => `
        <div class="view-image-item">
          <img src="${this.escapeHtml(img)}" alt="图片" loading="lazy" onclick="window.open('${this.escapeHtml(img)}', '_blank')">
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
      // 支持 HTML 和 Markdown 渲染
      const content = note.content || '';
      if (content.includes('<') && content.includes('>')) {
        // 包含 HTML 标签，直接渲染 HTML
        contentEl.innerHTML = content;
      } else if (typeof marked !== 'undefined') {
        // 没有 HTML 标签，尝试用 marked 渲染 Markdown
        contentEl.innerHTML = marked.parse(content);
      } else {
        // 没有 marked 库，使用纯文本
        contentEl.textContent = content;
      }
    }

    const tagsEl = document.getElementById('view-note-tags');
    if (note.tags && note.tags.length > 0) {
      tagsEl.innerHTML = note.tags.map(tag => `<span class="view-tag">${this.escapeHtml(tag)}</span>`).join('');
    } else {
      tagsEl.innerHTML = '';
    }

    const sourceEl = document.getElementById('view-note-source');
    if (note.source || note.url) {
      sourceEl.innerHTML = `
        ${note.source ? `<p>来源：${this.escapeHtml(note.source)}</p>` : ''}
        ${note.url ? `<p>链接：<a href="${this.escapeHtml(note.url)}" target="_blank">${this.escapeHtml(note.url)}</a></p>` : ''}
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

  // 渲染分类下拉菜单
  renderCategoryDropdown(elementId, currentCategory, itemId) {
    const container = document.getElementById(elementId);
    if (!container) return;

    const categories = dataManager.getAllCategories();
    
    container.innerHTML = `
      <div class="category-dropdown" data-item-id="${itemId}">
        <span class="category-dropdown-trigger">
          ${currentCategory} ▼
        </span>
        <div class="category-dropdown-menu">
          ${categories.map(cat => `
            <div class="category-dropdown-item ${cat === currentCategory ? 'active' : ''}" 
                 data-category="${cat}">
              ${cat}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // 绑定下拉菜单事件
    this.bindCategoryDropdownEvents(container, itemId);
  }

  // 绑定分类下拉菜单事件
  bindCategoryDropdownEvents(container, itemId) {
    const dropdown = container.querySelector('.category-dropdown');
    const trigger = container.querySelector('.category-dropdown-trigger');
    const menu = container.querySelector('.category-dropdown-menu');
    
    if (!trigger || !menu) return;

    // 点击触发器切换下拉菜单
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('show');
    });

    // 点击分类项
    menu.querySelectorAll('.category-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const newCategory = item.dataset.category;
        this.changeItemCategory(itemId, newCategory);
      });
    });

    // 点击外部关闭下拉菜单
    const closeDropdown = (e) => {
      if (!container.contains(e.target)) {
        menu.classList.remove('show');
      }
    };
    
    // 移除旧的事件监听器（如果有）
    if (this._closeDropdownHandler) {
      document.removeEventListener('click', this._closeDropdownHandler);
    }
    this._closeDropdownHandler = closeDropdown;
    document.addEventListener('click', closeDropdown);
  }

  // 修改项目分类
  async changeItemCategory(itemId, newCategory) {
    const item = dataManager.items.find(i => i.id === itemId);
    if (!item || item.category === newCategory) return;

    // 使用正确的更新方法来增加版本号
    if (item.type === 'prompt') {
      await dataManager.updatePrompt(itemId, { category: newCategory });
    } else {
      await dataManager.updateNote(itemId, { category: newCategory });
    }
    
    // 刷新显示
    this.loadItems();
    this.render();
    
    // 更新下拉菜单显示（根据项目类型）
    const elementId = item.type === 'prompt' ? 'view-prompt-category' : 'view-note-category';
    this.renderCategoryDropdown(elementId, newCategory, itemId);
    
    this.showToast('分类已更新');
  }

  // 关闭查看模态框
  closeViewModal() {
    document.getElementById('view-modal').classList.remove('active');
    this.viewingId = null;
  }

  // 从查看模态框删除
  async deleteItemFromView() {
    if (!confirm('确定要删除这条笔记吗？')) return;

    await dataManager.deleteItem(this.viewingId);
    this.loadItems();
    this.render();
    this.closeViewModal();
    this.showToast('笔记已删除');
  }

  // 打开编辑模态框
  openEditModal(id) {
    const note = dataManager.items.find(n => n.id === id);
    if (!note) return;

    this.editingId = id;
    this.currentTags = note.tags ? [...note.tags] : [];
    this.editingImages = note.images ? [...note.images] : [];

    document.getElementById('edit-note-title').value = note.title;
    document.getElementById('edit-note-source').value = note.source || '';

    this.renderCategorySelect();
    document.getElementById('edit-note-category').value = note.category || '未分类';
    this.renderEditTags();
    this.renderEditImages();

    document.getElementById('note-meta').innerHTML = `
      <p>创建时间：${new Date(note.createdAt).toLocaleString('zh-CN')}</p>
      <p>更新时间：${new Date(note.updatedAt || note.createdAt).toLocaleString('zh-CN')}</p>
    `;

    // 重置保存按钮状态
    const saveBtn = document.getElementById('save-note-btn');
    if (saveBtn) {
      saveBtn.textContent = '保存';
      saveBtn.disabled = false;
    }

    document.getElementById('note-modal').classList.add('active');
    
    // 初始化编辑器
    this.initNoteEditor(note.content || '');
  }

  // 关闭编辑模态框
  closeEditModal() {
    document.getElementById('note-modal').classList.remove('active');
    this.editingId = null;
    this.currentTags = [];
    this.editingImages = [];
    
    // 销毁可视化编辑器
    if (this.noteVisualEditor) {
      this.noteVisualEditor.destroy();
      this.noteVisualEditor = null;
    }
    
    // 销毁标签编辑器
    if (this.noteTagEditor) {
      this.noteTagEditor.destroy();
      this.noteTagEditor = null;
    }
    
    // 销毁 EasyMDE 编辑器
    if (this.noteEditor) {
      this.noteEditor.toTextArea();
      this.noteEditor = null;
    }
  }

  // 初始化笔记编辑器
  initNoteEditor(content) {
    // 销毁现有编辑器
    if (this.noteVisualEditor) {
      this.noteVisualEditor.destroy();
      this.noteVisualEditor = null;
    }
    if (this.noteEditor) {
      this.noteEditor.toTextArea();
      this.noteEditor = null;
    }
    
    const textarea = document.getElementById('edit-note-content');
    if (!textarea) return;
    
    textarea.value = content;
    
    // 检测内容类型：如果包含 HTML 标签，使用可视化编辑器
    const isHtmlContent = content && content.includes('<') && content.includes('>');
    
    // 优先使用可视化编辑器
    if (typeof VisualEditor !== 'undefined') {
      this.noteVisualEditor = new VisualEditor(textarea, {
        placeholder: '输入笔记内容，支持富文本格式、拖拽/粘贴图片',
        minHeight: '200px',
        maxHeight: '400px',
        onChange: (html) => {
          // 自动保存草稿（可选）
        },
        onAIAction: (action, editor) => {
          this.handleVisualEditorAIAction(action, editor);
        }
      });
      
      // 设置内容
      if (content) {
        this.noteVisualEditor.setContent(content);
      }
    } else if (typeof EasyMDE !== 'undefined') {
      // 回退到 EasyMDE
      this.noteEditor = new EasyMDE({
        element: textarea,
        spellChecker: false,
        autosave: { enabled: false },
        placeholder: '输入笔记内容，支持 Markdown 和 HTML 格式',
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
          { name: 'image', action: EasyMDE.drawImage, className: 'fa fa-picture-o toolbar-btn-text', title: '图片' },
          { name: 'code', action: EasyMDE.toggleCodeBlock, className: 'fa fa-code toolbar-btn-text', title: '代码' },
          '|',
          { name: 'preview', action: EasyMDE.togglePreview, className: 'fa fa-eye no-disable toolbar-btn-text', title: '预览' },
          { name: 'fullscreen', action: EasyMDE.toggleFullScreen, className: 'fa fa-arrows-alt no-disable no-mobile toolbar-btn-text', title: '全屏' }
        ],
        minHeight: '200px',
        maxHeight: '400px'
      });
    }
  }

  // 渲染编辑界面的图片
  renderEditImages() {
    const imagesGroup = document.getElementById('edit-images-group');
    const imagesGrid = document.getElementById('edit-images-grid');
    
    if (this.editingImages && this.editingImages.length > 0) {
      imagesGroup.style.display = 'block';
      imagesGrid.innerHTML = this.editingImages.map((img, index) => `
        <div class="edit-image-item" draggable="true" data-index="${index}">
          <img src="${this.escapeHtml(img)}" alt="图片" loading="lazy">
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

  // 删除图片
  deleteImage(index) {
    if (confirm('确定要删除这张图片吗？')) {
      this.editingImages.splice(index, 1);
      this.renderEditImages();
      this.showToast('图片已删除');
    }
  }

  // 设置拖拽排序
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
        const temp = this.editingImages[draggedIndex];
        this.editingImages.splice(draggedIndex, 1);
        this.editingImages.splice(targetIndex, 0, temp);
      });
    });
  }

  // 渲染分类选择
  renderCategorySelect() {
    const select = document.getElementById('edit-note-category');
    const categories = dataManager.getAllCategories();
    select.innerHTML = categories.map(cat =>
      `<option value="${cat}">${cat}</option>`
    ).join('');
  }

  // 渲染编辑标签
  renderEditTags() {
    const container = document.getElementById('note-tags-container') || document.getElementById('edit-tags-list');
    if (!container) return;
    
    // 销毁现有标签编辑器
    if (this.noteTagEditor) {
      this.noteTagEditor.destroy();
      this.noteTagEditor = null;
    }
    
    // 使用 TagEditor 可视化组件
    if (typeof TagEditor !== 'undefined') {
      this.noteTagEditor = new TagEditor(container, {
        tags: this.currentTags,
        suggestions: dataManager.getAllTags(),
        placeholder: '输入标签，按回车添加',
        onChange: (tags) => {
          this.currentTags = tags;
        }
      });
    } else {
      // 回退到传统方式
      const listContainer = document.getElementById('edit-tags-list') || container;
      listContainer.innerHTML = this.currentTags.map(tag => `
        <span class="tag-item">
          ${tag}
          <span class="remove-tag" data-tag="${tag}">×</span>
        </span>
      `).join('');

      listContainer.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', () => {
          this.removeTag(btn.dataset.tag);
        });
      });
    }
  }

  // 添加标签
  addTag(tag) {
    if (!this.currentTags.includes(tag)) {
      this.currentTags.push(tag);
      this.renderEditTags();
    }
  }

  // 移除标签
  removeTag(tag) {
    this.currentTags = this.currentTags.filter(t => t !== tag);
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

  // 保存笔记
  async saveNote() {
    console.log('开始保存笔记，editingId:', this.editingId);

    const note = dataManager.items.find(n => n.id === this.editingId);
    if (!note) {
      console.error('未找到要保存的笔记');
      this.showToast('❌ 未找到要保存的笔记');
      return;
    }

    let title = document.getElementById('edit-note-title').value.trim();
    // 优先从可视化编辑器获取内容，回退到 EasyMDE
    let content = '';
    if (this.noteVisualEditor) {
      content = this.noteVisualEditor.getContent().trim();
    } else if (this.noteEditor) {
      content = this.noteEditor.value().trim();
    } else {
      content = document.getElementById('edit-note-content')?.value?.trim() || '';
    }
    const category = document.getElementById('edit-note-category').value;
    const source = document.getElementById('edit-note-source').value.trim();
    
    // 从标签编辑器获取标签
    const tags = this.noteTagEditor ? this.noteTagEditor.getTags() : this.currentTags;

    if (!title) {
      title = this.buildAutoTitle(content, tags, this.editingImages);
      document.getElementById('edit-note-title').value = title;
    }

    // 显示保存中状态
    const saveBtn = document.getElementById('save-note-btn');
    const originalText = saveBtn ? saveBtn.textContent : '保存';
    if (saveBtn) {
      saveBtn.textContent = '保存中...';
      saveBtn.disabled = true;
    }

    try {
      console.log('更新笔记数据...');
      
      // 使用 dataManager.updateNote 来正确更新版本号和校验和
      await dataManager.updateNote(this.editingId, {
        title: title,
        content: content,
        category: category,
        tags: tags,
        source: source,
        remark: source,
        excerpt: content.replace(/<[^>]*>/g, '').substring(0, 200) + (content.length > 200 ? '...' : ''),
        images: [...this.editingImages]
      });

      console.log('保存成功！');

      this.loadItems();
      this.render();
      this.closeEditModal();

      // 显示成功提示（带勾选图标）
      this.showToast('✅ 笔记保存成功！');

      // 高亮显示刚保存的笔记卡片
      setTimeout(() => {
        const noteCard = document.querySelector(`[data-id="${this.editingId}"]`);
        if (noteCard) {
          noteCard.classList.add('saved-highlight');
          setTimeout(() => {
            noteCard.classList.remove('saved-highlight');
          }, 2000);
        }
      }, 100);

    } catch (error) {
      console.error('保存笔记失败:', error);
      this.showToast('❌ 保存失败，请重试');
      // 恢复按钮状态（模态框未关闭时）
      if (saveBtn) {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
      }
    }
  }

  // 打开提示词查看
  openPrompt(id) {
    const prompt = dataManager.items.find(p => p.id === id);
    if (!prompt) return;

    this.viewingId = id;

    document.getElementById('view-prompt-title').textContent = prompt.title;
    
    // 渲染预览图片
    const previewContainer = document.getElementById('view-prompt-preview');
    const previewImg = document.getElementById('view-prompt-preview-img');
    const genInfo = document.getElementById('view-prompt-generation-info');
    
    if (prompt.previewImage) {
      previewImg.src = prompt.previewImage;
      previewContainer.style.display = 'block';
      
      // 显示生成信息
      if (prompt.generationInfo) {
        const params = [];
        if (prompt.generationInfo.model) params.push(`模型: ${prompt.generationInfo.model}`);
        if (prompt.generationInfo.steps) params.push(`步数: ${prompt.generationInfo.steps}`);
        if (prompt.generationInfo.cfgScale) params.push(`CFG: ${prompt.generationInfo.cfgScale}`);
        if (prompt.generationInfo.sampler) params.push(`采样器: ${prompt.generationInfo.sampler}`);
        if (prompt.generationInfo.seed) params.push(`种子: ${prompt.generationInfo.seed}`);
        if (prompt.generationInfo.negativePrompt) params.push(`负面: ${prompt.generationInfo.negativePrompt}`);
        
        if (params.length > 0) {
          genInfo.innerHTML = `
            <div class="prompt-preview-info-title">生成参数</div>
            <div class="prompt-generation-params">
              ${params.map(p => `<span class="param">${this.escapeHtml(p)}</span>`).join('')}
            </div>
          `;
          genInfo.style.display = 'block';
        } else {
          genInfo.style.display = 'none';
        }
      } else {
        genInfo.style.display = 'none';
      }
    } else {
      previewContainer.style.display = 'none';
    }
    
    // 渲染分类下拉菜单
    this.renderCategoryDropdown('view-prompt-category', prompt.category || '通用', id);
    
    // 使用 marked 渲染 Markdown 内容
    const contentEl = document.getElementById('view-prompt-content');
    if (typeof marked !== 'undefined' && prompt.content) {
      contentEl.innerHTML = marked.parse(prompt.content);
    } else {
      contentEl.textContent = prompt.content || '';
    }

    const tagsEl = document.getElementById('view-prompt-tags');
    if (prompt.tags && prompt.tags.length > 0) {
      tagsEl.innerHTML = prompt.tags.map(tag => `<span class="view-tag">${this.escapeHtml(tag)}</span>`).join('');
    } else {
      tagsEl.innerHTML = '';
    }

    document.getElementById('view-prompt-meta').innerHTML = `
      <p>创建时间：${new Date(prompt.createdAt).toLocaleString('zh-CN')}</p>
      ${prompt.updatedAt ? `<p>更新时间：${new Date(prompt.updatedAt).toLocaleString('zh-CN')}</p>` : ''}
    `;

    document.getElementById('prompt-view-modal').classList.add('active');
  }

  // 关闭提示词查看
  closePromptViewModal() {
    document.getElementById('prompt-view-modal').classList.remove('active');
    this.viewingId = null;
  }

  // 复制提示词内容
  copyPromptContent() {
    const prompt = dataManager.items.find(p => p.id === this.viewingId);
    if (prompt && prompt.content) {
      navigator.clipboard.writeText(prompt.content).then(() => {
        this.showToast('已复制到剪贴板');
      });
    }
  }

  // 打开提示词编辑
  openPromptEditModal(id) {
    const prompt = dataManager.items.find(p => p.id === id);
    if (!prompt) return;

    this.editingId = id;
    this.promptCurrentTags = prompt.tags ? [...prompt.tags] : [];

    document.getElementById('prompt-modal-title').textContent = '编辑提示词';
    document.getElementById('edit-prompt-title').value = prompt.title;
    document.getElementById('edit-prompt-new-category').value = '';

    // 加载预览图片
    const previewContainer = document.getElementById('edit-prompt-preview-container');
    const previewImg = document.getElementById('edit-prompt-preview-img');
    const imageUrlInput = document.getElementById('edit-prompt-image-url');
    const genInfoContainer = document.getElementById('edit-prompt-generation-info');
    
    if (prompt.previewImage) {
      previewImg.src = prompt.previewImage;
      previewContainer.style.display = 'block';
      imageUrlInput.value = prompt.previewImage;
    } else {
      previewContainer.style.display = 'none';
      imageUrlInput.value = '';
    }
    
    // 加载生成信息
    if (prompt.generationInfo) {
      document.getElementById('edit-gen-model').value = prompt.generationInfo.model || '';
      document.getElementById('edit-gen-steps').value = prompt.generationInfo.steps || '';
      document.getElementById('edit-gen-cfg').value = prompt.generationInfo.cfgScale || '';
      document.getElementById('edit-gen-sampler').value = prompt.generationInfo.sampler || '';
      document.getElementById('edit-gen-seed').value = prompt.generationInfo.seed || '';
      document.getElementById('edit-gen-negative').value = prompt.generationInfo.negativePrompt || '';
      genInfoContainer.style.display = 'block';
    } else {
      document.getElementById('edit-gen-model').value = '';
      document.getElementById('edit-gen-steps').value = '';
      document.getElementById('edit-gen-cfg').value = '';
      document.getElementById('edit-gen-sampler').value = '';
      document.getElementById('edit-gen-seed').value = '';
      document.getElementById('edit-gen-negative').value = '';
      genInfoContainer.style.display = 'none';
    }

    const categories = dataManager.getAllCategories();
    const select = document.getElementById('edit-prompt-category');
    select.innerHTML = categories.map(cat =>
      `<option value="${cat}" ${cat === prompt.category ? 'selected' : ''}>${cat}</option>`
    ).join('');

    this.renderPromptEditTags();
    document.getElementById('prompt-modal').classList.add('active');
    
    // 初始化编辑器
    this.initPromptEditor(prompt.content || '');
  }

  // 打开新建提示词模态框
  openPromptModal() {
    this.editingId = null;
    this.promptCurrentTags = [];

    document.getElementById('prompt-modal-title').textContent = '新建提示词';
    document.getElementById('edit-prompt-title').value = '';
    document.getElementById('edit-prompt-new-category').value = '';

    // 清空预览图片
    document.getElementById('edit-prompt-preview-container').style.display = 'none';
    document.getElementById('edit-prompt-image-url').value = '';
    document.getElementById('edit-prompt-generation-info').style.display = 'none';
    document.getElementById('edit-gen-model').value = '';
    document.getElementById('edit-gen-steps').value = '';
    document.getElementById('edit-gen-cfg').value = '';
    document.getElementById('edit-gen-sampler').value = '';
    document.getElementById('edit-gen-seed').value = '';
    document.getElementById('edit-gen-negative').value = '';

    const categories = dataManager.getAllCategories();
    const select = document.getElementById('edit-prompt-category');
    select.innerHTML = categories.map(cat =>
      `<option value="${cat}">${cat}</option>`
    ).join('');

    this.renderPromptEditTags();
    document.getElementById('prompt-modal').classList.add('active');
    
    // 初始化编辑器
    this.initPromptEditor('');
  }

  // 关闭提示词模态框
  closePromptModal() {
    document.getElementById('prompt-modal').classList.remove('active');
    this.editingId = null;
    this.promptCurrentTags = [];
    
    // 销毁可视化编辑器
    if (this.promptVisualEditor) {
      this.promptVisualEditor.destroy();
      this.promptVisualEditor = null;
    }
    
    // 销毁标签编辑器
    if (this.promptTagEditor) {
      this.promptTagEditor.destroy();
      this.promptTagEditor = null;
    }
    
    // 销毁 EasyMDE 编辑器
    if (this.promptEditor) {
      this.promptEditor.toTextArea();
      this.promptEditor = null;
    }
  }

  // 初始化提示词编辑器 - 使用可视化编辑器
  initPromptEditor(content) {
    // 销毁现有编辑器
    if (this.promptVisualEditor) {
      this.promptVisualEditor.destroy();
      this.promptVisualEditor = null;
    }
    if (this.promptEditor) {
      this.promptEditor.toTextArea();
      this.promptEditor = null;
    }
    
    const textarea = document.getElementById('edit-prompt-content');
    if (!textarea) return;
    
    textarea.value = content;
    
    // 使用可视化编辑器
    if (typeof VisualEditor !== 'undefined') {
      this.promptVisualEditor = new VisualEditor(textarea, {
        placeholder: '输入提示词内容，支持富文本格式',
        minHeight: '200px',
        maxHeight: '400px',
        onAIAction: (action, editor) => {
          this.handleVisualEditorAIAction(action, editor);
        }
      });
      
      if (content) {
        this.promptVisualEditor.setContent(content);
      }
    } else if (typeof EasyMDE !== 'undefined') {
      // 回退到 EasyMDE
      this.promptEditor = new EasyMDE({
        element: textarea,
        spellChecker: false,
        autosave: { enabled: false },
        placeholder: '输入提示词内容，支持 Markdown 格式...',
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
          { name: 'image', action: EasyMDE.drawImage, className: 'fa fa-picture-o toolbar-btn-text', title: '图片' },
          { name: 'code', action: EasyMDE.toggleCodeBlock, className: 'fa fa-code toolbar-btn-text', title: '代码' },
          '|',
          { name: 'preview', action: EasyMDE.togglePreview, className: 'fa fa-eye no-disable toolbar-btn-text', title: '预览' },
          { name: 'fullscreen', action: EasyMDE.toggleFullScreen, className: 'fa fa-arrows-alt no-disable no-mobile toolbar-btn-text', title: '全屏' }
        ],
        minHeight: '200px',
        maxHeight: '400px'
      });
    }
  }

  // 渲染提示词编辑标签
  renderPromptEditTags() {
    const container = document.getElementById('prompt-tags-container') || document.getElementById('edit-prompt-tags-list');
    if (!container) return;
    
    // 销毁现有标签编辑器
    if (this.promptTagEditor) {
      this.promptTagEditor.destroy();
      this.promptTagEditor = null;
    }
    
    // 使用 TagEditor 可视化组件
    if (typeof TagEditor !== 'undefined') {
      this.promptTagEditor = new TagEditor(container, {
        tags: this.promptCurrentTags,
        suggestions: dataManager.getAllTags(),
        placeholder: '输入标签，按回车添加',
        onChange: (tags) => {
          this.promptCurrentTags = tags;
        }
      });
    } else {
      // 回退到传统方式
      const listContainer = document.getElementById('edit-prompt-tags-list') || container;
      listContainer.innerHTML = this.promptCurrentTags.map(tag => `
        <span class="tag-item">
          ${tag}
          <span class="remove-tag" data-tag="${tag}">×</span>
        </span>
      `).join('');

      listContainer.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', () => {
          this.removePromptTag(btn.dataset.tag);
        });
      });
    }
  }

  // 添加提示词标签
  addPromptTag(tag) {
    if (!this.promptCurrentTags.includes(tag)) {
      this.promptCurrentTags.push(tag);
      this.renderPromptEditTags();
    }
  }

  // 移除提示词标签
  removePromptTag(tag) {
    this.promptCurrentTags = this.promptCurrentTags.filter(t => t !== tag);
    this.renderPromptEditTags();
  }

  // 保存提示词
  async savePrompt() {
    const title = document.getElementById('edit-prompt-title').value.trim();
    // 优先从可视化编辑器获取内容
    let content = '';
    if (this.promptVisualEditor) {
      content = this.promptVisualEditor.getContent().trim();
    } else if (this.promptEditor) {
      content = this.promptEditor.value().trim();
    } else {
      content = document.getElementById('edit-prompt-content')?.value?.trim() || '';
    }
    const newCategory = document.getElementById('edit-prompt-new-category').value.trim();
    const category = newCategory || document.getElementById('edit-prompt-category').value;
    const previewImage = document.getElementById('edit-prompt-image-url').value.trim();
    
    // 从标签编辑器获取标签
    const tags = this.promptTagEditor ? this.promptTagEditor.getTags() : this.promptCurrentTags;
    
    // 获取生成信息
    const genInfo = {
      model: document.getElementById('edit-gen-model').value.trim(),
      steps: document.getElementById('edit-gen-steps').value.trim(),
      cfgScale: document.getElementById('edit-gen-cfg').value.trim(),
      sampler: document.getElementById('edit-gen-sampler').value.trim(),
      seed: document.getElementById('edit-gen-seed').value.trim(),
      negativePrompt: document.getElementById('edit-gen-negative').value.trim()
    };
    
    // 如果生成信息为空，则设置为 null
    const hasGenInfo = genInfo.model || genInfo.steps || genInfo.cfgScale || 
                       genInfo.sampler || genInfo.seed || genInfo.negativePrompt;
    const generationInfo = hasGenInfo ? genInfo : null;

    if (!title || !content) {
      alert('标题和内容不能为空');
      return;
    }

    if (this.editingId) {
      // 编辑模式 - 使用 updatePrompt 来正确更新版本号
      await dataManager.updatePrompt(this.editingId, {
        title: title,
        content: content,
        category: category,
        tags: tags,
        previewImage: previewImage,
        generationInfo: generationInfo
      });
    } else {
      // 新建模式
      await dataManager.addPrompt({
        title,
        content,
        category,
        tags: tags,
        previewImage,
        generationInfo
      });
    }

    this.loadItems();
    this.render();
    this.closePromptModal();
    this.showToast(this.editingId ? '提示词已更新' : '提示词已创建');
  }

  // 删除提示词
  async deletePrompt() {
    if (!confirm('确定要删除这个提示词吗？')) return;

    await dataManager.deleteItem(this.viewingId);
    this.loadItems();
    this.render();
    this.closePromptViewModal();
    this.showToast('提示词已删除');
  }

  // 更新视图切换按钮
  updateViewToggle() {
    const viewListEl = document.getElementById('view-list');
    const viewGridEl = document.getElementById('view-grid');

    if (viewListEl) viewListEl.classList.toggle('active', this.viewMode === 'list');
    if (viewGridEl) viewGridEl.classList.toggle('active', this.viewMode === 'grid');
  }

  // 更新计数
  updateCounts() {
    const notesCount = dataManager.items.filter(item => item.type === 'note' && item.clipType !== 'sticky').length;
    const stickyCount = dataManager.items.filter(item => item.type === 'note' && item.clipType === 'sticky').length;
    const promptsCount = dataManager.items.filter(item => item.type === 'prompt').length;
    const imagesCount = this.collectAllImages().length;

    const countNotesEl = document.getElementById('count-notes');
    const countStickyEl = document.getElementById('count-sticky');
    const countPromptsEl = document.getElementById('count-prompts');
    const countImagesEl = document.getElementById('count-images');
    const countAllEl = document.getElementById('count-all');

    if (countNotesEl) countNotesEl.textContent = notesCount;
    if (countStickyEl) countStickyEl.textContent = stickyCount;
    if (countPromptsEl) countPromptsEl.textContent = promptsCount;
    if (countImagesEl) countImagesEl.textContent = imagesCount;
    if (countAllEl) countAllEl.textContent = this.items.length;
  }

  // 打开快速笔记页面
  openQuickNotePage() {
    const quickNoteUrl = chrome.runtime.getURL('quick-note.html');
    window.open(quickNoteUrl, '_blank');
  }

  // HTML转义
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 去除 HTML 标签，获取纯文本
  stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // 显示提示
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // 设置相关方法
  loadSettingsToUI() {
    const settings = dataManager.settings;
    const injectMode = settings.injectMode || 'all';
    document.querySelector(`input[name="inject-mode"][value="${injectMode}"]`).checked = true;
    document.getElementById('whitelist').value = (settings.whitelist || []).join('\n');
    document.getElementById('blacklist').value = (settings.blacklist || []).join('\n');
    this.updateInjectModeUI(injectMode);

    // 加载布局设置（包括视图模式）
    this.loadLayout();
    // 更新视图切换按钮状态
    this.updateViewToggle();
  }

  // 加载布局设置
  loadLayout() {
    console.log('加载布局设置，当前settings:', dataManager.settings);

    const sidebarPosition = dataManager.settings.sidebarPosition || 'left';
    const appContainer = document.querySelector('.app-container');
    if (sidebarPosition === 'right') {
      appContainer.classList.add('sidebar-right');
    } else {
      appContainer.classList.remove('sidebar-right');
    }

    // 加载视图模式
    const savedViewMode = dataManager.settings.viewMode;
    console.log('保存的视图模式:', savedViewMode);
    if (savedViewMode && (savedViewMode === 'list' || savedViewMode === 'grid')) {
      this.viewMode = savedViewMode;
      console.log('已加载视图模式:', this.viewMode);
    }
  }

  // 保存视图模式
  async saveViewMode() {
    console.log('保存视图模式:', this.viewMode);
    dataManager.settings.viewMode = this.viewMode;
    console.log('设置已更新:', dataManager.settings);
    await this.saveSettings();
    console.log('设置已保存到存储');
  }

  // 切换布局
  async toggleLayout() {
    const appContainer = document.querySelector('.app-container');
    const isRight = appContainer.classList.toggle('sidebar-right');
    dataManager.settings.sidebarPosition = isRight ? 'right' : 'left';
    await this.saveSettings();
    this.showToast(isRight ? '侧边栏已切换到右侧' : '侧边栏已切换到左侧');
  }

  updateInjectModeUI(mode) {
    document.getElementById('whitelist-group').style.display = mode === 'whitelist' ? 'block' : 'none';
    document.getElementById('blacklist-group').style.display = mode === 'blacklist' ? 'block' : 'none';
  }

  // 清理 URL，去除 http/https 前缀和路径
  cleanUrl(url) {
    if (!url) return url;
    return url
      .toLowerCase()
      .replace(/^(https?:\/\/)?/, '') // 去除 http:// 或 https:// 前缀
      .replace(/\/.*$/, ''); // 去除路径部分
  }

  async saveSettings() {
    await dataManager.saveData();
    chrome.runtime.sendMessage({ action: 'settingsChanged' });
  }

  switchSettingsPage(page) {
    document.querySelectorAll('.settings-page').forEach(p => {
      p.classList.remove('active');
    });
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`.settings-nav-btn[data-page="${page}"]`).classList.add('active');
  }

  renderSettingsCategories() {
    const categories = dataManager.getAllCategories();
    const container = document.getElementById('settings-category-list');
    container.innerHTML = categories.map(cat => `
      <div class="category-list-item">
        <span>${cat}</span>
        <button class="btn btn-small btn-danger delete-category-btn" data-category="${cat}">删除</button>
      </div>
    `).join('');

    container.querySelectorAll('.delete-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteCategory(btn.dataset.category);
      });
    });
    
    // 渲染屏蔽输入框管理
    this.renderBlockedInputsManager();
  }
  
  // 渲染屏蔽输入框管理
  renderBlockedInputsManager() {
    const hostSelect = document.getElementById('blocked-host-select');
    const blockedInputs = dataManager.settings.blockedInputs || {};
    const hosts = Object.keys(blockedInputs);
    
    // 分类：本地服务和远程网站
    const localHosts = hosts.filter(h => h.includes('localhost') || h.includes('127.0.0.1'));
    const remoteHosts = hosts.filter(h => !h.includes('localhost') && !h.includes('127.0.0.1'));
    
    // 更新网站选择下拉框，分组显示
    const currentValue = hostSelect.value;
    hostSelect.innerHTML = `
      <option value="">选择网站...</option>
      ${localHosts.length > 0 ? `<optgroup label="本地服务（按端口区分）">${localHosts.map(host => `<option value="${host}">${host} (${blockedInputs[host].length})</option>`).join('')}</optgroup>` : ''}
      ${remoteHosts.length > 0 ? `<optgroup label="远程网站">${remoteHosts.map(host => `<option value="${host}">${host} (${blockedInputs[host].length})</option>`).join('')}</optgroup>` : ''}
    `;
    if (hosts.includes(currentValue)) {
      hostSelect.value = currentValue;
    }
    
    // 渲染当前选中网站的屏蔽列表
    this.renderBlockedInputsList();
  }
  
  // 渲染屏蔽输入框列表
  renderBlockedInputsList() {
    const container = document.getElementById('blocked-inputs-list');
    const hostSelect = document.getElementById('blocked-host-select');
    const hostname = hostSelect.value;
    
    if (!hostname) {
      container.innerHTML = '<div style="color: #999; font-size: 13px; padding: 8px;">请选择要管理的网站</div>';
      return;
    }
    
    const blockedInputs = dataManager.settings.blockedInputs || {};
    const inputs = blockedInputs[hostname] || [];
    
    if (inputs.length === 0) {
      container.innerHTML = '<div style="color: #999; font-size: 13px; padding: 8px;">该网站没有屏蔽的输入框</div>';
      return;
    }
    
    container.innerHTML = inputs.map((inputId, index) => {
      // 简化显示，只显示类型和前20个字符
      const type = inputId.split(':')[0];
      const value = inputId.split(':').slice(1).join(':').substring(0, 30);
      const displayText = `[${type}] ${value}${inputId.length > 30 ? '...' : ''}`;
      
      return `
        <div class="category-list-item" style="font-size: 12px;">
          <span title="${inputId}">${displayText}</span>
          <button class="btn btn-small btn-danger unblock-input-btn" data-host="${hostname}" data-index="${index}">解除</button>
        </div>
      `;
    }).join('');
    
    // 绑定解除屏蔽事件
    container.querySelectorAll('.unblock-input-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.unblockInput(btn.dataset.host, parseInt(btn.dataset.index));
      });
    });
  }
  
  // 解除屏蔽
  async unblockInput(hostname, index) {
    const blockedInputs = dataManager.settings.blockedInputs || {};
    if (blockedInputs[hostname]) {
      blockedInputs[hostname].splice(index, 1);
      
      // 如果该网站没有屏蔽的输入框了，删除该网站的条目
      if (blockedInputs[hostname].length === 0) {
        delete blockedInputs[hostname];
      }
      
      await dataManager.saveData();
      this.renderBlockedInputsManager();
      this.showToast('已解除屏蔽');
    }
  }

  async addCategory() {
    const input = document.getElementById('new-category-input');
    const category = input.value.trim();
    if (!category) return;

    const categories = dataManager.getAllCategories();
    if (!categories.includes(category)) {
      categories.push(category);
      await dataManager.saveData();
      this.renderSettingsCategories();
      input.value = '';
      this.showToast('分类已添加');
    } else {
      alert('分类已存在');
    }
  }

  async deleteCategory(category) {
    if (!confirm(`确定要删除分类"${category}"吗？`)) return;

    await dataManager.deleteCategory(category);
    this.renderSettingsCategories();
    this.loadItems();
    this.render();
    this.showToast('分类已删除');
  }

  async exportData() {
    try {
      const result = await dataManager.exportData();
      this.showToast(`已导出到: ${result.filename || 'NotebookBackup 文件夹'}`);
    } catch (error) {
      this.showToast('导出失败: ' + error.message);
    }
  }

  async importData(file) {
    try {
      // 验证文件对象
      if (!file || !(file instanceof Blob)) {
        throw new Error('无效的文件对象');
      }

      // 调用 dataManager 的导入方法
      const result = await dataManager.importData(file);
      this.loadItems();
      this.render();
      this.showToast(`导入成功！新增 ${result.added} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`);
    } catch (error) {
      alert('导入失败：' + error.message);
    }
  }

  // ========== WebDAV设置 ==========
  initWebDAVSettings() {
    const enabledCheckbox = document.getElementById('webdav-enabled');
    const configDiv = document.getElementById('webdav-config');
    const serverInput = document.getElementById('webdav-server');
    const usernameInput = document.getElementById('webdav-username');
    const passwordInput = document.getElementById('webdav-password');
    const pathInput = document.getElementById('webdav-path');
    const filenameInput = document.getElementById('webdav-filename');
    const autoSyncCheckbox = document.getElementById('webdav-auto-sync');
    const syncOnChangeCheckbox = document.getElementById('webdav-sync-on-change');
    const syncIntervalSelect = document.getElementById('webdav-sync-interval');
    const conflictResolutionSelect = document.getElementById('webdav-conflict-resolution');
    const testBtn = document.getElementById('webdav-test-btn');
    const saveBtn = document.getElementById('webdav-save-btn');
    const uploadBtn = document.getElementById('webdav-upload-btn');
    const downloadBtn = document.getElementById('webdav-download-btn');
    const statusDiv = document.getElementById('webdav-status');
    const syncInfoDiv = document.getElementById('webdav-sync-info');
    const syncStatusText = document.getElementById('sync-status-text');
    const syncLastTime = document.getElementById('sync-last-time');

    if (!enabledCheckbox) return;

    // 加载现有配置
    const webdavConfig = dataManager.settings.webdav || {};
    
    enabledCheckbox.checked = webdavConfig.enabled || false;
    serverInput.value = webdavConfig.serverUrl || '';
    usernameInput.value = webdavConfig.username || '';
    passwordInput.value = webdavConfig.password || '';
    pathInput.value = webdavConfig.syncPath || '/notebook-sync/';
    filenameInput.value = webdavConfig.filename || 'notebook-data.json';
    
    // 从独立的 syncConfig 加载同步配置
    const loadSyncConfig = async () => {
      try {
        const result = await chrome.storage.local.get('syncConfig');
        const syncConfig = result.syncConfig || {};
        
        console.log('=== 加载同步配置 ===');
        console.log('原始 storage syncConfig:', result);
        console.log('解析后的 syncConfig:', syncConfig);
        
        autoSyncCheckbox.checked = syncConfig.autoSync !== false;
        syncOnChangeCheckbox.checked = syncConfig.syncOnChange !== false;
        
        // 确保 syncInterval 是字符串，用于匹配 select 的 value
        const intervalValue = syncConfig.syncInterval !== undefined ? syncConfig.syncInterval : 5;
        const intervalString = String(intervalValue);
        
        console.log('间隔时间 - 原始值:', syncConfig.syncInterval, '类型:', typeof syncConfig.syncInterval);
        console.log('间隔时间 - 转换后:', intervalString);
        console.log('可用选项:', Array.from(syncIntervalSelect.options).map(o => ({ value: o.value, text: o.text })));
        
        // 检查选项是否存在
        const optionExists = Array.from(syncIntervalSelect.options).some(o => o.value === intervalString);
        console.log('选项是否存在:', optionExists);
        
        if (optionExists) {
          syncIntervalSelect.value = intervalString;
        } else {
          console.warn('间隔时间选项不存在:', intervalString, '使用默认值5');
          syncIntervalSelect.value = '5';
        }
        
        conflictResolutionSelect.value = syncConfig.conflictResolution || 'newest';
        
        console.log('=== 同步配置加载完成 ===');
      } catch (error) {
        console.error('加载同步配置失败:', error);
      }
    };
    
    // 立即加载配置
    loadSyncConfig();

    // 根据启用状态显示/隐藏配置
    configDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';

    // 启用/禁用切换
    enabledCheckbox.addEventListener('change', () => {
      configDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
    });

    // 显示状态消息
    const showStatus = (message, isError = false) => {
      statusDiv.textContent = message;
      statusDiv.style.display = 'block';
      statusDiv.style.background = isError ? '#f8d7da' : '#d4edda';
      statusDiv.style.color = isError ? '#721c24' : '#155724';
      statusDiv.style.border = `1px solid ${isError ? '#f5c6cb' : '#c3e6cb'}`;
    };

    // 更新同步信息显示
    const updateSyncInfo = (status, lastTime) => {
      syncInfoDiv.style.display = 'block';
      const statusMap = {
        'syncing': { icon: '↻', text: '正在同步...', color: '#1976d2' },
        'success': { icon: '✓', text: '同步正常', color: '#388e3c' },
        'error': { icon: '!', text: '同步失败', color: '#d32f2f' }
      };
      const info = statusMap[status] || statusMap['success'];
      document.getElementById('sync-status-icon').textContent = info.icon;
      syncStatusText.textContent = info.text;
      syncStatusText.style.color = info.color;
      if (lastTime) {
        syncLastTime.textContent = '上次同步: ' + new Date(lastTime).toLocaleString();
      }
    };

    // 获取当前配置
    const getConfig = () => ({
      enabled: enabledCheckbox.checked,
      serverUrl: serverInput.value.trim(),
      username: usernameInput.value.trim(),
      password: passwordInput.value,
      syncPath: pathInput.value.trim() || '/notebook-sync/',
      filename: filenameInput.value.trim() || 'notebook-data.json'
    });

    // 获取同步配置
    const getSyncConfig = () => {
      const intervalValue = parseFloat(syncIntervalSelect.value);
      console.log('获取同步配置 - 间隔时间:', intervalValue, '原始值:', syncIntervalSelect.value);
      
      return {
        enabled: enabledCheckbox.checked,
        autoSync: autoSyncCheckbox.checked,
        syncOnChange: syncOnChangeCheckbox.checked,
        syncInterval: intervalValue,
        conflictResolution: conflictResolutionSelect.value
      };
    };

    // 监听同步状态消息
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'syncStatus') {
        updateSyncInfo(message.status, message.timestamp);
      }
    });

    // 测试连接
    testBtn?.addEventListener('click', async () => {
      const config = getConfig();
      if (!config.serverUrl || !config.username || !config.password) {
        showStatus('请填写完整的服务器地址、用户名和密码', true);
        return;
      }

      testBtn.disabled = true;
      testBtn.textContent = '🔌 测试中...';

      try {
        const client = new WebDAVClient(config);
        const result = await client.testConnection();
        showStatus(result.message, !result.success);
      } catch (error) {
        showStatus('测试失败: ' + error.message, true);
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = '🔌 测试连接';
      }
    });

    // 保存配置
    saveBtn?.addEventListener('click', async () => {
      const config = getConfig();
      const syncCfg = getSyncConfig();
      
      console.log('=== 保存配置开始 ===');
      console.log('WebDAV配置:', config);
      console.log('同步配置:', syncCfg);
      console.log('间隔时间值:', syncCfg.syncInterval, typeof syncCfg.syncInterval);
      
      try {
        // 使用独立的 WebDAV 配置管理器保存配置（更可靠）
        const webdavResult = await webdavConfigManager.saveConfig(config);
        console.log('WebDAV 配置保存结果:', webdavResult);
        
        if (!webdavResult.success) {
          showStatus('WebDAV 配置保存失败: ' + webdavResult.error, true);
          return;
        }
        
        // 同时保存到 settings 以保持兼容性
        dataManager.settings.webdav = config;
        await dataManager.saveData();
        console.log('dataManager.saveData() 完成');
        
        // 保存 syncConfig 到独立的存储（供 background.js 使用）
        const syncConfigResult = await chrome.storage.local.set({ syncConfig: syncCfg });
        console.log('syncConfig 保存结果:', syncConfigResult);
        
        // 验证保存结果
        const verifyResult = await chrome.storage.local.get('syncConfig');
        console.log('验证保存 - syncConfig:', verifyResult.syncConfig);
        
        // 通知 background.js 配置已更改
        await chrome.runtime.sendMessage({ action: 'settingsChanged' });
        console.log('已通知 background.js 配置更改');
        
        showStatus('配置已保存');
        console.log('=== 保存配置完成 ===');
      } catch (error) {
        console.error('保存配置失败:', error);
        showStatus('保存失败: ' + error.message, true);
      }
    });

    // 上传数据
    uploadBtn?.addEventListener('click', async () => {
      const config = getConfig();
      if (!config.enabled) {
        showStatus('请先启用WebDAV同步', true);
        return;
      }

      uploadBtn.disabled = true;
      uploadBtn.textContent = '⬆️ 上传中...';

      try {
        const client = new WebDAVClient(config);
        const dataToSync = {
          items: dataManager.items,
          deletedItems: dataManager.deletedItems || [],
          deletedCategories: dataManager.deletedCategories || [],
          tags: Array.from(dataManager.tags),
          categories: Array.from(dataManager.categories),
          settings: dataManager.settings,
          lastSyncTime: Date.now()
        };

        const result = await client.syncUpload(dataToSync);
        showStatus(result.message, !result.success);
      } catch (error) {
        showStatus('上传失败: ' + error.message, true);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '⬆️ 上传数据';
      }
    });

    // 下载数据
    downloadBtn?.addEventListener('click', async () => {
      const config = getConfig();
      if (!config.enabled) {
        showStatus('请先启用WebDAV同步', true);
        return;
      }

      downloadBtn.disabled = true;
      downloadBtn.textContent = '⬇️ 下载中...';

      try {
        const client = new WebDAVClient(config);
        const result = await client.syncDownload();

        if (result.success && result.data) {
          if (confirm('下载成功！是否用远程数据覆盖本地数据？\n\n远程数据时间: ' + new Date(result.timestamp).toLocaleString())) {
            if (result.data.items) {
              dataManager.items = result.data.items;
            }
            if (result.data.deletedItems) {
              dataManager.deletedItems = result.data.deletedItems;
            }
            if (result.data.deletedCategories) {
              dataManager.deletedCategories = result.data.deletedCategories;
            }
            if (result.data.tags) {
              dataManager.tags = new Set(result.data.tags);
            }
            if (result.data.categories) {
              dataManager.categories = new Set(result.data.categories);
            }
            await dataManager.saveData();
            this.loadItems();
            this.render();
            showStatus('数据已同步到本地');
          }
        } else {
          showStatus(result.error || '下载失败：无有效数据', true);
        }
      } catch (error) {
        console.error('下载错误:', error);
        showStatus('下载失败: ' + error.message, true);
      } finally {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '⬇️ 下载数据';
      }
    });
    
    // 导出同步日志
    const exportLogBtn = document.getElementById('export-sync-log-btn');
    exportLogBtn?.addEventListener('click', async () => {
      try {
        exportLogBtn.disabled = true;
        exportLogBtn.textContent = '导出中...';
        
        const response = await chrome.runtime.sendMessage({ action: 'exportSyncLog' });
        
        if (response && response.success && response.logs) {
          const blob = new Blob([response.logs], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `sync-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
          a.click();
          URL.revokeObjectURL(url);
          showStatus('日志已导出');
        } else {
          showStatus('导出失败: ' + (response?.error || '未知错误'), true);
        }
      } catch (error) {
        showStatus('导出失败: ' + error.message, true);
      } finally {
        exportLogBtn.disabled = false;
        exportLogBtn.textContent = '📋 导出同步日志';
      }
    });
    
    // 清除同步日志
    const clearLogBtn = document.getElementById('clear-sync-log-btn');
    clearLogBtn?.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({ action: 'clearSyncLog' });
        showStatus('日志已清除');
      } catch (error) {
        showStatus('清除失败: ' + error.message, true);
      }
    });
  }
}

// 初始化
const notesManager = new NotesManager();
