class TagEditor {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      tags: options.tags || [],
      suggestions: options.suggestions || [],
      maxTags: options.maxTags || 20,
      placeholder: options.placeholder || '输入标签，按回车添加',
      onChange: options.onChange || null,
      ...options
    };
    this.tags = [...this.options.tags];
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="tag-editor">
        <div class="tag-list" id="tag-list">
          ${this.tags.map(tag => `
            <span class="tag-item" data-tag="${this.escapeHtml(tag)}">
              ${this.escapeHtml(tag)}
              <button type="button" class="tag-remove" data-tag="${this.escapeHtml(tag)}" title="移除">×</button>
            </span>
          `).join('')}
        </div>
        <div class="tag-input-wrapper">
          <input type="text" class="tag-input" placeholder="${this.options.placeholder}">
          <div class="tag-suggestions"></div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const input = this.container.querySelector('.tag-input');
    const suggestionsContainer = this.container.querySelector('.tag-suggestions');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = input.value.trim();
        if (tag) {
          this.addTag(tag);
          input.value = '';
          suggestionsContainer.innerHTML = '';
        }
      } else if (e.key === 'Backspace' && !input.value && this.tags.length > 0) {
        this.removeTag(this.tags[this.tags.length - 1]);
      }
    });

    input.addEventListener('input', () => {
      const value = input.value.trim().toLowerCase();
      if (value.length > 0) {
        this.showSuggestions(value, suggestionsContainer);
      } else {
        suggestionsContainer.innerHTML = '';
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        suggestionsContainer.innerHTML = '';
      }, 200);
    });

    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-remove')) {
        const tag = e.target.dataset.tag;
        this.removeTag(tag);
      }
    });

    suggestionsContainer.addEventListener('click', (e) => {
      const item = e.target.closest('.tag-suggestion-item');
      if (item) {
        const tag = item.dataset.tag;
        this.addTag(tag);
        input.value = '';
        suggestionsContainer.innerHTML = '';
        input.focus();
      }
    });
  }

  showSuggestions(value, container) {
    const suggestions = this.options.suggestions.filter(s => 
      s.toLowerCase().includes(value) && !this.tags.includes(s)
    ).slice(0, 5);

    if (suggestions.length > 0) {
      container.innerHTML = suggestions.map(s => `
        <div class="tag-suggestion-item" data-tag="${this.escapeHtml(s)}">${this.escapeHtml(s)}</div>
      `).join('');
    } else {
      container.innerHTML = '';
    }
  }

  addTag(tag) {
    tag = tag.trim();
    if (!tag) return;
    
    if (this.tags.includes(tag)) {
      this.highlightExistingTag(tag);
      return;
    }

    if (this.tags.length >= this.options.maxTags) {
      return;
    }

    this.tags.push(tag);
    this.updateTagList();
    this.triggerChange();
  }

  removeTag(tag) {
    const index = this.tags.indexOf(tag);
    if (index > -1) {
      this.tags.splice(index, 1);
      this.updateTagList();
      this.triggerChange();
    }
  }

  highlightExistingTag(tag) {
    const tagElement = this.container.querySelector(`[data-tag="${tag}"]`);
    if (tagElement) {
      tagElement.classList.add('highlight');
      setTimeout(() => {
        tagElement.classList.remove('highlight');
      }, 500);
    }
  }

  updateTagList() {
    const tagList = this.container.querySelector('#tag-list');
    if (tagList) {
      tagList.innerHTML = this.tags.map(tag => `
        <span class="tag-item" data-tag="${this.escapeHtml(tag)}">
          ${this.escapeHtml(tag)}
          <button type="button" class="tag-remove" data-tag="${this.escapeHtml(tag)}" title="移除">×</button>
        </span>
      `).join('');
    }
  }

  setTags(tags) {
    this.tags = [...tags];
    this.updateTagList();
  }

  setSuggestions(suggestions) {
    this.options.suggestions = suggestions;
  }

  getTags() {
    return [...this.tags];
  }

  clear() {
    this.tags = [];
    this.updateTagList();
    this.triggerChange();
  }

  triggerChange() {
    if (this.options.onChange) {
      this.options.onChange(this.tags);
    }
  }

  escapeHtml(text) {
    return Utils.escapeHtml(text);
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

window.TagEditor = TagEditor;
