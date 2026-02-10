// AI服务管理器 - 统一管理不同AI服务提供商的API调用
class AIServiceManager {
  constructor(config) {
    this.config = config;
    // 不在这里初始化 rateLimiter，延迟到使用时
    this.rateLimiter = null;
    this.requestQueue = [];
    this.isProcessing = false;
    this.initialized = false;
  }

  // 初始化方法
  async init() {
    if (this.initialized) return;
    const config = await this.config.getConfig();
    this.maxRetries = config?.settings?.maxRetries || 3;
    this.retryDelay = config?.settings?.retryDelay || 1000;
    this.initialized = true;
  }

  // 获取 rateLimiter 实例（延迟初始化）
  async getRateLimiter() {
    if (!this.rateLimiter) {
      const config = await this.config.getConfig();
      const maxRetries = config?.settings?.maxRetries || 3;
      this.rateLimiter = new RateLimiter(maxRetries, 1000);
    }
    return this.rateLimiter;
  }

  // 调用LLM接口
  async callLLMAPI(prompt, options = {}) {
    const config = await this.config.getConfig();
    
    if (!config.enabled || !config.apiKey) {
      throw new Error('AI功能未启用或API密钥未配置');
    }

    // 获取实际使用的模型名称
    const actualModel = this.config.getActualModelName ? 
      this.config.getActualModelName(config) : 
      (config.model === 'custom' && config.customModelName ? config.customModelName : config.model);

    // 确保 settings 存在
    const settings = config.settings || {};

    const {
      model = actualModel,
      temperature = options.temperature ?? settings.temperature ?? 0.7,
      maxTokens = options.maxTokens ?? settings.maxTokens ?? 2000,
      systemPrompt = null
    } = options;

    const requestConfig = {
      provider: config.provider,
      apiEndpoint: config.apiEndpoint,
      apiKey: config.apiKey,
      model,
      temperature,
      maxTokens,
      systemPrompt,
      prompt
    };

    return await this.executeWithRetry(() => this.makeAPIRequest(requestConfig));
  }

  // 发起API请求
  async makeAPIRequest(config) {
    const { provider, apiEndpoint, apiKey, model, temperature, maxTokens, systemPrompt, prompt } = config;

    const rateLimiter = await this.getRateLimiter();
    await rateLimiter.wait();

    const controller = new AbortController();
    const currentConfig = await this.config.getConfig();
    const timeout = currentConfig?.settings?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      let url, headers, body;

      switch (provider) {
        case 'openai':
          url = 'https://api.openai.com/v1/chat/completions';
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };
          body = JSON.stringify({
            model: model,
            messages: this.buildMessages(systemPrompt, prompt),
            temperature,
            max_tokens: maxTokens
          });
          break;

        case 'zhipu':
          url = apiEndpoint || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };
          body = JSON.stringify({
            model: model,
            messages: this.buildMessages(systemPrompt, prompt),
            temperature,
            max_tokens: maxTokens
          });
          break;

        case 'custom':
          url = apiEndpoint;
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };
          body = JSON.stringify({
            model: model,
            messages: this.buildMessages(systemPrompt, prompt),
            temperature,
            max_tokens: maxTokens
          });
          break;

        default:
          throw new Error(`不支持的服务提供商: ${provider}`);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new APIError(response.status, await response.json(), errorText);
      }

      const data = await response.json();
      return this.parseResponse(data, model);

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new APIError(408, { error: '请求超时' }, '请求超时');
      }

      throw error;
    }
  }

  // 构建消息格式
  buildMessages(systemPrompt, userPrompt) {
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: userPrompt });
    
    return messages;
  }

  // 解析API响应
  parseResponse(data, model) {
    const provider = this.config.config?.provider || 'openai';

    switch (provider) {
      case 'openai':
        return {
          success: true,
          content: data.choices?.[0]?.message?.content || '',
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0
          },
          cost: this.calculateCost(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, model),
          model
        };

      case 'zhipu':
        return {
          success: true,
          content: data.choices?.[0]?.message?.content || '',
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0
          },
          cost: this.calculateCost(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, model),
          model
        };

      default:
        return {
          success: true,
          content: data.content || data.text || '',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
          },
          cost: 0,
          model
        };
    }
  }

  // 处理重试
  async handleRetry(fn, maxRetries, delay) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 不重试的错误
        if (error instanceof APIError && !error.retryable) {
          throw error;
        }

        // 最后一次尝试失败
        if (attempt === maxRetries - 1) {
          throw error;
        }

        // 指数退避
        const waitTime = delay * Math.pow(2, attempt);
        console.log(`请求失败，${waitTime}ms后重试 (${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError;
  }

  // 执行带重试的请求
  async executeWithRetry(fn) {
    const config = await this.config.getConfig();
    const settings = config?.settings || {};
    const maxRetries = settings.maxRetries ?? 3;
    const retryDelay = settings.retryDelay ?? 1000;

    return await this.handleRetry(fn, maxRetries, retryDelay);
  }

  // 计算成本
  calculateCost(inputTokens, outputTokens, model) {
    const pricing = this.config.getModelPricing?.(this.config.config?.provider, model) || { input: 0, output: 0 };
    
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }

  // 估算token数（粗略）
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}

// 自定义API错误类
class APIError extends Error {
  constructor(statusCode, response, message) {
    super(message);
    this.statusCode = statusCode;
    this.response = response;
    this.retryable = this.isRetryable(statusCode, response);
  }

  isRetryable(statusCode, response) {
    // 408 超时、429 限流、5xx 服务器错误可以重试
    if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
      return true;
    }

    // 401 认证失败可以重试（token可能过期）
    if (statusCode === 401) {
      return true;
    }

    return false;
  }
}

// 限流器
class RateLimiter {
  constructor(tokensPerInterval, interval) {
    this.tokens = tokensPerInterval;
    this.interval = interval;
    this.lastCall = 0;
  }

  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastCall;

    if (elapsed < this.interval) {
      const waitTime = this.interval - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastCall = Date.now();
  }
}

// 创建全局实例
let aiServiceManagerInstance = null;

// 初始化函数（异步）
async function initAIServiceManager() {
  if (!aiServiceManagerInstance) {
    if (typeof aiConfigManager !== 'undefined' && aiConfigManager) {
      try {
        await aiConfigManager.init();
        aiServiceManagerInstance = new AIServiceManager(aiConfigManager);
        await aiServiceManagerInstance.init();
        console.log('aiServiceManager 初始化成功');
      } catch (error) {
        console.error('初始化 aiServiceManager 失败:', error);
        aiServiceManagerInstance = null;
      }
    } else {
      console.error('aiConfigManager 未定义，无法初始化 aiServiceManager');
    }
  }
}

// 获取实例的函数（异步）
async function getAIServiceManager() {
  if (!aiServiceManagerInstance) {
    await initAIServiceManager();
  }
  return aiServiceManagerInstance;
}

// 获取实例的函数（同步，用于向后兼容）
function getAIServiceManagerSync() {
  return aiServiceManagerInstance;
}

// 导出函数
window.getAIServiceManager = getAIServiceManager;
window.getAIServiceManagerSync = getAIServiceManagerSync;

// 兼容性：保持原有变量名
let aiServiceManager = null;

// 自动初始化
if (typeof aiConfigManager !== 'undefined' && aiConfigManager) {
  initAIServiceManager().then(instance => {
    aiServiceManager = aiServiceManagerInstance;
  }).catch(error => {
    console.error('自动初始化 aiServiceManager 失败:', error);
  });
}
