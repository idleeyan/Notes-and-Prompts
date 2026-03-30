// 核心模块 - NotesManager 主类
class NotesManager {
  constructor() {
    this.currentType = 'notes';
    this.items = [];
    this.filteredItems = [];
    this.currentTag = null;
    this.searchQuery = '';
    this.sortBy = 'newest';
    this.viewMode = 'list';
    this.editingId = null;
    this.viewingId = null;
    this.currentTags = [];
    this.editingImages = [];
    this.promptCurrentTags = [];
    this.promptEditor = null;
    this.noteEditor = null;
    this.noteVisualEditor = null;
    this.promptVisualEditor = null;
    this.noteTagEditor = null;
    this.promptTagEditor = null;
    this.noteEnhancedEditor = null;
    this.promptEnhancedEditor = null;
    this.editorMode = 'visual';

    this.ui = new NotesUI(this);
    this.editor = new NotesEditor(this);
    this.promptEditor_module = new NotesPromptEditor(this);
    this.webdav = new NotesWebDAV(this);
    this.settings = new NotesSettings(this);

    this.init();
  }

  async init() {
    await dataManager.init();
    this.settings.loadSettingsToUI();
    this.loadItems();
    this.bindEvents();
    this.render();
    this.displayVersion();
    this.checkUrlParams();
  }

  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const editType = urlParams.get('edit');
    const editId = urlParams.get('id');

    if (editType && editId) {
      setTimeout(() => {
        if (editType === 'prompt') {
          this.switchType('prompts');
          setTimeout(() => {
            this.promptEditor_module.openPromptEditModal(editId);
          }, 100);
        } else if (editType === 'note') {
          this.switchType('notes');
          setTimeout(() => {
            this.editor.openEditModal(editId);
          }, 100);
        }
      }, 300);
    }
  }

  displayVersion() {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;
    const versionEl = document.getElementById('version-info');
    if (versionEl) {
      versionEl.textContent = `v${version}`;
    }
  }

  loadItems() {
    if (this.currentType === 'notes') {
      this.items = dataManager.items.filter(item => 
        item.type === 'note' && item.clipType !== 'sticky'
      );
    } else if (this.currentType === 'sticky') {
      this.items = dataManager.items.filter(item => 
        item.type === 'note' && item.clipType === 'sticky'
      );
    } else if (this.currentType === 'prompts') {
      this.items = dataManager.items.filter(item => item.type === 'prompt');
    } else if (this.currentType === 'gallery') {
      this.items = this.collectAllImages();
    }
    this.applyFilters();
  }

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

  applyFilters() {
    let result = [...this.items];

    if (this.currentTag) {
      result = result.filter(item => item.tags && item.tags.includes(this.currentTag));
    }

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(item =>
        item.title.toLowerCase().includes(query) ||
        (item.content && item.content.toLowerCase().includes(query)) ||
        (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }

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

  bindEvents() {
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchType(btn.dataset.type);
      });
    });

    document.getElementById('new-item-btn').addEventListener('click', () => {
      if (this.currentType === 'notes') {
        this.openQuickNotePage('normal');
      } else if (this.currentType === 'sticky') {
        this.openQuickNotePage('sticky');
      } else if (this.currentType === 'prompts') {
        this.promptEditor_module.openPromptModal();
      }
    });

    document.getElementById('settings-btn').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('active');
    });

    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        this.settings.switchSettingsPage(page);
      });
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.applyFilters();
      this.ui.renderItems();
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.applyFilters();
      this.ui.renderItems();
    });

    document.getElementById('view-list').addEventListener('click', () => {
      this.viewMode = 'list';
      this.settings.saveViewMode();
      this.updateViewToggle();
      this.ui.renderItems();
    });
    document.getElementById('view-grid').addEventListener('click', () => {
      this.viewMode = 'grid';
      this.settings.saveViewMode();
      this.updateViewToggle();
      this.ui.renderItems();
    });

    document.getElementById('view-modal-close').addEventListener('click', () => {
      this.editor.closeViewModal();
    });
    document.getElementById('close-view-modal-btn').addEventListener('click', () => {
      this.editor.closeViewModal();
    });

    document.querySelector('#note-modal .modal-close')?.addEventListener('click', () => {
      this.editor.closeEditModal();
    });
    document.getElementById('close-modal-btn')?.addEventListener('click', () => {
      this.editor.closeEditModal();
    });

    document.getElementById('save-note-btn').addEventListener('click', () => {
      this.editor.saveNote();
    });

    document.getElementById('delete-view-note-btn').addEventListener('click', () => {
      this.editor.deleteItemFromView();
    });

    document.getElementById('edit-note-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = this.viewingId;
      const note = dataManager.items.find(n => n.id === id);
      this.editor.closeViewModal();
      if (note && note.clipType === 'sticky') {
        this.editor.openEditModal(id);
      } else {
        this.editor.openNoteEditInTab(id);
      }
    });

    document.getElementById('edit-note-in-tab-btn')?.addEventListener('click', () => {
      this.editor.openNoteEditInTab(this.viewingId);
    });

    document.getElementById('prompt-view-modal-close').addEventListener('click', () => {
      this.promptEditor_module.closePromptViewModal();
    });
    document.getElementById('close-prompt-view-btn').addEventListener('click', () => {
      this.promptEditor_module.closePromptViewModal();
    });

    document.querySelector('#prompt-modal .modal-close')?.addEventListener('click', () => {
      this.promptEditor_module.closePromptModal();
    });
    document.getElementById('close-prompt-modal-btn').addEventListener('click', () => {
      this.promptEditor_module.closePromptModal();
    });

    document.getElementById('save-prompt-btn').addEventListener('click', () => {
      this.promptEditor_module.savePrompt();
    });

    document.getElementById('delete-prompt-btn').addEventListener('click', () => {
      this.promptEditor_module.deletePrompt();
    });

    document.getElementById('edit-prompt-btn').addEventListener('click', () => {
      const id = this.viewingId;
      this.promptEditor_module.closePromptViewModal();
      this.promptEditor_module.openPromptEditInTab(id);
    });

    document.getElementById('edit-prompt-in-tab-btn')?.addEventListener('click', () => {
      this.promptEditor_module.openPromptEditInTab(this.viewingId);
    });

    document.getElementById('copy-prompt-btn').addEventListener('click', () => {
      this.promptEditor_module.copyPromptContent();
    });

    document.getElementById('settings-modal-close').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('active');
    });

    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('settings-modal')) {
        document.getElementById('settings-modal').classList.remove('active');
      }
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      this.settings.exportData();
    });

    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.settings.importData(file);
        e.target.value = '';
      }
    });

    document.querySelectorAll('input[name="inject-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        dataManager.settings.injectMode = e.target.value;
        this.settings.saveSettings();
        this.settings.updateInjectModeUI(e.target.value);
      });
    });

    document.getElementById('whitelist').addEventListener('change', (e) => {
      dataManager.settings.whitelist = e.target.value.split('\n').map(u => this.settings.cleanUrl(u)).filter(u => u);
      this.settings.saveSettings();
    });

    document.getElementById('blacklist').addEventListener('change', (e) => {
      dataManager.settings.blacklist = e.target.value.split('\n').map(u => this.settings.cleanUrl(u)).filter(u => u);
      this.settings.saveSettings();
    });

    document.getElementById('blocked-host-select').addEventListener('change', () => {
      this.settings.renderBlockedInputsList();
    });

    document.getElementById('refresh-blocked-btn')?.addEventListener('click', () => {
      this.settings.renderBlockedInputsManager();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('view-modal').classList.contains('active')) {
          this.editor.closeViewModal();
        }
        if (document.getElementById('note-modal').classList.contains('active')) {
          this.editor.closeEditModal();
        }
        if (document.getElementById('prompt-view-modal').classList.contains('active')) {
          this.promptEditor_module.closePromptViewModal();
        }
        if (document.getElementById('prompt-modal').classList.contains('active')) {
          this.promptEditor_module.closePromptModal();
        }
        if (document.getElementById('settings-modal').classList.contains('active')) {
          document.getElementById('settings-modal').classList.remove('active');
        }
      }
    });

    this.webdav.init();

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return;
      if (changes.items || changes.tags || changes.categories) {
        await dataManager.loadData();
        this.loadItems();
        this.render();
      }
    });
  }

  switchType(type) {
    this.currentType = type;
    this.currentTag = null;
    this.searchQuery = '';
    document.getElementById('search-input').value = '';

    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    const newItemBtn = document.getElementById('new-item-btn');
    if (type === 'notes') {
      newItemBtn.querySelector('span').textContent = '新建笔记';
      newItemBtn.style.display = 'flex';
    } else if (type === 'sticky') {
      newItemBtn.querySelector('span').textContent = '新建便签';
      newItemBtn.style.display = 'flex';
    } else if (type === 'prompts') {
      newItemBtn.querySelector('span').textContent = '新建提示词';
      newItemBtn.style.display = 'flex';
    } else if (type === 'gallery') {
      newItemBtn.style.display = 'none';
    }

    this.loadItems();
    this.render();
  }

  render() {
    this.ui.render();
  }

  selectTag(tag) {
    this.currentTag = this.currentTag === tag ? null : tag;
    this.applyFilters();
    this.ui.renderTagCloud();
    this.ui.renderItems();
  }

  updateViewToggle() {
    const viewListEl = document.getElementById('view-list');
    const viewGridEl = document.getElementById('view-grid');

    if (viewListEl) viewListEl.classList.toggle('active', this.viewMode === 'list');
    if (viewGridEl) viewGridEl.classList.toggle('active', this.viewMode === 'grid');
  }

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

  openQuickNotePage(clipType = 'normal') {
    const quickNoteUrl = chrome.runtime.getURL(`quick-note.html?clipType=${clipType}`);
    window.open(quickNoteUrl, '_blank');
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  openNote(id) {
    this.editor.openNote(id);
  }

  openPrompt(id) {
    this.promptEditor_module.openPrompt(id);
  }

  openImageViewer(imageSrc, noteId) {
    this.ui.openImageViewer(imageSrc, noteId);
  }
}

const notesManager = new NotesManager();
