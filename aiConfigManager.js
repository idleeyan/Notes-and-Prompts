// AI配置管理器 - 管理AI服务的配置信息
class AIConfigManager {
  constructor() {
    this.config = null;
    this.initialized = false;
    this.initPromise = null;
  }

  // 初始化
  async init() {
    // 如果已经有初始化进行中，等待它完成
    if (this.initPromise) {
      console.log('AIConfigManager: 等待初始化完成');
      return this.initPromise;
    }

    if (this.initialized) {
      console.log('AIConfigManager: 已经初始化，跳过');
      return;
    }

    console.log('AIConfigManager: 开始初始化');

    // 创建初始化Promise，确保只执行一次
    this.initPromise = (async () => {
      try {
        await this.getConfig();
        this.initialized = true;
        console.log('AIConfigManager: 初始化完成');
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  // 获取默认配置
  getDefaultConfig() {
    return {
      enabled: false,
      provider: 'zhipu', // 'openai' | 'zhipu' | 'custom'
      apiKey: '',
      apiEndpoint: '',
      model: 'glm-4',
      customModelName: '', // 自定义模型名称
      customModels: [], // 自定义模型列表
      settings: {
        temperature: 0.7,
        maxTokens: 2000,
        timeout: 30000, // 30秒
        maxRetries: 3,
        retryDelay: 1000
      },
      usageStats: {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0
      }
    };
  }

  // 获取实际使用的模型名称
  getActualModelName(config) {
    if (config.model === 'custom' && config.customModelName) {
      return config.customModelName;
    }
    return config.model || 'glm-4';
  }

  // 获取配置
  async getConfig() {
    try {
      // 记录调用栈
      const stack = new Error().stack;
      console.log('AIConfigManager: [GET_CONFIG] getConfig被调用');
      console.log('AIConfigManager: [GET_CONFIG] 调用栈:', stack);
      
      const result = await chrome.storage.local.get(['aiConfig']);
      console.log('AIConfigManager: [GET_CONFIG] 从storage读取配置', {
        hasAiConfig: !!result.aiConfig,
        aiConfigKeys: result.aiConfig ? Object.keys(result.aiConfig) : [],
        apiKeyLength: result.aiConfig?.apiKey?.length || 0,
        model: result.aiConfig?.model,
        customModels: result.aiConfig?.customModels
      });

      if (!result.aiConfig) {
        console.log('AIConfigManager: [GET_CONFIG] 未找到配置，使用默认配置');
        this.config = this.getDefaultConfig();
      } else {
        console.log('AIConfigManager: [GET_CONFIG] 找到配置', result.aiConfig);
        const defaultConfig = this.getDefaultConfig();
        this.config = {
          ...defaultConfig,
          ...result.aiConfig,
          settings: {
            ...defaultConfig.settings,
            ...(result.aiConfig.settings || {})
          },
          usageStats: {
            ...defaultConfig.usageStats,
            ...(result.aiConfig.usageStats || {})
          },
          customModels: result.aiConfig.customModels !== undefined ? result.aiConfig.customModels : defaultConfig.customModels
        };
      }

      console.log('AIConfigManager: [GET_CONFIG] 配置获取完成', {
        enabled: this.config.enabled,
        provider: this.config.provider,
        apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 4)}***` : '空',
        apiKeyLength: this.config.apiKey ? this.config.apiKey.length : 0,
        model: this.config.model,
        customModels: this.config.customModels,
        hasApiKey: !!this.config.apiKey
      });

      return this.config;
    } catch (error) {
      console.error('AIConfigManager: 获取配置失败', error);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  // 保存配置
  async saveConfig(config) {
    if (!config) {
      console.error('AIConfigManager: [SAVE_CONFIG] saveConfig 被调用但 config 为空');
      console.trace('AIConfigManager: [SAVE_CONFIG] 调用栈:');
      return;
    }

    // 记录调用栈
    const stack = new Error().stack;
    console.log('AIConfigManager: [SAVE_CONFIG] saveConfig被调用');
    console.log('AIConfigManager: [SAVE_CONFIG] 调用栈:', stack);
    
    console.log('AIConfigManager: [SAVE_CONFIG] 开始保存配置', {
      enabled: config.enabled,
      provider: config.provider,
      apiKey: config.apiKey ? `${config.apiKey.substring(0, 4)}***` : '空',
      apiKeyLength: config.apiKey ? config.apiKey.length : 0,
      model: config.model,
      customModels: config.customModels,
      settings: config.settings
    });

    // 确保有默认配置
    const defaultConfig = this.getDefaultConfig();
    const currentConfig = this.config || defaultConfig;

    this.config = {
      ...currentConfig,
      ...config,
      settings: {
        ...currentConfig.settings,
        ...(config.settings || {})
      },
      usageStats: {
        ...currentConfig.usageStats,
        ...(config.usageStats || {})
      },
      customModels: config.customModels !== undefined ? config.customModels : currentConfig.customModels
    };

    console.log('AIConfigManager: 合并后的配置', {
      enabled: this.config.enabled,
      provider: this.config.provider,
      apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 4)}***` : '空',
      apiKeyLength: this.config.apiKey ? this.config.apiKey.length : 0,
      model: this.config.model,
      customModels: this.config.customModels,
      hasApiKey: !!this.config.apiKey
    });

    try {
      const configToSave = { ...this.config };
      console.log('AIConfigManager: 准备保存的配置', {
        ...configToSave,
        apiKey: configToSave.apiKey ? `${configToSave.apiKey.substring(0, 4)}***` : '空'
      });
      
      // 记录调用栈
      const setStack = new Error().stack;
      console.log('AIConfigManager: [STORAGE_SET] 准备调用 chrome.storage.local.set');
      console.log('AIConfigManager: [STORAGE_SET] 调用栈:', setStack);
      
      await chrome.storage.local.set({ aiConfig: configToSave });
      console.log('AIConfigManager: 配置已保存到 storage');
      
      // 验证保存是否成功
      const verify = await chrome.storage.local.get(['aiConfig']);
      if (verify.aiConfig) {
        console.log('AIConfigManager: 保存验证成功', {
          enabled: verify.aiConfig.enabled,
          provider: verify.aiConfig.provider,
          apiKey: verify.aiConfig.apiKey ? `${verify.aiConfig.apiKey.substring(0, 4)}***` : '空',
          apiKeyLength: verify.aiConfig.apiKey ? verify.aiConfig.apiKey.length : 0,
          model: verify.aiConfig.model,
          customModels: verify.aiConfig.customModels,
          hasApiKey: !!verify.aiConfig.apiKey
        });
      } else {
        console.error('AIConfigManager: 保存验证失败 - storage 中没有找到配置');
        throw new Error('配置保存验证失败');
      }
    } catch (error) {
      console.error('AIConfigManager: 保存配置失败', error);
      throw error;
    }
  }

  // 更新配置（部分更新）
  async updateConfig(updates) {
    const current = await this.getConfig();
    const updated = {
      ...current,
      ...updates,
      settings: {
        ...current.settings,
        ...(updates.settings || {})
      },
      usageStats: {
        ...current.usageStats,
        ...(updates.usageStats || {})
      },
      customModels: updates.customModels !== undefined ? updates.customModels : current.customModels
    };

    await this.saveConfig(updated);
  }

  // 验证API密钥
  async validateApiKey(apiKey, provider = 'zhipu') {
    if (!apiKey) {
      return { valid: false, error: 'API密钥不能为空' };
    }

    try {
      const result = await this.testAPIConnection(apiKey, provider);
      return result;
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // 测试API连接
  async testAPIConnection(apiKey, provider = 'zhipu') {
    const config = await this.getConfig();
    const timeout = config.settings.timeout || 30000;

    let endpoint, headers, body;

    switch (provider) {
      case 'openai':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        body = JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        });
        break;

      case 'zhipu':
        endpoint = config.apiEndpoint || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        body = JSON.stringify({
          model: this.getActualModelName(config),
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        });
        break;

      case 'custom':
        endpoint = config.apiEndpoint || '';
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        body = JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        });
        break;

      default:
        return { valid: false, error: '不支持的服务提供商' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return { valid: false, error: `API错误 (${response.status}): ${errorText}` };
      }

      const data = await response.json();
      return { valid: true, data };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        return { valid: false, error: '请求超时' };
      }
      return { valid: false, error: error.message };
    }
  }

  // 更新使用统计
  async updateUsageStats(tokens, cost) {
    const config = await this.getConfig();
    
    config.usageStats.totalRequests += 1;
    config.usageStats.totalTokens += tokens;
    config.usageStats.totalCost += cost;

    await this.saveConfig(config);

    return config.usageStats;
  }

  // 重置使用统计
  async resetUsageStats() {
    await this.updateUsageStats(0, 0);
  }

  // 获取使用统计
  async getUsageStats() {
    const config = await this.getConfig();
    return config.usageStats;
  }

  // 获取模型列表
  getModels(provider) {
    const models = {
      openai: [
        { id: 'gpt-4', name: 'GPT-4', context: 8192 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', context: 4096 },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', context: 4096 }
      ],
      zhipu: [
        { id: 'glm-4', name: 'GLM-4', context: 8192 },
        { id: 'glm-4-flash', name: 'GLM-4 Flash', context: 4096 },
        { id: 'glm-4-plus', name: 'GLM-4 Plus', context: 8192 }
      ]
    };

    return models[provider] || models.zhipu;
  }

  // 获取模型定价
  getModelPricing(provider, modelId) {
    const pricing = {
      openai: {
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-4-turbo': { input: 0.01, output: 0.03 },
        'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
      },
      zhipu: {
        'glm-4': { input: 0.0001, output: 0.0001 },
        'glm-4-flash': { input: 0.000015, output: 0.000015 },
        'glm-4-plus': { input: 0.0005, output: 0.0005 }
      }
    };

    return pricing[provider]?.[modelId] || pricing.zhipu['glm-4'];
  }
}

// 创建全局实例
const aiConfigManager = new AIConfigManager();
