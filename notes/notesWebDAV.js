// WebDAV 设置模块
class NotesWebDAV {
  constructor(manager) {
    this.manager = manager;
  }

  init() {
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

    const webdavConfig = dataManager.settings.webdav || {};
    
    enabledCheckbox.checked = webdavConfig.enabled || false;
    serverInput.value = webdavConfig.serverUrl || '';
    usernameInput.value = webdavConfig.username || '';
    passwordInput.value = webdavConfig.password || '';
    pathInput.value = webdavConfig.syncPath || '/notebook-sync/';
    filenameInput.value = webdavConfig.filename || 'notebook-data.json';
    
    const loadSyncConfig = async () => {
      try {
        const result = await chrome.storage.local.get('syncConfig');
        const syncConfig = result.syncConfig || {};
        
        autoSyncCheckbox.checked = syncConfig.autoSync !== false;
        syncOnChangeCheckbox.checked = syncConfig.syncOnChange !== false;
        
        const intervalValue = syncConfig.syncInterval !== undefined ? syncConfig.syncInterval : 5;
        const intervalString = String(intervalValue);
        
        const optionExists = Array.from(syncIntervalSelect.options).some(o => o.value === intervalString);
        
        if (optionExists) {
          syncIntervalSelect.value = intervalString;
        } else {
          syncIntervalSelect.value = '5';
        }
        
        conflictResolutionSelect.value = syncConfig.conflictResolution || 'newest';
      } catch (error) {
        console.error('加载同步配置失败:', error);
      }
    };
    
    loadSyncConfig();

    configDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';

    enabledCheckbox.addEventListener('change', () => {
      configDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
    });

    const showStatus = (message, isError = false) => {
      statusDiv.textContent = message;
      statusDiv.style.display = 'block';
      statusDiv.style.background = isError ? '#f8d7da' : '#d4edda';
      statusDiv.style.color = isError ? '#721c24' : '#155724';
      statusDiv.style.border = `1px solid ${isError ? '#f5c6cb' : '#c3e6cb'}`;
    };

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

    const getConfig = () => ({
      enabled: enabledCheckbox.checked,
      serverUrl: serverInput.value.trim(),
      username: usernameInput.value.trim(),
      password: passwordInput.value,
      syncPath: pathInput.value.trim() || '/notebook-sync/',
      filename: filenameInput.value.trim() || 'notebook-data.json'
    });

    const getSyncConfig = () => {
      const intervalValue = parseFloat(syncIntervalSelect.value);
      return {
        enabled: enabledCheckbox.checked,
        autoSync: autoSyncCheckbox.checked,
        syncOnChange: syncOnChangeCheckbox.checked,
        syncInterval: intervalValue,
        conflictResolution: conflictResolutionSelect.value
      };
    };

    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'syncStatus') {
        updateSyncInfo(message.status, message.timestamp);
      }
    });

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

    saveBtn?.addEventListener('click', async () => {
      const config = getConfig();
      const syncCfg = getSyncConfig();
      
      try {
        const webdavResult = await webdavConfigManager.saveConfig(config);
        
        if (!webdavResult.success) {
          showStatus('WebDAV 配置保存失败: ' + webdavResult.error, true);
          return;
        }
        
        dataManager.settings.webdav = config;
        await dataManager.saveData();
        
        await chrome.storage.local.set({ syncConfig: syncCfg });
        
        await chrome.runtime.sendMessage({ action: 'settingsChanged' });
        
        showStatus('配置已保存');
      } catch (error) {
        console.error('保存配置失败:', error);
        showStatus('保存失败: ' + error.message, true);
      }
    });

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
          tags: Array.from(dataManager.tags),
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
            if (result.data.tags) {
              dataManager.tags = new Set(result.data.tags);
            }
            await dataManager.saveData();
            this.manager.loadItems();
            this.manager.render();
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
    
    const versionsBtn = document.getElementById('webdav-versions-btn');
    versionsBtn?.addEventListener('click', async () => {
      const config = getConfig();
      if (!config.enabled) {
        showStatus('请先启用 WebDAV 同步', true);
        return;
      }

      versionsBtn.disabled = true;
      versionsBtn.textContent = '📋 获取版本...';

      try {
        const client = new WebDAVClient(config);
        const result = await client.listAvailableVersions();

        if (result.success && result.versions && result.versions.length > 0) {
          const versionList = result.versions.map((v, index) => 
            `${index + 1}. ${v.label} - ${new Date(v.timestamp).toLocaleString('zh-CN')}`
          ).join('\n');
          
          const selected = prompt(
            `找到 ${result.versions.length} 个版本，请选择要下载的版本：\n\n${versionList}\n\n输入序号（1-${result.versions.length}）：`,
            '1'
          );
          
          if (selected !== null) {
            const selectedIndex = parseInt(selected) - 1;
            if (selectedIndex >= 0 && selectedIndex < result.versions.length) {
              const selectedVersion = result.versions[selectedIndex];
              versionsBtn.disabled = true;
              versionsBtn.textContent = '⬇️ 下载中...';
              
              const downloadResult = await client.downloadFromVersion(selectedVersion.path);
              
              if (downloadResult.success && downloadResult.data) {
                const confirmMsg = `下载成功！\n\n版本：${selectedVersion.label}\n时间：${new Date(selectedVersion.timestamp).toLocaleString('zh-CN')}\n\n是否用此版本覆盖本地数据？`;
                if (confirm(confirmMsg)) {
                  if (downloadResult.data.items) {
                    dataManager.items = downloadResult.data.items;
                  }
                  if (downloadResult.data.deletedItems) {
                    dataManager.deletedItems = downloadResult.data.deletedItems;
                  }
                  if (downloadResult.data.tags) {
                    dataManager.tags = new Set(downloadResult.data.tags);
                  }
                  await dataManager.saveData();
                  this.manager.loadItems();
                  this.manager.render();
                  showStatus(`已从版本 ${selectedVersion.label} 恢复数据`);
                }
              } else {
                showStatus('下载失败：' + downloadResult.error, true);
              }
            } else {
              showStatus('无效的选项', true);
            }
          }
        } else {
          showStatus('未找到任何版本：' + (result.error || ''), true);
        }
      } catch (error) {
        console.error('版本选择错误:', error);
        showStatus('操作失败：' + error.message, true);
      } finally {
        versionsBtn.disabled = false;
        versionsBtn.textContent = '📋 选择版本';
      }
    });
    
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

if (typeof window !== 'undefined') {
  window.NotesWebDAV = NotesWebDAV;
}
