// 提示词编辑模块
class NotesPromptEditor {
  constructor(manager) {
    this.manager = manager;
  }

  openPrompt(id) {
    const prompt = dataManager.items.find(p => p.id === id);
    if (!prompt) return;

    this.manager.viewingId = id;

    document.getElementById('view-prompt-title').textContent = prompt.title;

    const contentEl = document.getElementById('view-prompt-content');
    contentEl.textContent = prompt.content || '';

    const tagsEl = document.getElementById('view-prompt-tags');
    if (prompt.tags && prompt.tags.length > 0) {
      tagsEl.innerHTML = prompt.tags.map(tag => `<span class="view-tag">${this.manager.escapeHtml(tag)}</span>`).join('');
    } else {
      tagsEl.innerHTML = '';
    }

    document.getElementById('view-prompt-meta').innerHTML = `
      <p>创建时间：${new Date(prompt.createdAt).toLocaleString('zh-CN')}</p>
      ${prompt.updatedAt ? `<p>更新时间：${new Date(prompt.updatedAt).toLocaleString('zh-CN')}</p>` : ''}
    `;

    document.getElementById('prompt-view-modal').classList.add('active');
  }

  closePromptViewModal() {
    document.getElementById('prompt-view-modal').classList.remove('active');
    this.manager.viewingId = null;
  }

  copyPromptContent() {
    const prompt = dataManager.items.find(p => p.id === this.manager.viewingId);
    if (prompt && prompt.content) {
      navigator.clipboard.writeText(prompt.content).then(() => {
        this.manager.showToast('已复制到剪贴板');
      });
    }
  }

  openPromptEditModal(id) {
    const prompt = dataManager.items.find(p => p.id === id);
    if (!prompt) return;

    this.manager.editingId = id;
    this.manager.promptCurrentTags = prompt.tags ? [...prompt.tags] : [];

    document.getElementById('prompt-modal-title').textContent = '编辑提示词';
    document.getElementById('edit-prompt-title').value = prompt.title;

    this.renderPromptEditTags();
    document.getElementById('prompt-modal').classList.add('active');

    this.initPromptEditor(prompt.content || '');
  }

  openPromptModal() {
    this.manager.editingId = null;
    this.manager.promptCurrentTags = [];

    document.getElementById('prompt-modal-title').textContent = '新建提示词';
    document.getElementById('edit-prompt-title').value = '';

    this.renderPromptEditTags();
    document.getElementById('prompt-modal').classList.add('active');

    this.initPromptEditor('');
  }

  openPromptEditInTab(id) {
    const url = chrome.runtime.getURL(`prompt-edit.html?id=${id}`);
    window.open(url, '_blank');
  }

  closePromptModal() {
    document.getElementById('prompt-modal').classList.remove('active');
    this.manager.editingId = null;
    this.manager.promptCurrentTags = [];
  }

  initPromptEditor(content) {
    const textarea = document.getElementById('edit-prompt-content');
    if (!textarea) return;

    textarea.value = content || '';
    textarea.style.height = '200px';
    textarea.style.resize = 'vertical';
    textarea.style.width = '100%';
    textarea.style.padding = '12px';
    textarea.style.border = '1px solid #ddd';
    textarea.style.borderRadius = '6px';
    textarea.style.fontFamily = 'inherit';
    textarea.style.fontSize = '14px';
    textarea.style.lineHeight = '1.6';

    textarea.oninput = () => {
      this.autoResizeTextarea(textarea);
    };

    setTimeout(() => {
      this.autoResizeTextarea(textarea);
    }, 0);
  }

  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(200, textarea.scrollHeight) + 'px';
  }

  getEditorContent() {
    const textarea = document.getElementById('edit-prompt-content');
    return textarea ? textarea.value : '';
  }

  renderPromptEditTags() {
    const container = document.getElementById('prompt-tags-container') || document.getElementById('edit-prompt-tags-list');
    if (!container) return;

    const inputContainer = container.querySelector('.tags-input-wrapper') || container;
    inputContainer.innerHTML = this.manager.promptCurrentTags.map(tag => `
      <span class="tag-item">
        ${tag}
        <span class="remove-tag" data-tag="${tag}">×</span>
      </span>
    `).join('');

    container.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removePromptTag(btn.dataset.tag);
      });
    });
  }

  addPromptTag(tag) {
    if (!this.manager.promptCurrentTags.includes(tag)) {
      this.manager.promptCurrentTags.push(tag);
      this.renderPromptEditTags();
    }
  }

  removePromptTag(tag) {
    this.manager.promptCurrentTags = this.manager.promptCurrentTags.filter(t => t !== tag);
    this.renderPromptEditTags();
  }

  async savePrompt() {
    const title = document.getElementById('edit-prompt-title').value.trim();
    const content = this.getEditorContent();

    if (!title) {
      alert('请输入标题');
      return;
    }

    if (!content) {
      alert('请输入内容');
      return;
    }

    const saveBtn = document.getElementById('save-prompt-btn');
    if (saveBtn) {
      saveBtn.textContent = '保存中...';
      saveBtn.disabled = true;
    }

    try {
      const keywords = dataManager.extractKeywords(title + ' ' + content, 5);
      const autoTags = keywords.filter(k => !this.manager.promptCurrentTags.includes(k));
      const finalTags = [...this.manager.promptCurrentTags, ...autoTags];

      if (this.manager.editingId) {
        await dataManager.updatePrompt(this.manager.editingId, {
          title: title,
          content: content,
          tags: finalTags
        });
      } else {
        await dataManager.addPrompt({
          title,
          content,
          tags: finalTags
        });
      }

      this.manager.loadItems();
      this.manager.render();
      this.closePromptModal();
      this.manager.showToast(autoTags.length > 0 ? `✅ 提示词已保存，自动添加标签：${autoTags.join(', ')}` : '✅ 提示词已保存');

    } catch (error) {
      console.error('保存提示词失败:', error);
      this.manager.showToast('❌ 保存失败');
      if (saveBtn) {
        saveBtn.textContent = '保存';
        saveBtn.disabled = false;
      }
    }
  }

  async deletePrompt() {
    if (!confirm('确定要删除这个提示词吗？')) return;

    const viewingId = this.manager.viewingId;
    await dataManager.deleteItem(viewingId);
    await dataManager.loadData();
    this.manager.loadItems();
    this.manager.render();
    this.closePromptViewModal();
    this.manager.showToast('提示词已删除');
  }
}

if (typeof window !== 'undefined') {
  window.NotesPromptEditor = NotesPromptEditor;
}
