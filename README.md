# 笔记收藏与提示词管理器 - 技术文档

## 项目概述

这是一个 Chrome 浏览器扩展，提供网页内容收藏（笔记）和 AI 提示词管理功能。支持通过右键菜单快速收藏网页内容，管理笔记和提示词，并在输入框中快速插入提示词。集成 AI 智能编辑功能，支持文本优化、翻译、生成等操作。

**当前版本**: 3.0.8

## 功能模块

### 1. 笔记收藏系统
- **收藏文章**: 提取页面正文内容
- **收藏选中文本**: 保留 HTML 格式的文本片段
- **收藏链接**: 保存链接地址和文本
- **收藏图片**: 保存图片 URL
- **图片相册**: 以相册形式查看所有收藏的图片
- **右键快捷操作**:
  - 快速添加为笔记（带页面内通知反馈）
  - 添加为提示词（带页面内通知反馈）

### 2. 提示词管理系统
- 创建、编辑、删除提示词
- 分类和标签管理
- 快速复制提示词内容
- 在网页输入框中快速插入提示词
- 笔记/提示词查看界面支持点击分类快速切换
- Markdown 编辑器支持（EasyMDE）

### 3. AI 智能编辑
- **文本优化**: 润色、简化、扩写、续写
- **翻译功能**: 支持多语言互译
- **内容生成**: 基于提示生成内容
- **AI 对话**: 智能助手交互
- **多服务商支持**: OpenAI、智谱 AI、自定义 API
- **使用统计**: Token 消耗和成本追踪

### 4. 数据同步
- **WebDAV 同步**: 支持坚果云等 WebDAV 服务
- **增量同步**: 只传输变更数据，节省流量
- **冲突解决**: 智能合并策略，基于时间戳
- **离线支持**: 本地优先，网络恢复后自动同步
- **多设备同步**: 支持跨设备数据同步

### 5. 设置与配置
- 输入框检测模式（所有网站/白名单/黑名单）
- 分类管理（支持删除分类）
- 数据导入导出（JSON 格式）
- 侧边栏位置切换
- 视图模式切换（列表/网格）
- AI 服务配置管理

## 文件结构

```
├── manifest.json              # 扩展配置文件
├── background.js              # 后台服务脚本
├── content.js                 # 内容脚本（页面注入）
├── content.css                # 内容脚本样式
├── dataManager.js             # 数据管理器
├── webdavConfig.js            # WebDAV 配置管理器
├── webdavClient.js            # WebDAV 客户端
├── syncManager.js             # 同步管理器（旧版）
├── incrementalSyncManager.js  # 增量同步管理器
├── aiConfigManager.js         # AI 配置管理器
├── aiServiceManager.js        # AI 服务管理器
├── aiOperationManager.js      # AI 操作管理器
├── notes.html                 # 管理页面
├── notes.js                   # 管理页面逻辑
├── notes.css                  # 管理页面样式
├── clip.html                  # 收藏编辑页面
├── clip.js                    # 收藏编辑逻辑
├── clip.css                   # 收藏编辑样式
├── quick-note.html            # 快速笔记页面
├── quick-note.js              # 快速笔记逻辑
├── quick-note.css             # 快速笔记样式
├── edit.html                  # 提示词编辑页面
├── edit.js                    # 提示词编辑逻辑
├── edit.css                   # 提示词编辑样式
├── popup.html                 # 弹出窗口
├── popup.js                   # 弹出窗口逻辑
├── popup.css                  # 弹出窗口样式
├── ai-settings.html           # AI 设置页面
├── ai-settings.js             # AI 设置逻辑
├── ai-settings.css            # AI 设置样式
└── icons/                     # 图标文件夹
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 核心组件详解

### 1. manifest.json

扩展的入口配置文件，定义了：
- 扩展基本信息（名称、版本、描述）
- 权限声明（storage, activeTab, scripting, contextMenus 等）
- 后台脚本（service worker）
- 内容脚本（content script）注入规则
- Web 可访问资源

**关键配置项**:
```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",           // 本地存储
    "activeTab",         // 当前标签页
    "scripting",         // 脚本注入
    "contextMenus",      // 右键菜单
    "notifications",     // 通知
    "alarms",            // 定时任务
    "downloads",         // 下载
    "clipboardWrite"     // 剪贴板写入
  ],
  "host_permissions": [
    "<all_urls>"         // 所有网站权限
  ]
}
```

### 2. background.js

后台服务脚本，负责：
- 初始化扩展
- 创建和管理右键菜单
- 处理收藏请求
- 打开编辑窗口
- 处理来自内容脚本的消息
- WebDAV 同步调度

**核心功能**:
- 右键菜单管理
- 页面内容提取
- 同步日志记录
- 增量同步支持

### 3. content.js

内容脚本，注入到网页中，负责：
- 检测页面输入框
- 显示提示词选择器
- 提取页面信息（标题、正文、图片等）
- 获取选中的 HTML 内容

**核心类**: `ContentScript`

**主要方法**:
- `init()`: 初始化
- `detectInputFields()`: 检测输入框
- `showPromptSelector(input)`: 显示提示词选择器
- `getPageInfo()`: 获取页面信息
- `extractArticleContent()`: 提取文章正文
- `getSelectedHtml(selection)`: 获取选中的 HTML

### 4. dataManager.js

数据管理器，统一管理所有数据：
- 笔记和提示词数据
- 设置配置
- 标签和分类
- 数据持久化（chrome.storage.local）
- 删除项目墓碑记录

**核心类**: `DataManager`

**数据存储结构**:
```javascript
{
  items: [],              // 所有项目（笔记和提示词）
  deletedItems: [],       // 已删除项目的墓碑记录
  deletedCategories: [],  // 已删除分类的墓碑记录
  settings: {             // 设置
    injectMode: 'all',    // 输入框检测模式
    whitelist: [],        // 白名单
    blacklist: [],        // 黑名单
    sidebarPosition: 'left',  // 侧边栏位置
    viewMode: 'list',     // 视图模式
    blockedInputs: {},    // 被屏蔽的输入框
    webdav: {             // WebDAV 配置
      enabled: false,
      serverUrl: '',
      username: '',
      password: '',
      syncPath: '/notebook-sync/',
      filename: 'notebook-data.json'
    }
  },
  tags: Set(),            // 所有标签
  categories: Set()       // 所有分类
}
```

**项目数据结构**:

笔记（note）:
```javascript
{
  id: string,           // 唯一标识
  type: 'note',         // 类型
  title: string,        // 标题
  content: string,      // 内容（支持 HTML）
  excerpt: string,      // 摘要
  url: string,          // 来源 URL
  favicon: string,      // 网站图标
  images: [],           // 图片数组
  category: string,     // 分类
  tags: [],             // 标签数组
  clipType: string,     // 收藏类型（article/text/link/image）
  remark: string,       // 备注
  source: string,       // 来源
  version: number,      // 数据版本
  checksum: string,     // 校验和
  createdAt: string,    // 创建时间
  updatedAt: string     // 更新时间
}
```

提示词（prompt）:
```javascript
{
  id: string,
  type: 'prompt',
  title: string,
  content: string,
  category: string,
  tags: [],
  version: number,
  checksum: string,
  createdAt: string,
  updatedAt: string
}
```

### 5. incrementalSyncManager.js

增量同步管理器，实现高效的增量同步：
- 设备 ID 管理
- 同步元数据管理
- 变更日志记录
- 冲突检测与解决
- 离线变更队列

**核心类**: `IncrementalSyncManager`

**主要功能**:
- `generateDeviceId()`: 生成唯一设备标识
- `recordChange()`: 记录数据变更
- `prepareSyncData()`: 准备同步数据
- `applyRemoteChanges()`: 应用远程变更
- `resolveConflicts()`: 解决冲突

### 6. aiConfigManager.js

AI 配置管理器，管理 AI 服务配置：
- 多服务商配置（OpenAI、智谱、自定义）
- API 密钥管理
- 模型选择
- 使用统计

**核心类**: `AIConfigManager`

**配置结构**:
```javascript
{
  enabled: false,
  provider: 'zhipu',      // 'openai' | 'zhipu' | 'custom'
  apiKey: '',
  apiEndpoint: '',
  model: 'glm-4',
  customModelName: '',
  customModels: [],
  settings: {
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000
  },
  usageStats: {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0
  }
}
```

### 7. aiServiceManager.js

AI 服务管理器，统一管理不同 AI 服务商的 API 调用：
- 多服务商支持
- 请求重试机制
- 速率限制
- 错误处理

**核心类**: `AIServiceManager`

**支持的服务商**:
- OpenAI (GPT 系列)
- 智谱 AI (GLM 系列)
- 自定义 API 端点

### 8. aiOperationManager.js

AI 操作管理器，实现具体的 AI 功能：
- 文本优化（润色、简化、扩写、续写）
- 翻译功能
- 内容生成
- AI 对话

**核心类**: `AIOperationManager`

### 9. notes.js

管理页面逻辑，负责：
- 显示笔记/提示词/图片相册列表
- 分类和标签筛选
- 搜索和排序
- 编辑和删除操作
- 设置管理

**核心类**: `NotesManager`

### 10. edit.js

提示词编辑页面逻辑，负责：
- Markdown 编辑器初始化（EasyMDE）
- AI 工具栏集成
- 提示词编辑和保存

### 11. clip.js

收藏编辑页面逻辑，负责：
- 获取页面信息
- 编辑收藏内容
- 选择图片
- 添加标签和分类
- 保存收藏

## 数据流

### 收藏流程
1. 用户在网页上右键选择收藏类型
2. `background.js` 接收菜单点击事件
3. 根据类型获取相应数据（页面信息、选中文本、链接、图片）
4. 打开 `clip.html` 编辑窗口
5. 用户编辑内容、添加标签和分类
6. 保存到 `dataManager`
7. 数据持久化到 `chrome.storage.local`
8. 记录变更日志用于增量同步

### 提示词插入流程
1. `content.js` 检测页面输入框
2. 点击输入框旁的提示词按钮
3. 显示提示词选择器
4. 用户选择提示词
5. 插入内容到输入框

### 数据同步流程
1. 数据变更时调用 `dataManager.saveData()`
2. `incrementalSyncManager.recordChange()` 记录变更
3. 保存到 `chrome.storage.local`
4. 触发同步（定时或手动）
5. `incrementalSyncManager.prepareSyncData()` 准备变更数据
6. 通过 WebDAV 上传到服务器
7. 下载远程变更并合并

### AI 编辑流程
1. 用户在编辑器中选择文本
2. 点击 AI 工具栏按钮
3. `aiOperationManager` 调用相应方法
4. `aiServiceManager` 发起 API 请求
5. 返回结果并更新编辑器内容
6. `aiConfigManager` 更新使用统计

## 关键技术点

### 1. Chrome Extension Manifest V3
- 使用 Service Worker 替代 Background Page
- 使用 `chrome.scripting.executeScript` 注入脚本
- 使用 `chrome.storage.local` 存储数据
- 使用 `chrome.alarms` 实现定时同步

### 2. 增量同步机制
```javascript
// 变更记录结构
{
  id: string,           // 变更 ID
  timestamp: number,    // 变更时间
  deviceId: string,     // 设备标识
  action: 'create' | 'update' | 'delete',
  itemType: 'note' | 'prompt',
  itemId: string,
  checksum: string      // 数据校验和
}
```

### 3. 墓碑机制
- 删除的项目保留墓碑记录
- 墓碑包含删除时间和原项目 ID
- 用于多设备同步时传播删除操作
- 定期清理过期墓碑（默认 30 天）

### 4. 内容脚本通信
```javascript
// 发送消息
chrome.runtime.sendMessage({ action: 'getPageInfo' }, callback);

// 接收消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理消息
});
```

### 5. HTML 内容提取
使用 `Range` 和 `Selection` API 获取选中的 HTML：
```javascript
const selection = window.getSelection();
const range = selection.getRangeAt(0);
const clonedSelection = range.cloneContents();
const div = document.createElement('div');
div.appendChild(clonedSelection);
const html = div.innerHTML;
```

### 6. Markdown 编辑器集成
使用 EasyMDE 提供 Markdown 编辑功能：
- 实时预览
- 分屏编辑
- 工具栏自定义
- AI 工具栏扩展

## 扩展和修改指南

### 添加新的 AI 服务商

1. 在 `aiConfigManager.js` 的 `getDefaultConfig()` 中添加新服务商配置
2. 在 `aiServiceManager.js` 的 `makeAPIRequest()` 中添加服务商请求逻辑
3. 在 `ai-settings.js` 中添加 UI 选项

### 添加新的收藏类型

1. 在 `background.js` 的右键菜单配置中添加菜单项
2. 在 `clip.js` 中添加类型处理逻辑
3. 在 `clip.html` 中添加相应的 UI 元素

### 修改存储结构

1. 更新 `dataManager.js` 中的数据结构
2. 在 `loadData()` 中添加迁移逻辑
3. 更新 `dataVersion` 标识版本变更
4. 更新所有使用到该数据的地方

### 添加新的 AI 操作

1. 在 `aiOperationManager.js` 中添加新方法
2. 实现对应的提示词模板
3. 在编辑器工具栏中添加按钮

## 调试技巧

### 查看后台脚本日志
1. 打开 `chrome://extensions/`
2. 找到扩展，点击"Service Worker"
3. 在 DevTools 中查看 Console

### 查看同步日志
```javascript
// 在后台脚本 Console 中执行
syncLogger.export().then(logs => console.log(logs));
```

### 查看存储数据
```javascript
// 在 DevTools Console 中执行
chrome.storage.local.get(null, data => console.log(data));
```

### 查看增量同步状态
```javascript
// 检查同步元数据
chrome.storage.local.get(['syncMeta', 'syncLog', 'pendingChanges'], data => {
  console.log('同步元数据:', data.syncMeta);
  console.log('同步日志:', data.syncLog);
  console.log('待处理变更:', data.pendingChanges);
});
```

## 注意事项

1. **权限最小化**: 只申请必要的权限
2. **数据安全**: 敏感配置（如 API 密钥）存储在 `chrome.storage.local`
3. **性能优化**: 增量同步减少数据传输量
4. **错误处理**: 添加 try-catch 和空值检查
5. **用户体验**: 添加加载状态和操作反馈
6. **离线支持**: 本地优先，网络恢复后自动同步

## 版本历史

### v3.0.8
- AI 智能编辑功能完善
- 增量同步机制优化
- 多设备同步支持

### v3.0.0
- 新增 AI 智能编辑功能
- 支持多 AI 服务商
- 增量同步机制

### v2.0.0
- WebDAV 同步功能
- 独立 WebDAV 配置管理

### v1.3.0
- EasyMDE Markdown 编辑器集成

## 待优化项

### 高优先级
1. **全文搜索** - 支持笔记内容和提示词的全文检索
2. **图片懒加载** - 优化图片相册性能
3. **批量操作** - 支持批量删除、移动分类、添加标签

### 中优先级
4. **数据加密** - 对敏感配置进行加密存储
5. **键盘快捷键** - 添加常用操作的快捷键支持
6. **导入导出优化** - 支持选择性导入/导出

### 低优先级
7. **主题切换** - 支持深色/浅色主题
8. **移动端适配** - 优化手机端使用体验
9. **数据压缩** - 对存储数据进行压缩

### 已实现
- ~~支持 Markdown 编辑~~ v1.3.0
- ~~数据同步（WebDAV）~~ v2.0.0
- ~~AI 智能编辑~~ v3.0.0
- ~~增量同步~~ v3.0.0
