// 设置管理模块
class NotesSettings {
  constructor(manager) {
    this.manager = manager;
  }

  loadSettingsToUI() {
    const settings = dataManager.settings;
    const injectMode = settings.injectMode || 'all';
    document.querySelector(`input[name="inject-mode"][value="${injectMode}"]`).checked = true;
    document.getElementById('whitelist').value = (settings.whitelist || []).join('\n');
    document.getElementById('blacklist').value = (settings.blacklist || []).join('\n');
    this.updateInjectModeUI(injectMode);

    const savedViewMode = dataManager.settings.viewMode;
    if (savedViewMode && (savedViewMode === 'list' || savedViewMode === 'grid')) {
      this.manager.viewMode = savedViewMode;
    }
    this.manager.updateViewToggle();
  }

  async saveViewMode() {
    dataManager.settings.viewMode = this.manager.viewMode;
    await this.saveSettings();
  }

  updateInjectModeUI(mode) {
    document.getElementById('whitelist-group').style.display = mode === 'whitelist' ? 'block' : 'none';
    document.getElementById('blacklist-group').style.display = mode === 'blacklist' ? 'block' : 'none';
  }

  cleanUrl(url) {
    if (!url) return url;
    return url
      .toLowerCase()
      .replace(/^(https?:\/\/)?/, '')
      .replace(/\/.*$/, '');
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

  renderBlockedInputsManager() {
    const hostSelect = document.getElementById('blocked-host-select');
    if (!hostSelect) return;

    const blockedInputs = dataManager.settings.blockedInputs || {};
    const hosts = Object.keys(blockedInputs);
    
    const localHosts = hosts.filter(h => h.includes('localhost') || h.includes('127.0.0.1'));
    const remoteHosts = hosts.filter(h => !h.includes('localhost') && !h.includes('127.0.0.1'));
    
    const currentValue = hostSelect.value;
    hostSelect.innerHTML = `
      <option value="">选择网站...</option>
      ${localHosts.length > 0 ? `<optgroup label="本地服务（按端口区分）">${localHosts.map(host => `<option value="${host}">${host} (${blockedInputs[host].length})</option>`).join('')}</optgroup>` : ''}
      ${remoteHosts.length > 0 ? `<optgroup label="远程网站">${remoteHosts.map(host => `<option value="${host}">${host} (${blockedInputs[host].length})</option>`).join('')}</optgroup>` : ''}
    `;
    if (hosts.includes(currentValue)) {
      hostSelect.value = currentValue;
    }
    
    this.renderBlockedInputsList();
  }
  
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
      const type = inputId.split(':')[0];
      const value = inputId.split(':').slice(1).join(':').substring(0, 30);
      const displayText = `[${type}] ${value}${inputId.length > 30 ? '...' : ''}`;
      
      return `
        <div class="blocked-list-item" style="font-size: 12px;">
          <span title="${inputId}">${displayText}</span>
          <button class="btn btn-small btn-danger unblock-input-btn" data-host="${hostname}" data-index="${index}">解除</button>
        </div>
      `;
    }).join('');
    
    container.querySelectorAll('.unblock-input-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.unblockInput(btn.dataset.host, parseInt(btn.dataset.index));
      });
    });
  }
  
  async unblockInput(hostname, index) {
    const blockedInputs = dataManager.settings.blockedInputs || {};
    if (blockedInputs[hostname]) {
      blockedInputs[hostname].splice(index, 1);

      if (blockedInputs[hostname].length === 0) {
        delete blockedInputs[hostname];
      }

      await dataManager.saveData();
      this.manager.showToast('已解除屏蔽');
    }
  }

  async exportData() {
    try {
      const result = await dataManager.exportData();
      this.manager.showToast(`已导出到: ${result.filename || 'NotebookBackup 文件夹'}`);
    } catch (error) {
      this.manager.showToast('导出失败: ' + error.message);
    }
  }

  async importData(file) {
    try {
      if (!file || !(file instanceof Blob)) {
        throw new Error('无效的文件对象');
      }

      const result = await dataManager.importData(file);
      this.manager.loadItems();
      this.manager.render();
      this.manager.showToast(`导入成功！新增 ${result.added} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`);
    } catch (error) {
      alert('导入失败：' + error.message);
    }
  }
}

if (typeof window !== 'undefined') {
  window.NotesSettings = NotesSettings;
}
