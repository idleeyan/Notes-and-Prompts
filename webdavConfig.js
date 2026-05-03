// WebDAV 配置管理器 - 独立存储 WebDAV 配置，确保配置不会丢失
class WebDAVConfigManager {
  constructor() {
    this.configKey = 'webdavConfig';
    this.defaultConfig = {
      enabled: false,
      serverUrl: '',
      username: '',
      password: '',
      syncPath: '/notebook-sync/',
      filename: 'notebook-data.json'
    };
  }

  // 获取 WebDAV 配置
  async getConfig() {
    try {
      const result = await chrome.storage.local.get([this.configKey]);
      // 深度合并，确保所有字段都存在
      return this.deepMerge(this.defaultConfig, result[this.configKey] || {});
    } catch (error) {
      console.error('WebDAVConfigManager: 获取配置失败', error);
      return { ...this.defaultConfig };
    }
  }

  // 保存 WebDAV 配置
  async saveConfig(config) {
    try {
      // 直接保存传入的配置，使用 deepMerge 确保嵌套对象正确合并
      const mergedConfig = this.deepMerge(this.defaultConfig, config);

      await chrome.storage.local.set({ [this.configKey]: mergedConfig });
      console.log('WebDAVConfigManager: 配置已保存', mergedConfig);
      return { success: true, config: mergedConfig };
    } catch (error) {
      console.error('WebDAVConfigManager: 保存配置失败', error);
      return { success: false, error: error.message };
    }
  }

  // 更新部分配置
  async updateConfig(updates) {
    try {
      const currentConfig = await this.getConfig();
      const newConfig = this.deepMerge(currentConfig, updates);
      return await this.saveConfig(newConfig);
    } catch (error) {
      console.error('WebDAVConfigManager: 更新配置失败', error);
      return { success: false, error: error.message };
    }
  }

  // 清除配置（重置为默认值）
  async clearConfig() {
    try {
      await chrome.storage.local.remove([this.configKey]);
      console.log('WebDAVConfigManager: 配置已清除');
      return { success: true };
    } catch (error) {
      console.error('WebDAVConfigManager: 清除配置失败', error);
      return { success: false, error: error.message };
    }
  }

  // 深度合并对象
  deepMerge(target, source) {
    return Utils.deepMerge(target, source);
  }
}

// 创建全局实例
const webdavConfigManager = new WebDAVConfigManager();
