// 提示词编辑页面逻辑
class PromptEditPage {
  constructor() {
    this.promptId = null;
    this.promptData = null;
    this.currentTags = [];
    this.previewImage = '';
    this.init();
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    this.promptId = urlParams.get('id');

    await dataManager.init();

    if (this.promptId) {
      const prompt = dataManager.items.find(p => p.id === this.promptId && p.type === 'prompt');
      if (prompt) {
        this.promptData = prompt;
        this.currentTags = prompt.tags ? [...prompt.tags] : [];
        this.previewImage = prompt.previewImage || '';

        document.getElementById('edit-title').value = prompt.title;
        document.getElementById('edit-preview-image').value = prompt.previewImage || '';
        this.updatePreviewImageDisplay(prompt.previewImage);

        if (prompt.generationInfo) {
          document.getElementById('edit-gen-model').value = prompt.generationInfo.model || '';
          document.getElementById('edit-gen-steps').value = prompt.generationInfo.steps || '';
          document.getElementById('edit-gen-cfg').value = prompt.generationInfo.cfgScale || '';
          document.getElementById('edit-gen-sampler').value = prompt.generationInfo.sampler || '';
          document.getElementById('edit-gen-seed').value = prompt.generationInfo.seed || '';
          document.getElementById('edit-gen-size').value = prompt.generationInfo.size || '';
          document.getElementById('edit-gen-negative').value = prompt.generationInfo.negativePrompt || '';
        }

        document.getElementById('meta-info').innerHTML = `
          <p>创建时间：${new Date(prompt.createdAt).toLocaleString('zh-CN')}</p>
          ${prompt.updatedAt ? `<p>更新时间：${new Date(prompt.updatedAt).toLocaleString('zh-CN')}</p>` : ''}
        `;

        document.title = `编辑提示词 - ${prompt.title}`;
      }
    }

    this.initEditor();
    this.bindEvents();
    this.loadSuggestedTags();
  }

  initEditor() {
    const textarea = document.getElementById('edit-content');

    if (this.promptData && this.promptData.content) {
      textarea.value = this.promptData.content;
    }

    textarea.style.height = '300px';
    textarea.style.resize = 'vertical';
    textarea.style.width = '100%';
    textarea.style.padding = '12px';
    textarea.style.border = '1px solid #ddd';
    textarea.style.borderRadius = '6px';
    textarea.style.fontFamily = 'inherit';
    textarea.style.fontSize = '14px';
    textarea.style.lineHeight = '1.6';

    this.initTagEditor();
  }

  initTagEditor() {
    const container = document.getElementById('tags-container');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'tag-input';
    input.placeholder = '输入标签，按回车添加';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.flex = '1';
    input.style.minWidth = '100px';
    input.style.background = 'transparent';

    container.insertBefore(input, document.getElementById('tags-list'));

    this.renderTags();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = input.value.trim();
        if (tag && !this.currentTags.includes(tag)) {
          this.currentTags.push(tag);
          this.renderTags();
          input.value = '';
        }
      }
    });
  }

  renderTags() {
    const tagsList = document.getElementById('tags-list');
    tagsList.innerHTML = this.currentTags.map(tag => `
      <span class="tag-item">
        ${this.escapeHtml(tag)}
        <span class="remove-tag" data-tag="${this.escapeHtml(tag)}">×</span>
      </span>
    `).join('');

    tagsList.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        this.currentTags = this.currentTags.filter(t => t !== tag);
        this.renderTags();
      });
    });
  }

  loadSuggestedTags() {
    const suggestedTags = dataManager.getAllTags().slice(0, 10);
    const container = document.getElementById('suggested-tags');
    if (!suggestedTags.length) {
      container.style.display = 'none';
      return;
    }

    const existingTags = new Set(this.currentTags);
    const availableTags = suggestedTags.filter(t => !existingTags.has(t));

    if (!availableTags.length) {
      container.style.display = 'none';
      return;
    }

    container.innerHTML = `
      <span class="suggested-label">推荐标签：</span>
      ${availableTags.slice(0, 5).map(tag => `<span class="suggested-tag" data-tag="${this.escapeHtml(tag)}">${this.escapeHtml(tag)}</span>`).join('')}
    `;

    container.querySelectorAll('.suggested-tag').forEach(tagEl => {
      tagEl.addEventListener('click', () => {
        const tag = tagEl.dataset.tag;
        if (!this.currentTags.includes(tag)) {
          this.currentTags.push(tag);
          this.renderTags();
          this.loadSuggestedTags();
        }
      });
    });
  }

  updatePreviewImageDisplay(url) {
    const previewImg = document.getElementById('preview-image-preview');
    const placeholder = document.getElementById('preview-image-placeholder');

    if (url) {
      previewImg.src = url;
      previewImg.style.display = 'block';
      placeholder.style.display = 'none';
      previewImg.onerror = () => {
        previewImg.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.querySelector('span').textContent = '图片加载失败';
      };
    } else {
      previewImg.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.querySelector('span').textContent = '点击下方按钮添加预览图';
    }
  }

  handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      this.showToast('请选择图片文件', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      document.getElementById('edit-preview-image').value = dataUrl;
      this.updatePreviewImageDisplay(dataUrl);
      this.previewImage = dataUrl;
    };
    reader.onerror = () => {
      this.showToast('图片读取失败', 'error');
    };
    reader.readAsDataURL(file);
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
      await this.savePrompt();
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.close();
      });
    }

    document.getElementById('edit-preview-image').addEventListener('input', (e) => {
      const url = e.target.value.trim();
      this.updatePreviewImageDisplay(url);
      this.previewImage = url;
    });

    document.getElementById('preview-image-wrapper').addEventListener('click', () => {
      document.getElementById('preview-image-upload').click();
    });

    document.getElementById('preview-image-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleImageUpload(file);
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        console.log('Ctrl+S 快捷键触发保存');
        this.savePrompt();
      }
    });
  }

  async savePrompt() {
    console.log('开始执行保存操作...');

    try {
      const titleInput = document.getElementById('edit-title');
      const contentTextarea = document.getElementById('edit-content');
      const saveBtn = document.getElementById('save-btn');

      if (!titleInput || !contentTextarea) {
        console.error('必要的表单元素未找到');
        this.showToast('页面加载错误：表单元素未找到', 'error');
        return;
      }

      const title = titleInput.value.trim();
      const content = contentTextarea.value.trim();
      const tags = this.currentTags;

      console.log('标题:', title);
      console.log('内容长度:', content.length);

      if (!title || !content) {
        this.showToast('标题和内容不能为空', 'error');
        return;
      }

      if (saveBtn) {
        saveBtn.textContent = '保存中...';
        saveBtn.disabled = true;
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

      const genModel = document.getElementById('edit-gen-model');
      const genSteps = document.getElementById('edit-gen-steps');
      const genCfg = document.getElementById('edit-gen-cfg');
      const genSampler = document.getElementById('edit-gen-sampler');
      const genSeed = document.getElementById('edit-gen-seed');
      const genSize = document.getElementById('edit-gen-size');
      const genNegative = document.getElementById('edit-gen-negative');

      const genInfo = {
        model: genModel ? genModel.value.trim() : '',
        steps: genSteps ? genSteps.value.trim() : '',
        cfgScale: genCfg ? genCfg.value.trim() : '',
        sampler: genSampler ? genSampler.value.trim() : '',
        seed: genSeed ? genSeed.value.trim() : '',
        size: genSize ? genSize.value.trim() : '',
        negativePrompt: genNegative ? genNegative.value.trim() : ''
      };

      const hasGenInfo = genInfo.model || genInfo.steps || genInfo.cfgScale ||
                         genInfo.sampler || genInfo.seed || genInfo.negativePrompt;
      const generationInfo = hasGenInfo ? genInfo : null;

      const previewImage = document.getElementById('edit-preview-image').value.trim();

      const keywords = dataManager.extractKeywords(title + ' ' + content, 5);
      const autoTags = keywords.filter(k => !tags.includes(k));
      const finalTags = [...tags, ...autoTags];

      console.log('调用 dataManager 保存方法, promptId:', this.promptId);

      let result;
      if (this.promptId) {
        result = await dataManager.updatePrompt(this.promptId, {
          title: title,
          content: content,
          tags: finalTags,
          previewImage: previewImage,
          generationInfo: generationInfo
        });
      } else {
        result = await dataManager.addPrompt({
          title,
          content,
          tags: finalTags,
          previewImage: previewImage,
          generationInfo: generationInfo
        });
      }

      console.log('保存结果:', result);

      if (!result) {
        throw new Error('保存返回空结果');
      }

      this.isSaved = true;

      try {
        chrome.runtime.sendMessage({ action: 'settingsChanged' });
      } catch (e) {
        console.warn('发送消息失败:', e);
      }

      this.showToast((autoTags.length > 0 ? `✅ 提示词已保存！自动添加标签：${autoTags.join(', ')}` : '✅ 提示词已保存！'), 'success');

      setTimeout(() => {
        window.close();
      }, 1000);

    } catch (error) {
      console.error('保存提示词失败:', error);
      console.error('错误堆栈:', error.stack);
      this.showToast('❌ 保存失败: ' + (error.message || '未知错误'), 'error');
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) {
        saveBtn.textContent = '保存';
        saveBtn.disabled = false;
      }
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PromptEditPage();
});