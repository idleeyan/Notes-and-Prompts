// AI操作管理器 - 实现具体的AI操作功能
class AIOperationManager {
  constructor(aiService) {
    this.aiService = aiService;
  }

  // 文本优化
  async optimizeText(text, type = 'polish') {
    if (!this.aiService) {
      throw new Error('AI服务未初始化，请先在AI设置中配置API密钥并刷新页面');
    }
    
    const systemPrompt = this.getOptimizePrompt(type);
    
    const result = await this.aiService.callLLMAPI(text, {
      systemPrompt
    });

    if (!result.success) {
      throw new Error(result.error || '文本优化失败');
    }

    await this.trackUsage(result.usage?.totalTokens || 0, result.cost || 0);

    return result.content;
  }

  // 文本翻译
  async translateText(text, targetLang = 'en') {
    if (!this.aiService) {
      throw new Error('AI服务未初始化，请先在AI设置中配置API密钥并刷新页面');
    }
    
    const systemPrompt = this.getTranslatePrompt(targetLang);
    
    const result = await this.aiService.callLLMAPI(text, {
      systemPrompt
    });

    if (!result.success) {
      throw new Error(result.error || '翻译失败');
    }

    await this.trackUsage(result.usage?.totalTokens || 0, result.cost || 0);

    return result.content;
  }

  // 内容生成
  async generateContent(prompt, type = 'extend') {
    if (!this.aiService) {
      throw new Error('AI服务未初始化，请先在AI设置中配置API密钥并刷新页面');
    }
    
    const systemPrompt = this.getGeneratePrompt(type);
    
    const result = await this.aiService.callLLMAPI(prompt, {
      systemPrompt
    });

    if (!result.success) {
      throw new Error(result.error || '内容生成失败');
    }

    await this.trackUsage(result.usage?.totalTokens || 0, result.cost || 0);

    return result.content;
  }

  // AI助手
  async chatWithAI(message, context = null) {
    if (!this.aiService) {
      throw new Error('AI服务未初始化，请先在AI设置中配置API密钥并刷新页面');
    }
    
    const systemPrompt = context ? `以下是对话上下文：\n${context}` : '你是一个有用的助手';
    
    const result = await this.aiService.callLLMAPI(message, {
      systemPrompt
    });

    if (!result.success) {
      throw new Error(result.error || '对话失败');
    }

    await this.trackUsage(result.usage?.totalTokens || 0, result.cost || 0);

    return result.content;
  }

  // 获取优化提示词
  getOptimizePrompt(type) {
    const prompts = {
      polish: `你是一个专业的文本编辑器。请优化以下文本，改善其表达流畅度和专业性。

要求：
1. 保持原意不变
2. 提升表达的流畅度和专业性
3. 适当使用专业术语
4. 保持原有格式

请直接返回优化后的文本，不要添加任何解释。`,

      simplify: `你是一个文本编辑器。请精简以下文本，去除冗余内容。

要求：
1. 保留核心信息
2. 去除冗余和重复
3. 使用简洁的表达
4. 保持逻辑清晰

请直接返回精简后的文本，不要添加任何解释。`,

      expand: `你是一个内容创作助手。请扩充以下文本，丰富其内容。

要求：
1. 保持原有核心观点
2. 添加相关的细节和例证
3. 增强内容的可读性和吸引力
4. 保持逻辑连贯

请直接返回扩充后的文本，不要添加任何解释。`,

      correct: `你是一个专业的校对员。请检查并纠正以下文本中的语法和拼写错误。

要求：
1. 纠正所有语法错误
2. 修正所有拼写错误
3. 改善标点符号使用
4. 保持原有意思

请直接返回纠正后的文本，不要添加任何解释。`
    };

    return prompts[type] || prompts.polish;
  }

  // 获取翻译提示词
  getTranslatePrompt(targetLang) {
    const langNames = {
      'en': '英文',
      'zh': '中文',
      'ja': '日文',
      'ko': '韩文'
    };

    return `你是一个专业的翻译。请将以下文本翻译成${langNames[targetLang] || '英文'}。

要求：
1. 准确翻译，保持原意
2. 符合${langNames[targetLang] || '英文'}的表达习惯
3. 保持专业术语的一致性
4. 保持原有格式

请直接返回翻译后的文本，不要添加任何解释。`;
  }

  // 获取内容生成提示词
  getGeneratePrompt(type) {
    const prompts = {
      extend: `你是一个内容创作助手。请基于以下提示词扩写更详细的内容。

要求：
1. 保持原有主题和风格
2. 添加更多细节和例证
3. 扩展内容的深度和广度
4. 保持逻辑清晰

请直接返回生成的内容。`,

      variant: `你是一个创意助手。请基于以下提示词生成3个不同风格的变体。

要求：
1. 每个变体保持原有核心信息
2. 使用不同的表达方式和风格
3. 涵盖不同的语气（正式、随意、幽默等）
4. 保持实用性

请直接返回3个变体，用分隔符标记。`,

      example: `你是一个示例生成助手。请基于以下提示词生成一个完整的示例输出。

要求：
1. 假设一个真实的场景
2. 展示预期的输出格式
3. 包含必要的细节
4. 清晰易懂

请直接返回示例输出。`
    };

    return prompts[type] || prompts.extend;
  }

  // 批量AI操作
  async batchOptimize(texts, type = 'polish') {
    const results = [];
    
    for (let i = 0; i < texts.length; i++) {
      const result = await this.optimizeText(texts[i], type);
      results.push({ original: texts[i], optimized: result, success: true });
      
      // 添加延迟避免触发限流
      if (i < texts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  // 批量翻译
  async batchTranslate(texts, targetLang = 'en') {
    const results = [];
    
    for (let i = 0; i < texts.length; i++) {
      const result = await this.translateText(texts[i], targetLang);
      results.push({ original: texts[i], translated: result, success: true });
      
      // 添加延迟避免触发限流
      if (i < texts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  // 智能文本分析
  async analyzeText(text) {
    if (!this.aiService) {
      throw new Error('AI服务未初始化，请先在AI设置中配置API密钥并刷新页面');
    }
    
    const systemPrompt = `你是一个文本分析助手。请分析以下文本，并提供以下信息：

1. 摘要（一句话概括）
2. 关键词（5-10个）
3. 情感倾向（正面/负面/中性）
4. 主题分类
5. 建议改进方向

请直接返回分析结果，使用结构化格式。`;

    const result = await this.aiService.callLLMAPI(text, {
      systemPrompt
    });

    if (!result.success) {
      throw new Error(result.error || '文本分析失败');
    }

    await this.trackUsage(result.usage?.totalTokens || 0, result.cost || 0);

    return result.content;
  }

  // 智能摘要生成
  async generateSummary(text, maxLength = 200) {
    if (!this.aiService) {
      throw new Error('AI服务未初始化，请先在AI设置中配置API密钥并刷新页面');
    }
    const systemPrompt = `你是一个摘要生成助手。请为以下文本生成简洁的摘要。

要求：
1. 摘要长度控制在${maxLength}字以内
2. 保留核心信息
3. 语言简洁明了
4. 逻辑清晰

请直接返回摘要。`;

    const result = await this.aiService.callLLMAPI(text, {
      systemPrompt
    });

    if (!result.success) {
      throw new Error(result.error || '摘要生成失败');
    }

    await this.trackUsage(result.usage?.totalTokens || 0, result.cost || 0);

    return result.content;
  }

  // 追踪使用统计
  async trackUsage(tokens, cost) {
    try {
      if (typeof aiConfigManager !== 'undefined' && aiConfigManager) {
        await aiConfigManager.updateUsageStats(tokens, cost);
      }
    } catch (error) {
      console.error('AI使用统计记录失败:', error);
    }
  }
}

// 创建全局实例
let aiOperationManagerInstance = null;

// 初始化函数
async function initAIOperationManager() {
  if (!aiOperationManagerInstance) {
    let service = aiServiceManager;
    if (!service && typeof getAIServiceManagerSync === 'function') {
      service = getAIServiceManagerSync();
    }
    
    if (!service && typeof getAIServiceManager === 'function') {
      service = await getAIServiceManager();
    }
    
    if (service) {
      aiOperationManagerInstance = new AIOperationManager(service);
      console.log('aiOperationManager 初始化成功');
    } else {
      console.error('aiServiceManager 未初始化，请确保 aiConfigManager 和 aiServiceManager 正确加载');
      aiOperationManagerInstance = new AIOperationManager(null);
    }
  }
}

// 获取实例的函数
async function getAIOperationManager() {
  if (!aiOperationManagerInstance) {
    await initAIOperationManager();
  }
  return aiOperationManagerInstance;
}

// 导出函数
window.getAIOperationManager = getAIOperationManager;
window.initAIOperationManager = initAIOperationManager;
