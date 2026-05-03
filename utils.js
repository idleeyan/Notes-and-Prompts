const Utils = {
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  },

  showToast(message, type = 'success', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  formatDate(date, format = 'full') {
    const d = new Date(date);
    if (format === 'full') {
      return d.toLocaleString('zh-CN');
    } else if (format === 'date') {
      return d.toLocaleDateString('zh-CN');
    } else if (format === 'time') {
      return d.toLocaleTimeString('zh-CN');
    } else if (format === 'relative') {
      const now = new Date();
      const diff = now - d;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return d.toLocaleDateString('zh-CN');
    }
    return d.toLocaleString('zh-CN');
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  copyToClipboard(text) {
    return new Promise((resolve, reject) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(resolve)
          .catch(reject);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          textarea.remove();
        }
      }
    });
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  truncate(text, maxLength, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  },

  highlightKeywords(text, keywords) {
    if (!keywords || !keywords.length) return text;
    let result = text;
    keywords.forEach(keyword => {
      const regex = new RegExp(`(${keyword})`, 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    });
    return result;
  },

  deepMerge(target, source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return source;
    }

    const output = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (target[key] && typeof target[key] === 'object') {
            output[key] = Utils.deepMerge(target[key], source[key]);
          } else {
            output[key] = source[key];
          }
        } else {
          output[key] = source[key];
        }
      }
    }

    return output;
  },

  calculateItemChecksum(item) {
    const relevantData = {
      title: item.title || '',
      content: item.content || '',
      tags: (item.tags || []).sort()
    };
    const str = JSON.stringify(relevantData);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  },

  cleanUrl(url) {
    if (!url) return url;
    return url
      .toLowerCase()
      .replace(/^(https?:\/\/)?/, '')
      .replace(/\/.*$/, '');
  },

  normalizeWebDAVUrl(baseUrl) {
    if (!baseUrl) return baseUrl;

    let url = baseUrl.trim();

    if (!/^https?:\/\//i.test(url)) {
      if (url.startsWith('htt://')) {
        url = 'http' + url;
      } else if (url.startsWith('http:')) {
        url = 'http://' + url.substring(5);
      } else {
        url = 'http://' + url;
      }
    }

    return url.replace(/\/$/, '');
  }
};

window.Utils = Utils;
