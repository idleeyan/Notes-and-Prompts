// 内容脚本 - 检测输入框并处理提示词填充、页面内容提取
class ContentScript {
  constructor() {
    this.promptSelector = null;
    this.settings = {
      injectMode: 'all',
      whitelist: [],
      blacklist: []
    };
    this.isInjectEnabled = false;
    this.isSelectionMode = false;
    this.init();
  }

  async init() {
    console.log('提示词管理器：内容脚本初始化开始');
    await this.loadSettings();
    console.log('提示词管理器：设置加载完成', JSON.stringify(this.settings, null, 2));
    
    // 直接检查存储中的 blockedInputs
    const checkResult = await chrome.storage.local.get(['settings']);
    console.log('提示词管理器：存储中的 blockedInputs:', checkResult.settings?.blockedInputs);

    // 始终设置消息监听
    this.setupMessageListener();

    // 检查当前网站是否在允许列表中
    const isAllowed = this.isCurrentSiteAllowed();
    console.log('提示词管理器：当前网站是否允许', isAllowed, window.location.hostname);

    if (!isAllowed) {
      console.log('提示词管理器：当前网站被排除在输入框检测之外');
      this.isInjectEnabled = false;
      return;
    }

    this.isInjectEnabled = true;
    this.detectInputFields();
    this.observeDOMChanges();
    console.log('提示词管理器：内容脚本初始化完成');
  }

  // 加载设置
  async loadSettings() {
    const result = await chrome.storage.local.get(['settings']);
    if (result.settings) {
      this.settings = {
        injectMode: result.settings.injectMode || 'all',
        whitelist: result.settings.whitelist || [],
        blacklist: result.settings.blacklist || [],
        blockedInputs: result.settings.blockedInputs || {}
      };
    }
  }

  // 检查当前网站是否允许注入
  isCurrentSiteAllowed() {
    const currentHost = window.location.hostname.toLowerCase();
    const { injectMode, whitelist, blacklist } = this.settings;

    switch (injectMode) {
      case 'whitelist':
        return whitelist.some(domain => 
          currentHost === domain.toLowerCase() || 
          currentHost.endsWith('.' + domain.toLowerCase())
        );
      
      case 'blacklist':
        return !blacklist.some(domain => 
          currentHost === domain.toLowerCase() || 
          currentHost.endsWith('.' + domain.toLowerCase())
        );
      
      case 'all':
      default:
        return true;
    }
  }

  // 设置消息监听
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'fillInput') {
        this.fillInput(message.content);
        sendResponse({ success: true });
      }
      if (message.action === 'refreshSettings') {
        this.refreshSettings();
        sendResponse({ success: true });
      }
      if (message.action === 'getPageInfo') {
        const pageInfo = this.getPageInfo();
        sendResponse(pageInfo);
      }
      if (message.action === 'extractArticle') {
        const article = this.extractArticleHtml();
        const content = article?.html || this.extractArticleContent();
        sendResponse({ content, text: article?.text || '' });
      }
      if (message.action === 'startContentSelection') {
        this.startContentSelection();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  // 刷新设置
  async refreshSettings() {
    await this.loadSettings();
    
    if (!this.isCurrentSiteAllowed()) {
      this.removeAllInjectors();
      this.isInjectEnabled = false;
      console.log('提示词管理器：当前网站已被排除，移除所有按钮');
    } else {
      this.isInjectEnabled = true;
      this.detectInputFields();
    }
  }

  // 获取页面信息
  getPageInfo() {
    const favicon = document.querySelector('link[rel*="icon"]')?.href || '';
    const images = Array.from(document.querySelectorAll('img'))
      .filter(img => img.width > 100 && img.height > 100)
      .slice(0, 20)
      .map(img => ({
        src: img.src,
        width: img.width,
        height: img.height
      }));

    // 获取选中的文本和HTML
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    const selectedHtml = this.getSelectedHtml(selection);

    // 获取页面正文（纯文本，向后兼容）
    const content = this.extractArticleContent() || this.getPageText();
    
    // 获取页面正文 HTML（保留样式）
    const articleResult = this.extractArticleHtml();
    const contentHtml = articleResult ? articleResult.html : '';

    return {
      title: document.title,
      url: window.location.href,
      favicon: favicon,
      images: images,
      content: selectedText || content,
      contentHtml: selectedHtml || contentHtml, // 优先使用选中的HTML，否则使用文章HTML
      selectedText: selectedText,
      selectedHtml: selectedHtml
    };
  }

  // 获取选中的HTML内容（保留格式）
  getSelectedHtml(selection) {
    if (!selection || selection.rangeCount === 0) return '';

    const range = selection.getRangeAt(0);
    const clonedSelection = range.cloneContents();
    const div = document.createElement('div');
    div.appendChild(clonedSelection);

    // 清理HTML，保留基本格式
    return this.cleanHtml(div.innerHTML);
  }

  // 清理HTML，保留基本格式标签
  cleanHtml(html) {
    // 创建临时div
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 移除脚本和样式标签
    const scripts = temp.querySelectorAll('script, style, iframe, object, embed');
    scripts.forEach(el => el.remove());

    // 保留的标签：p, br, h1-h6, strong, b, em, i, u, s, strike, a, img, ul, ol, li, blockquote, pre, code, table, tr, td, th
    const allowedTags = ['P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'A', 'IMG', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'TR', 'TD', 'TH', 'THEAD', 'TBODY', 'DIV', 'SPAN'];

    // 递归清理节点
    const cleanNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toUpperCase();

        // 如果不允许，替换为span或移除
        if (!allowedTags.includes(tagName)) {
          // 将子节点移到父节点
          while (node.firstChild) {
            node.parentNode.insertBefore(node.firstChild, node);
          }
          node.parentNode.removeChild(node);
          return;
        }

    // 清理属性，只保留必要的
    const allowedAttrs = {
      '*': ['style'],
      'A': ['href', 'title', 'style'],
      'IMG': ['src', 'alt', 'title', 'style'],
      'BLOCKQUOTE': ['cite', 'style']
    };

        const attrs = Array.from(node.attributes);
        attrs.forEach(attr => {
          const allowed = allowedAttrs[tagName] || allowedAttrs['*'] || [];
          if (!allowed.includes(attr.name)) {
            node.removeAttribute(attr.name);
          }
        });

        // 递归处理子节点（从后向前，避免索引问题）
        Array.from(node.childNodes).reverse().forEach(child => cleanNode(child));
      }
    };

    Array.from(temp.childNodes).reverse().forEach(node => cleanNode(node));

    return temp.innerHTML;
  }

  // 提取文章正文（返回纯文本，用于向后兼容）
  extractArticleContent() {
    const result = this.extractArticleHtml();
    return result ? this.cleanText(result.text) : null;
  }

  // 提取文章正文 HTML（保留样式）
  extractArticleHtml() {
    const best = this.getPreferredArticleElement();
    if (best) {
      return best;
    }

    return this.getPageHtml();
  }

  // 获取页面 HTML（保留样式）
  getPageHtml() {
    // 克隆 body 并移除脚本和样式元素
    const bodyClone = document.body.cloneNode(true);
    const scripts = bodyClone.querySelectorAll('script, style, nav, header, footer, aside, iframe, object, embed');
    scripts.forEach(el => el.remove());
    
    return {
      html: this.cleanHtml(bodyClone.innerHTML),
      text: bodyClone.innerText,
      element: bodyClone
    };
  }

  // 获取页面文本
  getPageText() {
    // 移除脚本和样式元素
    const bodyClone = document.body.cloneNode(true);
    const scripts = bodyClone.querySelectorAll('script, style, nav, header, footer, aside');
    scripts.forEach(el => el.remove());
    
    return this.cleanText(bodyClone.innerText).substring(0, 5000);
  }

  // 清理文本
  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  getPreferredArticleElement() {
    const candidates = this.getCandidateElements();
    let bestElement = null;
    let bestScore = 0;
    let bestText = '';

    for (const element of candidates) {
      if (!this.isElementVisible(element)) continue;
      if (element.closest('nav, header, footer, aside')) continue;

      const text = (element.innerText || '').replace(/\s+/g, ' ').trim();
      const textLen = text.length;
      if (textLen < 200) continue;

      const score = this.scoreArticleElement(element, textLen);
      if (score > bestScore) {
        bestScore = score;
        bestElement = element;
        bestText = text;
      }
    }

    if (!bestElement) return null;

    return {
      html: this.cleanHtml(bestElement.innerHTML),
      text: bestText,
      element: bestElement
    };
  }

  getCandidateElements() {
    const candidates = new Set();
    const selector = [
      'article',
      '[role="main"]',
      '[role="article"]',
      '[itemprop="articleBody"]',
      'main',
      'section',
      'div'
    ].join(',');

    document.querySelectorAll(selector).forEach(el => {
      if (el !== document.body) candidates.add(el);
    });

    return Array.from(candidates);
  }

  isElementVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  scoreArticleElement(element, textLen) {
    const linkTextLen = Array.from(element.querySelectorAll('a')).reduce((sum, link) => {
      const linkText = (link.innerText || '').replace(/\s+/g, ' ').trim();
      return sum + linkText.length;
    }, 0);

    const paragraphCount = element.querySelectorAll('p').length;
    const headingCount = element.querySelectorAll('h1,h2,h3').length;
    const imageCount = element.querySelectorAll('img').length;
    const nodeCount = element.querySelectorAll('*').length + 1;
    const density = textLen / nodeCount;

    const classId = `${element.id || ''} ${element.className || ''}`.toLowerCase();
    const positiveKeywords = ['content', 'article', 'post', 'entry', 'main', 'body', 'text', 'detail', 'read', 'story'];
    const negativeKeywords = ['comment', 'nav', 'footer', 'header', 'aside', 'sidebar', 'menu', 'widget', 'recommend', 'related', 'share', 'advert', 'ads', 'breadcrumb', 'toolbar', 'subscription', 'paywall', 'modal', 'popup'];

    let score = textLen;
    score += paragraphCount * 80;
    score += headingCount * 60;
    score += Math.min(imageCount, 5) * 20;
    score += density * 20;
    score -= linkTextLen * 0.8;

    if (element.tagName === 'ARTICLE') score += 500;
    if (element.getAttribute('role') === 'main') score += 300;
    if (element.getAttribute('role') === 'article') score += 300;
    if (element.getAttribute('itemprop') === 'articleBody') score += 300;

    positiveKeywords.forEach(keyword => {
      if (classId.includes(keyword)) score += 200;
    });
    negativeKeywords.forEach(keyword => {
      if (classId.includes(keyword)) score -= 200;
    });

    return score;
  }

  // 启动内容选择模式
  startContentSelection() {
    this.isSelectionMode = true;
    
    // 创建选择提示
    const hint = document.createElement('div');
    hint.id = 'selection-hint';
    hint.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #667eea;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      ">
        🖱️ 请选择要收藏的内容，然后按 Ctrl+C 复制
        <button id="cancel-selection" style="
          margin-left: 12px;
          padding: 4px 12px;
          background: white;
          color: #667eea;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">取消</button>
      </div>
    `;
    document.body.appendChild(hint);

    // 绑定取消按钮
    document.getElementById('cancel-selection').addEventListener('click', () => {
      this.stopContentSelection();
    });

    // 监听选择变化
    const selectionHandler = () => {
      const selection = window.getSelection();
      if (selection.toString().trim().length > 0) {
        // 发送选择的内容
        chrome.runtime.sendMessage({
          action: 'contentSelected',
          content: selection.toString()
        });
      }
    };

    document.addEventListener('selectionchange', selectionHandler);
    
    // 保存处理器以便后续移除
    this.selectionHandler = selectionHandler;
  }

  // 停止内容选择模式
  stopContentSelection() {
    this.isSelectionMode = false;
    const hint = document.getElementById('selection-hint');
    if (hint) hint.remove();
    
    if (this.selectionHandler) {
      document.removeEventListener('selectionchange', this.selectionHandler);
      this.selectionHandler = null;
    }
  }

  // 检测输入框
  detectInputFields() {
    if (!this.isInjectEnabled) {
      console.log('提示词管理器：输入框检测已禁用');
      return;
    }

    const inputs = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
    console.log('提示词管理器：检测到', inputs.length, '个输入框');

    let injectedCount = 0;
    inputs.forEach(input => {
      if (input.dataset.promptInjected) return;

      // 检查是否是聊天输入框
      const isChatInput = this.isChatInput(input);

      if (isChatInput) {
        this.injectPromptButton(input);
        injectedCount++;
      }
    });

    console.log('提示词管理器：已注入', injectedCount, '个按钮');
  }

  // 判断是否是聊天输入框
  isChatInput(input) {
    // 通过 placeholder、aria-label、name、id、class 等属性判断
    const placeholder = input.placeholder?.toLowerCase() || '';
    const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() || '';
    const name = input.name?.toLowerCase() || '';
    const id = input.id?.toLowerCase() || '';
    const className = input.className?.toLowerCase?.() || '';

    // 扩展关键词列表，包含更多 AI 平台的关键词
    const chatKeywords = [
      'message', 'prompt', 'send', 'chat', '输入', '发送', '消息',
      'ask', 'question', 'query', '搜索', 'search', '对话', 'talk',
      'claude', 'gpt', 'ai', 'assistant', 'bot', '模型',
      '回复', '回答', 'comment', '回复', '说点什么'
    ];

    // 检查各种属性
    const hasKeyword = chatKeywords.some(keyword =>
      placeholder.includes(keyword) ||
      ariaLabel.includes(keyword) ||
      name.includes(keyword) ||
      id.includes(keyword) ||
      className.includes(keyword)
    );

    if (hasKeyword) return true;

    // 检查是否在常见的聊天容器内
    const chatContainerSelectors = [
      '[data-testid="text-input"]',
      '[role="textbox"]',
      '[contenteditable="true"]',
      '.chat-input',
      '.message-input',
      '.prompt-input',
      '[class*="chat"]',
      '[class*="message"]',
      '[class*="prompt"]',
      '[class*="input"]'
    ];

    // 检查元素本身是否匹配选择器
    for (const selector of chatContainerSelectors) {
      try {
        if (input.matches(selector)) {
          return true;
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }

    // 检查父元素是否是聊天容器
    let parent = input.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const parentClass = parent.className?.toLowerCase?.() || '';
      const parentId = parent.id?.toLowerCase?.() || '';

      if (chatKeywords.some(keyword =>
        parentClass.includes(keyword) ||
        parentId.includes(keyword)
      )) {
        return true;
      }
      parent = parent.parentElement;
    }

    // 对于 textarea 和 contenteditable，如果尺寸足够大，可能是聊天输入框
    if (input.tagName === 'TEXTAREA' || input.contentEditable === 'true') {
      const rect = input.getBoundingClientRect();
      // 宽度大于 200px 且高度大于 50px
      if (rect.width > 200 && rect.height > 50) {
        return true;
      }
    }

    return false;
  }

  // 注入提示词按钮
  injectPromptButton(input) {
    // 检查是否已经注入过
    if (input.dataset.promptInjected) return;
    
    // 检查是否被屏蔽
    if (this.isInputBlocked(input)) {
      console.log('提示词管理器：输入框已被屏蔽，跳过注入', input);
      return;
    }

    const container = document.createElement('div');
    container.className = 'prompt-injector-container';
    container.innerHTML = `
      <button class="prompt-injector-btn" title="选择提示词 (右键点击可屏蔽此输入框)">
        💡
      </button>
    `;

    // 尝试找到合适的父元素来放置按钮
    let wrapper = input.parentElement;

    // 如果 input 没有父元素，或者父元素是 body/html，创建一个包装器
    if (!wrapper || wrapper === document.body || wrapper === document.documentElement) {
      wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }

    // 确保 wrapper 有相对定位
    const wrapperStyle = getComputedStyle(wrapper);
    if (wrapperStyle.position === 'static') {
      wrapper.style.position = 'relative';
    }

    // 设置容器样式
    container.style.cssText = `
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10000;
      pointer-events: auto;
    `;

    wrapper.appendChild(container);
    input.dataset.promptInjected = 'true';

    // 绑定点击事件
    const btn = container.querySelector('.prompt-injector-btn');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openPromptSelector(input);
    });
    
    // 绑定右键菜单事件
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showBlockInputMenu(e, input);
    });

    console.log('提示词管理器：已在输入框注入按钮', input);
  }
  
  // 检查输入框是否被屏蔽
  isInputBlocked(input) {
    const blockedInputs = this.getBlockedInputsForCurrentSite();
    const inputId = this.getInputIdentifier(input);
    const isBlocked = blockedInputs.includes(inputId);
    
    if (isBlocked) {
      console.log('提示词管理器：输入框已被屏蔽，跳过注入', inputId);
    }
    
    return isBlocked;
  }
  
  // 获取当前网站的屏蔽列表
  getBlockedInputsForCurrentSite() {
    const hostname = window.location.hostname;
    const blockedData = this.settings.blockedInputs || {};
    const blockedList = blockedData[hostname] || [];
    
    console.log('提示词管理器：当前网站屏蔽列表', { 
      hostname, 
      blockedCount: blockedList.length,
      blockedInputs: blockedList,
      allBlockedData: blockedData 
    });
    
    return blockedList;
  }
  
  // 获取输入框的唯一标识
  getInputIdentifier(input) {
    // 优先使用 id（最稳定）
    if (input.id) {
      return `id:${input.id}`;
    }
    
    // 其次使用 name
    if (input.name) {
      return `name:${input.name}`;
    }
    
    // 使用 placeholder（可能变化，但比路径稳定）
    if (input.placeholder) {
      return `placeholder:${input.placeholder}`;
    }
    
    // 使用 aria-label
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) {
      return `aria:${ariaLabel}`;
    }
    
    // 使用 className（如果有）
    if (input.className && typeof input.className === 'string' && input.className.trim()) {
      const classNames = input.className.trim().split(/\s+/).slice(0, 3).join('.');
      return `class:${classNames}`;
    }
    
    // 最后使用在页面中的路径（最不稳定）
    const path = this.getElementPath(input);
    return `path:${path}`;
  }
  
  // 获取元素在 DOM 中的路径
  getElementPath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
      } else if (current.className) {
        selector += `.${current.className.split(' ')[0]}`;
      }
      
      const siblings = Array.from(current.parentNode?.children || []);
      const index = siblings.filter(s => s.tagName === current.tagName).indexOf(current);
      if (index > 0) {
        selector += `:nth-of-type(${index + 1})`;
      }
      
      path.unshift(selector);
      current = current.parentNode;
    }
    
    return path.join(' > ');
  }
  
  // 显示屏蔽菜单
  showBlockInputMenu(event, input) {
    // 移除已有菜单
    const existingMenu = document.getElementById('prompt-block-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.id = 'prompt-block-menu';
    menu.innerHTML = `
      <div style="
        position: fixed;
        left: ${event.clientX}px;
        top: ${event.clientY}px;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 99999;
        padding: 8px 0;
        min-width: 180px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          padding: 8px 16px;
          font-size: 13px;
          color: #666;
          border-bottom: 1px solid #eee;
          margin-bottom: 4px;
        ">提示词管理器</div>
        <div id="block-input-item" style="
          padding: 10px 16px;
          cursor: pointer;
          font-size: 14px;
          color: #333;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
          border-radius: 0 0 8px 8px;
        " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
          <span>🚫</span>
          <span>屏蔽此输入框</span>
        </div>
      </div>
    `;
    
    document.body.appendChild(menu);
    
    // 点击屏蔽
    menu.querySelector('#block-input-item').addEventListener('click', () => {
      this.blockInput(input);
      menu.remove();
    });
    
    // 点击外部关闭
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }
  
  // 屏蔽输入框
  async blockInput(input) {
    const hostname = window.location.hostname;
    const inputId = this.getInputIdentifier(input);
    
    console.log('提示词管理器：准备屏蔽输入框', { hostname, inputId });
    
    // 获取现有屏蔽列表
    const blockedData = this.settings.blockedInputs || {};
    if (!blockedData[hostname]) {
      blockedData[hostname] = [];
    }
    
    // 添加到屏蔽列表
    if (!blockedData[hostname].includes(inputId)) {
      blockedData[hostname].push(inputId);
      
      // 保存设置
      this.settings.blockedInputs = blockedData;
      
      try {
        // 获取并保护aiConfig
        const result = await chrome.storage.local.get(['aiConfig']);
        const dataToSave = { settings: this.settings };
        if (result.aiConfig) {
          dataToSave.aiConfig = result.aiConfig;
        }
        await chrome.storage.local.set(dataToSave);
        console.log('提示词管理器：屏蔽设置已保存', this.settings);
        
        // 移除已注入的按钮
        this.removeInjectorFromInput(input);
        
        // 显示提示
        this.showToast('已屏蔽此输入框');
        console.log('提示词管理器：已屏蔽输入框', inputId);
      } catch (error) {
        console.error('提示词管理器：保存屏蔽设置失败', error);
        this.showToast('屏蔽失败，请重试');
      }
    } else {
      console.log('提示词管理器：输入框已在屏蔽列表中', inputId);
    }
  }
  
  // 从输入框移除注入器
  removeInjectorFromInput(input) {
    const container = input.parentElement?.querySelector('.prompt-injector-container');
    if (container) {
      container.remove();
    }
    delete input.dataset.promptInjected;
  }

  // 显示提示
  showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 99999;
      animation: fadeInUp 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // 打开提示词选择器
  async openPromptSelector(input) {
    console.log('提示词管理器：打开提示词选择器');

    // 创建选择器弹窗
    const selector = document.createElement('div');
    selector.className = 'prompt-selector-popup';

    // 获取提示词列表
    const result = await chrome.storage.local.get(['items']);
    const items = result.items || [];
    const prompts = items.filter(item => item.type === 'prompt');

    console.log('提示词管理器：找到', prompts.length, '个提示词');

    if (prompts.length === 0) {
      alert('暂无提示词，请在扩展中添加');
      return;
    }

    // 按分类分组
    const categories = {};
    prompts.forEach(prompt => {
      if (!categories[prompt.category]) {
        categories[prompt.category] = [];
      }
      categories[prompt.category].push(prompt);
    });

    selector.innerHTML = `
      <div class="prompt-selector-content">
        <div class="prompt-selector-header">
          <h3>选择提示词</h3>
          <button class="prompt-selector-close">&times;</button>
        </div>
        <div class="prompt-selector-body">
          ${Object.entries(categories).map(([category, categoryPrompts]) => `
            <div class="prompt-category-group">
              <div class="prompt-category-title">${category}</div>
              ${categoryPrompts.map(prompt => `
                <div class="prompt-item-select" data-content="${this.escapeHtml(prompt.content)}">
                  <div class="prompt-item-title">${this.escapeHtml(prompt.title)}</div>
                  <div class="prompt-item-preview">${this.escapeHtml(prompt.content.substring(0, 50))}...</div>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(selector);

    // 绑定关闭事件
    selector.querySelector('.prompt-selector-close').addEventListener('click', () => {
      selector.remove();
    });

    // 绑定选择事件
    selector.querySelectorAll('.prompt-item-select').forEach(item => {
      item.addEventListener('click', () => {
        const content = item.dataset.content;
        this.fillInputToElement(input, content);
        selector.remove();
      });
    });

    // 点击外部关闭
    selector.addEventListener('click', (e) => {
      if (e.target === selector) {
        selector.remove();
      }
    });
  }

  // 填充输入框
  fillInput(content) {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
      this.fillInputToElement(activeElement, content);
    } else {
      // 查找页面上的聊天输入框
      const chatInput = document.querySelector('textarea, [contenteditable="true"]');
      if (chatInput) {
        this.fillInputToElement(chatInput, content);
      }
    }
  }

  // 填充指定元素
  fillInputToElement(element, content) {
    if (element.contentEditable === 'true') {
      element.innerText = content;
    } else {
      element.value = content;
    }
    
    // 触发输入事件
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 聚焦
    element.focus();
  }

  // 移除所有注入器
  removeAllInjectors() {
    document.querySelectorAll('.prompt-injector-container').forEach(container => {
      container.remove();
    });
    document.querySelectorAll('[data-prompt-injected]').forEach(el => {
      delete el.dataset.promptInjected;
    });
  }

  // 观察DOM变化
  observeDOMChanges() {
    let debounceTimer = null;
    let lastInjectedCount = 0;
    
    const observer = new MutationObserver((mutations) => {
      if (!this.isInjectEnabled) return;
      
      if (!this.isCurrentSiteAllowed()) {
        this.isInjectEnabled = false;
        this.removeAllInjectors();
        return;
      }
      
      // 检查是否有新增的输入框相关节点
      let hasNewInputElements = false;
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查新增的节点是否是输入框或包含输入框
            if (node.matches && (node.matches('textarea, input[type="text"], [contenteditable="true"]') ||
                node.querySelector('textarea, input[type="text"], [contenteditable="true"]'))) {
              hasNewInputElements = true;
            }
          }
        });
      });

      if (hasNewInputElements) {
        // 防抖处理，避免频繁检测
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const inputs = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
          let injectedCount = 0;
          let newInjectedCount = 0;
          
          inputs.forEach(input => {
            if (input.dataset.promptInjected) {
              injectedCount++;
              return;
            }
            
            if (this.isChatInput(input)) {
              this.injectPromptButton(input);
              newInjectedCount++;
              injectedCount++;
            }
          });
          
          // 只在有新注入时输出日志
          if (newInjectedCount > 0) {
            console.log('提示词管理器：检测到', inputs.length, '个输入框，新注入', newInjectedCount, '个按钮');
          }
          lastInjectedCount = injectedCount;
        }, 300);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // HTML转义
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初始化
const contentScript = new ContentScript();
