// 快速添加笔记页面逻辑
class QuickNotePage {
  constructor() {
    this.currentTags = [];
    this.clipType = this.getClipTypeFromUrl();
    this.init();
  }

  getClipTypeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('clipType') || 'normal';
  }

  async init() {
    // 加载数据管理器
    await this.loadDataManager();

    // 更新页面标题
    const isSticky = this.clipType === 'sticky';
    const header = document.querySelector('.header h1');
    const subtitle = document.querySelector('.subtitle');
    if (isSticky) {
      header.textContent = '📝 快速添加便签';
      subtitle.textContent = '快速记录你的想法和灵感';
    } else {
      header.textContent = '📚 快速添加笔记';
      subtitle.textContent = '快速收藏网页内容和笔记';
    }

    // 绑定事件
    this.bindEvents();

    // 加载推荐标签
    this.loadSuggestedTags();

    // 聚焦标题输入框
    document.getElementById('note-title').focus();
  }

  // 加载数据管理器
  async loadDataManager() {
    await dataManager.init();
  }

  // 绑定事件
  bindEvents() {
    // 保存按钮
    document.getElementById('save-btn').addEventListener('click', () => {
      this.saveNote();
    });

    // 取消按钮
    document.getElementById('cancel-btn').addEventListener('click', () => {
      window.close();
    });

    // 标签输入
    const tagsInput = document.getElementById('note-tags');
    tagsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = tagsInput.value.trim();
        if (tag) {
          this.addTag(tag);
          tagsInput.value = '';
        }
      }
    });

    // 字符计数
    const contentTextarea = document.getElementById('note-content');
    contentTextarea.addEventListener('input', () => {
      document.getElementById('char-count').textContent = contentTextarea.value.length;
    });

    // 快捷键支持
    document.addEventListener('keydown', (e) => {
      // Ctrl+Enter 保存
      if (e.ctrlKey && e.key === 'Enter') {
        this.saveNote();
      }
      // Escape 取消
      if (e.key === 'Escape') {
        window.close();
      }
    });
  }

  // 加载推荐标签
  loadSuggestedTags() {
    const allTags = dataManager.getAllTags();
    const container = document.getElementById('suggested-tags');

    if (allTags.length === 0) {
      container.style.display = 'none';
      return;
    }

    const label = container.querySelector('.suggested-label');
    container.innerHTML = '';
    container.appendChild(label);

    allTags.slice(0, 10).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'suggested-tag';
      span.textContent = tag;
      span.addEventListener('click', () => this.addTag(tag));
      container.appendChild(span);
    });
  }

  // 添加标签
  addTag(tag) {
    if (!this.currentTags.includes(tag)) {
      this.currentTags.push(tag);
      this.renderTags();
    }
  }

  // 移除标签
  removeTag(tag) {
    this.currentTags = this.currentTags.filter(t => t !== tag);
    this.renderTags();
  }

  // 渲染标签
  renderTags() {
    const container = document.getElementById('tags-list');
    container.innerHTML = this.currentTags.map(tag => `
      <span class="tag-item">
        ${tag}
        <span class="remove-tag" data-tag="${tag}">×</span>
      </span>
    `).join('');

    // 绑定移除事件
    container.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeTag(btn.dataset.tag);
      });
    });
  }

  buildAutoTitle(content, tags) {
    const text = (content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) {
      return text.substring(0, 30) + (text.length > 30 ? '...' : '');
    }
    if (tags && tags.length > 0) {
      return tags[0];
    }
    return '未命名';
  }

  // 保存笔记
  async saveNote() {
    let title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const source = document.getElementById('note-source').value.trim();

    // 验证必填字段
    if (!content) {
      this.showToast('请输入内容', 'error');
      document.getElementById('note-content').focus();
      return;
    }
    if (!title) {
      title = this.buildAutoTitle(content, this.currentTags);
      document.getElementById('note-title').value = title;
    }

    // 构建便签数据
    const keywords = dataManager.extractKeywords(title + ' ' + content, 5);
    const autoTags = keywords.filter(k => !this.currentTags.includes(k));
    const finalTags = [...this.currentTags, ...autoTags];

    const noteData = {
      title,
      content,
      excerpt: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      url: '',
      favicon: '',
      images: [],
      tags: finalTags,
      clipType: this.clipType,
      remark: source
    };

    try {
      await dataManager.addNote(noteData);
      this.showToast(autoTags.length > 0 ? `便签保存成功！自动添加标签：${autoTags.join(', ')}` : '便签保存成功！', 'success');

      // 通知后台刷新
      chrome.runtime.sendMessage({ action: 'settingsChanged' });

      // 清空表单，方便继续添加
      this.resetForm();

      // 2秒后关闭窗口
      setTimeout(() => window.close(), 1500);
    } catch (error) {
      console.error('保存失败:', error);
      this.showToast('保存失败，请重试', 'error');
    }
  }

  // 重置表单
  resetForm() {
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    document.getElementById('note-source').value = '';
    document.getElementById('char-count').textContent = '0';
    this.currentTags = [];
    this.renderTags();
  }

  // 显示提示
  showToast(message, type = 'success') {
    // 移除已有的提示
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// 初始化
const quickNotePage = new QuickNotePage();
