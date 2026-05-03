// AI设置页面逻辑
class AISettingsPage {
  constructor() {
    this.config = null;
    this.apiKeyVisible = false;
    this.isRendering = false;  // 标志：是否正在渲染
    console.log('AISettings: constructor调用');
    this.init();
  }

  async init() {
    console.log('AISettings: init开始');
    await this.loadConfig();
    console.log('AISettings: loadConfig完成，isRendering=', this.isRendering);
    this.bindEvents();
    console.log('AISettings: bindEvents完成，调用render');
    this.render();
    console.log('AISettings: render调用返回，isRendering=', this.isRendering);
  }

  async loadConfig() {
    console.log('AISettings: [LOAD_CONFIG_START] 开始加载配置');
    const loadedConfig = await aiConfigManager.getConfig();
    console.log('AISettings: [LOAD_CONFIG_RAW] 原始加载的配置:', JSON.stringify(loadedConfig, null, 2));

    // 确保配置对象完整
    this.config = {
      enabled: loadedConfig.enabled || false,
      provider: loadedConfig.provider || 'zhipu',
      apiKey: loadedConfig.apiKey || '',
      apiEndpoint: loadedConfig.apiEndpoint || '',
      model: loadedConfig.model || 'glm-4',
      customModelName: loadedConfig.customModelName || '',
      customModels: loadedConfig.customModels || [],
      settings: {
        temperature: loadedConfig.settings?.temperature ?? 0.7,
        maxTokens: loadedConfig.settings?.maxTokens ?? 2000,
        timeout: loadedConfig.settings?.timeout ?? 30000,
        maxRetries: loadedConfig.settings?.maxRetries ?? 3,
        retryDelay: loadedConfig.settings?.retryDelay ?? 1000
      },
      usageStats: loadedConfig.usageStats || {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0
      }
    };

    console.log('AISettings: [LOAD_CONFIG_PROCESSED] 整理后的配置:', {
      enabled: this.config.enabled,
      provider: this.config.provider,
      apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 4)}***` : '空',
      apiKeyLength: this.config.apiKey ? this.config.apiKey.length : 0,
      model: this.config.model,
      customModels: this.config.customModels,
      settings: this.config.settings,
      usageStats: this.config.usageStats
    });
    console.log('AISettings: [LOAD_CONFIG_END] 配置加载完成');
  }

  bindEvents() {
    // 启用/禁用AI功能
    document.getElementById('ai-enabled').addEventListener('change', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] ai-enabled change触发', {
        checked: e.target.checked,
        time: Date.now()
      });
      this.config.enabled = e.target.checked;
      this.toggleAIFields(e.target.checked);
    });

    // 服务提供商切换
    document.getElementById('provider').addEventListener('change', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] provider change触发', {
        value: e.target.value,
        time: Date.now()
      });
      this.config.provider = e.target.value;
      this.updateModelOptions();
      this.toggleCustomEndpoint(e.target.value === 'custom');
    });

    // API端点
    document.getElementById('api-endpoint').addEventListener('input', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] api-endpoint input触发', {
        value: e.target.value,
        time: Date.now()
      });
      this.config.apiEndpoint = e.target.value.trim();
    });

    // API密钥
    document.getElementById('api-key').addEventListener('input', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] api-key input触发', {
        value: e.target.value ? `${e.target.value.substring(0, 4)}***` : '空',
        time: Date.now()
      });
      this.config.apiKey = e.target.value.trim();
    });

    // 切换API密钥显示/隐藏
    document.getElementById('toggle-api-key').addEventListener('click', () => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] toggle-api-key click触发');
      this.toggleAPIKeyVisibility();
    });

    // 测试API连接
    document.getElementById('test-api-key').addEventListener('click', () => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] test-api-key click触发');
      this.testAPIConnection();
    });

    // 模型选择
    document.getElementById('model').addEventListener('change', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] model change触发', {
        value: e.target.value,
        time: Date.now()
      });
      this.config.model = e.target.value;
    });

    // 高级设置
    document.getElementById('temperature').addEventListener('input', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] temperature input触发');
      this.config.settings.temperature = parseFloat(e.target.value);
      document.getElementById('temperature-value').textContent = e.target.value;
    });

    document.getElementById('max-tokens').addEventListener('input', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] max-tokens input触发');
      this.config.settings.maxTokens = parseInt(e.target.value) || 2000;
    });

    document.getElementById('timeout').addEventListener('input', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      console.log('AISettings: [EVENT] timeout input触发');
      this.config.settings.timeout = (parseInt(e.target.value) || 30) * 1000;
    });

    document.getElementById('max-retries').addEventListener('input', (e) => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      this.config.settings.maxRetries = parseInt(e.target.value) || 3;
    });

    // 添加自定义模型
    document.getElementById('add-custom-model').addEventListener('click', () => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      this.showAddCustomModelDialog();
    });

    // 重置统计
    document.getElementById('reset-stats').addEventListener('click', () => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      this.resetStats();
    });

    // 保存设置
    document.getElementById('save-btn').addEventListener('click', () => {
      console.log('AISettings: [EVENT] save-btn click触发，isRendering=', this.isRendering);
      if (this.isRendering) {
        console.log('AISettings: [EVENT] save-btn 被忽略，因为 isRendering=true');
        return;
      }
      console.log('AISettings: [EVENT] 调用 saveSettings()');
      this.saveSettings();
    });

    // 取消
    document.getElementById('cancel-btn').addEventListener('click', () => {
      if (this.isRendering) return;  // 渲染期间忽略事件
      window.close();
    });
  }

  render() {
    this.isRendering = true;  // 开始渲染，禁用事件处理
    console.log('AISettings: [RENDER_START] render开始，isRendering=true');
    
    try {
      console.log('AISettings: [RENDER_CONFIG] this.config=', {
        enabled: this.config.enabled,
        provider: this.config.provider,
        apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 4)}***` : '空',
        apiKeyLength: this.config.apiKey ? this.config.apiKey.length : 0,
        model: this.config.model,
        customModels: this.config.customModels
      });

      // 启用状态
      document.getElementById('ai-enabled').checked = this.config.enabled;
      this.toggleAIFields(this.config.enabled);

      // 服务提供商
      document.getElementById('provider').value = this.config.provider;

      // API端点
      document.getElementById('api-endpoint').value = this.config.apiEndpoint || '';
      this.toggleCustomEndpoint(this.config.provider === 'custom');

      // API密钥 - 使用setTimeout确保在浏览器自动填充后设置
      const apiKeyInput = document.getElementById('api-key');
      const apiKeyValue = this.config.apiKey || '';

      // 立即设置一次
      console.log('AISettings: [RENDER] 设置apiKeyInput.value =', apiKeyValue ? `${apiKeyValue.substring(0, 4)}***` : '空');
      apiKeyInput.value = apiKeyValue;

      // 延迟再次设置，防止浏览器自动填充覆盖
      setTimeout(() => {
        console.log('AISettings: [RENDER] 检查apiKeyInput.value', apiKeyInput.value, 'vs', apiKeyValue);
        if (apiKeyInput.value !== apiKeyValue) {
          console.log('AISettings: API密钥被浏览器自动填充覆盖，重新设置');
          apiKeyInput.value = apiKeyValue;
        }
      }, 100);

      this.updateAPIKeyButton();

      // 模型 - 先更新选项，再设置值
      console.log('AISettings: [RENDER] 调用updateModelOptions前，this.config.model=', this.config.model);
      this.updateModelOptions();
      this.updateCustomModelsList();

      // 设置模型选择框的值（确保在选项更新后设置）
      const modelSelect = document.getElementById('model');
      const currentModel = this.config.model || 'glm-4';
      console.log('AISettings: [RENDER] 设置modelSelect.value =', currentModel);

      // 检查选项是否存在，如果不存在则添加
      let optionExists = false;
      for (let i = 0; i < modelSelect.options.length; i++) {
        if (modelSelect.options[i].value === currentModel) {
          optionExists = true;
          break;
        }
      }

      // 如果选项不存在（自定义模型），添加它
      if (!optionExists && currentModel) {
        const option = document.createElement('option');
        option.value = currentModel;
        option.textContent = currentModel;
        modelSelect.appendChild(option);
      }

      modelSelect.value = currentModel;
      console.log('AISettings: [RENDER] modelSelect.value设置完成，实际值=', modelSelect.value);

      // 显示自定义模型列表
      const customModelsList = document.getElementById('custom-models-list');
      if (customModelsList && this.config.customModels && this.config.customModels.length > 0) {
        customModelsList.style.display = 'block';
      }

      // 高级设置
      document.getElementById('temperature').value = this.config.settings.temperature || 0.7;
      document.getElementById('temperature-value').textContent = this.config.settings.temperature || 0.7;
      document.getElementById('max-tokens').value = this.config.settings.maxTokens || 2000;
      document.getElementById('timeout').value = Math.round((this.config.settings.timeout || 30000) / 1000);
      document.getElementById('max-retries').value = this.config.settings.maxRetries || 3;

      // 统计
      this.updateStatsDisplay();
      
      // 检查保存按钮状态
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) {
        console.log('AISettings: [RENDER] 保存按钮状态:', {
          disabled: saveBtn.disabled,
          textContent: saveBtn.textContent,
          style: {
            opacity: saveBtn.style.opacity,
            cursor: saveBtn.style.cursor
          }
        });
      }
    } catch (error) {
      console.error('AISettings: render过程中发生错误', error);
    } finally {
      this.isRendering = false;  // 渲染完成，启用事件处理
      console.log('AISettings: [RENDER_END] render结束，isRendering=false');
      
      // 再次检查保存按钮状态
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) {
        console.log('AISettings: [RENDER_END] 保存按钮最终状态:', {
          disabled: saveBtn.disabled,
          textContent: saveBtn.textContent
        });
      }
    }
  }

  toggleAIFields(enabled) {
    const fields = ['provider', 'api-endpoint', 'api-key', 'model', 'model-group'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.disabled = !enabled;
        el.style.opacity = enabled ? '1' : '0.5';
      }
    });
  }

  toggleCustomEndpoint(show) {
    const group = document.getElementById('custom-endpoint-group');
    if (group) {
      group.style.display = show ? 'block' : 'none';
    }
  }

  updateModelOptions() {
    const provider = this.config.provider || 'zhipu';
    const select = document.getElementById('model');
    const models = aiConfigManager.getModels(provider);

    // 清空现有选项
    select.innerHTML = '';

    // 添加预定义模型
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      select.appendChild(option);
    });

    // 添加自定义模型到下拉列表
    const customModels = this.config.customModels || [];
    customModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.appendChild(option);
    });

    // 如果当前选择的模型是自定义模型且不在customModels中，确保它被添加
    const predefinedModelIds = models.map(m => m.id);
    const isCustomModel = this.config.model && !predefinedModelIds.includes(this.config.model);
    if (isCustomModel && !customModels.includes(this.config.model)) {
      const option = document.createElement('option');
      option.value = this.config.model;
      option.textContent = this.config.model;
      select.appendChild(option);
    }
  }

  updateCustomModelsList() {
    const listContainer = document.getElementById('custom-models-list');
    if (!listContainer) return;
    
    const customModels = this.config.customModels || [];
    
    if (customModels.length === 0) {
      listContainer.style.display = 'none';
      listContainer.innerHTML = '';
      return;
    }

    listContainer.style.display = 'block';
    listContainer.innerHTML = customModels.map(model => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-bottom: 1px solid #f0f0f0;">
        <span style="flex: 1;">${model}</span>
        <button type="button" data-model="${model}" class="delete-model-btn" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">删除</button>
      </div>
    `).join('');

    // 绑定删除按钮事件
    listContainer.querySelectorAll('.delete-model-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (this.isRendering) return;  // 渲染期间忽略事件
        const model = e.target.dataset.model;
        this.deleteCustomModel(model);
      });
    });
  }

  showAddCustomModelDialog() {
    const modelName = prompt('请输入自定义模型名称（例如: gpt-4o, claude-3-opus, gemini-pro）:');
    if (!modelName || !modelName.trim()) {
      return;
    }

    const model = modelName.trim();

    // 确保customModels是数组
    if (!this.config.customModels) {
      this.config.customModels = [];
    }

    // 检查是否已存在
    if (this.config.customModels.includes(model)) {
      this.showToast('该模型已存在', 'error');
      return;
    }

    // 添加模型
    this.config.customModels.push(model);
    this.config.model = model;

    // 更新UI
    this.updateModelOptions();
    this.updateCustomModelsList();

    // 设置选中的模型
    const modelSelect = document.getElementById('model');
    modelSelect.value = model;

    this.showToast('模型添加成功', 'success');
  }

  deleteCustomModel(model) {
    if (!confirm(`确定要删除模型 "${model}" 吗？`)) {
      return;
    }

    // 确保customModels是数组
    if (!this.config.customModels) {
      this.config.customModels = [];
      return;
    }

    // 从自定义模型列表中删除
    this.config.customModels = this.config.customModels.filter(m => m !== model);
    
    // 如果当前选中的是被删除的模型，切换到默认模型
    if (this.config.model === model) {
      this.config.model = 'glm-4';
    }
    
    // 更新UI
    this.updateModelOptions();
    this.updateCustomModelsList();
    
    this.showToast('模型已删除', 'success');
  }

  updateAPIKeyButton() {
    const btn = document.getElementById('toggle-api-key');
    btn.textContent = this.apiKeyVisible ? '🙈 隐藏' : '👁️ 显示';
  }

  toggleAPIKeyVisibility() {
    const input = document.getElementById('api-key');
    this.apiKeyVisible = !this.apiKeyVisible;
    input.type = this.apiKeyVisible ? 'text' : 'password';
    this.updateAPIKeyButton();
  }

  async testAPIConnection() {
    const apiKey = document.getElementById('api-key').value.trim();
    const provider = document.getElementById('provider').value;

    if (!apiKey) {
      this.showToast('请先输入API密钥', 'error');
      return;
    }

    const testBtn = document.getElementById('test-api-key');
    testBtn.disabled = true;
    testBtn.textContent = '🔄 测试中...';

    try {
      const result = await aiConfigManager.validateApiKey(apiKey, provider);

      if (result.valid) {
        this.showToast('✅ API连接成功！', 'success');
        // 只更新当前内存中的配置，不保存到storage
        this.config.apiKey = apiKey;
        this.config.provider = provider;
      } else {
        this.showToast(`❌ ${result.error}`, 'error');
      }
    } catch (error) {
      this.showToast(`❌ 测试失败: ${error.message}`, 'error');
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '🧪 测试连接';
    }
  }

  async saveSettings() {
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = '💾 保存中...';

    try {
      console.log('AISettings: [SAVE_START] 准备保存配置');
      console.log('AISettings: [SAVE_CONFIG] 当前配置:', JSON.stringify({
        enabled: this.config.enabled,
        provider: this.config.provider,
        apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 4)}***` : '空',
        apiKeyLength: this.config.apiKey ? this.config.apiKey.length : 0,
        model: this.config.model,
        customModels: this.config.customModels
      }, null, 2));
      
      // 确保配置对象完整
      const configToSave = {
        enabled: this.config.enabled ?? false,
        provider: this.config.provider || 'zhipu',
        apiKey: this.config.apiKey || '',
        apiEndpoint: this.config.apiEndpoint || '',
        model: this.config.model || 'glm-4',
        customModels: this.config.customModels || [],
        customModelName: this.config.customModelName || '',
        settings: {
          temperature: this.config.settings?.temperature ?? 0.7,
          maxTokens: this.config.settings?.maxTokens ?? 2000,
          timeout: this.config.settings?.timeout ?? 30000,
          maxRetries: this.config.settings?.maxRetries ?? 3,
          retryDelay: this.config.settings?.retryDelay ?? 1000
        },
        usageStats: this.config.usageStats || {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0
        }
      };
      
      console.log('AISettings: [SAVE_PREPARED] 整理后的配置:', JSON.stringify({
        enabled: configToSave.enabled,
        provider: configToSave.provider,
        apiKey: configToSave.apiKey ? `${configToSave.apiKey.substring(0, 4)}***` : '空',
        apiKeyLength: configToSave.apiKey ? configToSave.apiKey.length : 0,
        model: configToSave.model,
        customModels: configToSave.customModels
      }, null, 2));
      
      console.log('AISettings: [SAVE_CALLING] 调用 aiConfigManager.saveConfig...');
      await aiConfigManager.saveConfig(configToSave);
      
      console.log('AISettings: [SAVE_COMPLETE] 保存完成');
      console.log('AISettings: [SAVE_WAIT] 等待storage同步...');
      
      // 延迟加载配置，确保storage已同步
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('AISettings: [RELOAD_START] 重新加载配置');
      await this.loadConfig();
      
      console.log('AISettings: [RELOAD_COMPLETE] 重新加载后的配置:', JSON.stringify({
        enabled: this.config.enabled,
        provider: this.config.provider,
        apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 4)}***` : '空',
        apiKeyLength: this.config.apiKey ? this.config.apiKey.length : 0,
        model: this.config.model,
        customModels: this.config.customModels
      }, null, 2));
      
      this.showToast('✅ 设置已保存！', 'success');
      
      setTimeout(() => window.close(), 1000);
    } catch (error) {
      console.error('AISettings: 保存失败', error);
      this.showToast(`❌ 保存失败: ${error.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 保存设置';
    }
  }

  async resetStats() {
    if (confirm('确定要重置使用统计吗？')) {
      await aiConfigManager.resetUsageStats();
      this.updateStatsDisplay();
      this.showToast('📊 统计已重置', 'success');
    }
  }

   async updateStatsDisplay() {
    const stats = await aiConfigManager.getUsageStats();
    if (!stats) return;
    
    const requestsEl = document.getElementById('stat-requests');
    const tokensEl = document.getElementById('stat-tokens');
    const costEl = document.getElementById('stat-cost');
    
    if (requestsEl) requestsEl.textContent = (stats.totalRequests || 0).toLocaleString();
    if (tokensEl) tokensEl.textContent = (stats.totalTokens || 0).toLocaleString();
    if (costEl) costEl.textContent = `$${(stats.totalCost || 0).toFixed(4)}`;
  }

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 3000);
  }
}

// 页面加载后初始化
const aiSettingsPage = new AISettingsPage();
