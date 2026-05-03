class CategorySelector {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      categories: options.categories || [],
      selectedCategory: options.selectedCategory || '',
      icons: options.icons || {},
      defaultIcon: options.defaultIcon || '📁',
      onChange: options.onChange || null,
      allowAdd: options.allowAdd || false,
      onAdd: options.onAdd || null,
      ...options
    };
    this.selectedCategory = this.options.selectedCategory;
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
  }

  setCategories(categories) {
    this.options.categories = categories;
    this.render();
    this.bindEvents();
  }

  setSelected(category) {
    this.selectedCategory = category;
    this.updateSelection();
    if (this.options.onChange) {
      this.options.onChange(category);
    }
  }

  getIcon(category) {
    return this.options.icons[category] || this.options.defaultIcon;
  }

  render() {
    const categories = this.options.categories;

    this.container.innerHTML = `
      <div class="category-selector">
        <div class="category-grid">
          ${categories.map(cat => `
            <div class="category-item ${cat === this.selectedCategory ? 'active' : ''}" 
                 data-category="${this.escapeHtml(cat)}">
              <span class="category-icon">${this.getIcon(cat)}</span>
              <span class="category-name">${this.escapeHtml(cat)}</span>
            </div>
          `).join('')}
        </div>
        ${this.options.allowAdd ? `
          <div class="category-add">
            <input type="text" class="category-add-input" placeholder="添加新分类...">
            <button type="button" class="category-add-btn">+</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderDropdown() {
    const categories = this.options.categories;

    this.container.innerHTML = `
      <div class="category-dropdown-wrapper">
        <div class="category-dropdown-trigger">
          <span class="category-dropdown-icon">${this.getIcon(this.selectedCategory)}</span>
          <span class="category-dropdown-text">${this.escapeHtml(this.selectedCategory) || '选择分类'}</span>
          <span class="category-dropdown-arrow">▼</span>
        </div>
        <div class="category-dropdown-menu">
          ${categories.map(cat => `
            <div class="category-dropdown-item ${cat === this.selectedCategory ? 'active' : ''}" 
                 data-category="${this.escapeHtml(cat)}">
              <span class="category-icon">${this.getIcon(cat)}</span>
              <span class="category-name">${this.escapeHtml(cat)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindEvents() {
    const categoryItems = this.container.querySelectorAll('.category-item, .category-dropdown-item');
    categoryItems.forEach(item => {
      item.addEventListener('click', () => {
        const category = item.dataset.category;
        this.setSelected(category);
      });
    });

    const dropdownTrigger = this.container.querySelector('.category-dropdown-trigger');
    const dropdownMenu = this.container.querySelector('.category-dropdown-menu');

    if (dropdownTrigger && dropdownMenu) {
      dropdownTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
      });

      document.addEventListener('click', () => {
        dropdownMenu.classList.remove('show');
      });
    }

    const addInput = this.container.querySelector('.category-add-input');
    const addBtn = this.container.querySelector('.category-add-btn');

    if (addInput && addBtn) {
      const handleAdd = () => {
        const value = addInput.value.trim();
        if (value && this.options.onAdd) {
          this.options.onAdd(value);
          addInput.value = '';
        }
      };

      addBtn.addEventListener('click', handleAdd);
      addInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      });
    }
  }

  updateSelection() {
    const items = this.container.querySelectorAll('.category-item, .category-dropdown-item');
    items.forEach(item => {
      item.classList.toggle('active', item.dataset.category === this.selectedCategory);
    });

    const triggerText = this.container.querySelector('.category-dropdown-text');
    const triggerIcon = this.container.querySelector('.category-dropdown-icon');
    if (triggerText) {
      triggerText.textContent = this.selectedCategory || '选择分类';
    }
    if (triggerIcon) {
      triggerIcon.textContent = this.getIcon(this.selectedCategory);
    }
  }

  getValue() {
    return this.selectedCategory;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

window.CategorySelector = CategorySelector;
