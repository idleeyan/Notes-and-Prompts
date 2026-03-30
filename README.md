# 笔记收藏与提示词管理器

**版本**: 3.13.2
**Manifest Version**: 3
**类型**: Chrome 扩展 (Chromium 系浏览器可用)

---

## 功能概述

全面的笔记收藏与提示词管理系统，支持：

- **网页内容收藏** - 一键收藏网页、选中文本、链接、图片
- **提示词管理** - 分类管理 AI 提示词，支持快捷填充
- **标签系统** - 灵活的内容标签管理
- **统一搜索** - 跨笔记和提示词的全文搜索
- **WebDAV 同步** - 支持将数据同步到私有云存储
- **多视图切换** - 列表视图和网格视图

---

## 项目结构

```
├── manifest.json          # 扩展配置
├── background.js          # 后台服务 (Service Worker)
├── content.js             # 内容脚本 (注入到网页)
├── dataManager.js         # 数据管理核心模块
│
├── popup.html/js/css      # 扩展弹窗 (主入口)
├── quick-note.html/js/css # 快速笔记弹窗
├── clip.html/js/css       # 网页收藏窗口
├── note-edit.html/js/css  # 笔记编辑窗口
├── prompt-edit.html/js/css # 提示词编辑窗口
│
├── notes/                 # 笔记管理模块
│   ├── notesCore.js       # 核心管理器
│   ├── notesUI.js         # UI 渲染
│   ├── notesEditor.js     # 笔记编辑器
│   ├── notesPromptEditor.js # 提示词编辑器
│   ├── notesWebDAV.js     # WebDAV 同步界面
│   └── notesSettings.js    # 设置管理
│
├── utils.js               # 工具函数
├── tagEditor.js           # 标签编辑器
├── enhancedEditor.js      # Markdown 编辑器 (EasyMDE 封装)
├── webdavClient.js        # WebDAV 客户端
├── webdavConfig.js        # WebDAV 配置管理
│
└── lib/                   # 第三方库
    ├── easymde.min.js     # Markdown 编辑器
    ├── marked.min.js      # Markdown 解析器
    └── easymde.min.css    # 编辑器样式
```

---

## 核心模块

### 1. 数据管理 (dataManager.js)

负责所有数据的存储、读取和管理。

**主要功能**:
- `loadData()` / `saveData()` - 数据持久化
- `addNote()` / `updateNote()` / `deleteNote()` - 笔记 CRUD
- `addPrompt()` / `updatePrompt()` / `deletePrompt()` - 提示词 CRUD
- `updateTags()` - 标签管理
- `searchItems()` - 全文搜索
- `getItem()` - 获取单个项目

**数据存储** (chrome.storage.local):
```javascript
{
  items: [],           // 所有笔记和提示词
  deletedItems: [],     // 删除墓碑 (防同步冲突)
  tags: [],             // 标签集合
  settings: {}          // 用户设置
}
```

### 2. 后台服务 (background.js)

Service Worker，处理扩展的后台任务。

**主要功能**:
- 上下文菜单管理 (右键菜单)
- WebDAV 同步调度
- 存储变更监听
- 消息路由

**核心类**:
- `BackgroundService` - 主服务类
- `syncLogger` - 同步日志收集器

**消息类型**:
- `getItems` / `saveItems` - 数据操作
- `openEditWindow` - 打开编辑窗口
- `webdav` - WebDAV 请求代理

### 3. 内容脚本 (content.js)

注入到所有网页的内容脚本。

**主要功能**:
- 检测页面输入框
- 显示提示词选择器
- 快捷键触发 (Ctrl+Shift+P)
- 页面内容提取
- AI 对话边栏

### 4. WebDAV 同步

**相关文件**:
- `webdavClient.js` - WebDAV 协议实现
- `webdavConfig.js` - 配置管理
- `notes/notesWebDAV.js` - 同步界面

**同步流程**:
1. 用户触发同步 (手动或定时)
2. `BackgroundService.incrementalSync()` 下载远程数据
3. `incrementalMerge()` 合并本地和远程数据
4. `directUpload()` 上传合并结果

---

## 文件大小

| 文件 | 行数 | 说明 |
|------|------|------|
| enhancedEditor.js | 1252 | Markdown 编辑器封装 |
| background.js | 1205 | 后台服务 |
| content.js | 969 | 内容脚本 |
| webdavClient.js | 729 | WebDAV 客户端 |
| clip.js | 585 | 网页收藏逻辑 |
| dataManager.js | 563 | 数据管理 |
| notes.css | 1130 | 笔记页面样式 |
| notesCore.js | 399 | 核心管理器 |

---

## 权限说明

```json
{
  "permissions": [
    "storage",        // 本地存储
    "activeTab",      // 访问当前标签
    "scripting",      // 注入脚本
    "downloads",      // 下载功能
    "windows",       // 窗口管理
    "tabs",          // 标签管理
    "contextMenus",  // 右键菜单
    "clipboardWrite", // 剪贴板写入
    "notifications",  // 系统通知
    "alarms"         // 定时任务
  ],
  "host_permissions": ["<all_urls>"]
}
```

---

## 已知限制

1. **Service Worker 限制** - Chrome 扩展的 Service Worker 会在空闲时被终止，某些定时同步功能可能受影响
2. **存储限额** - chrome.storage.local 限制为约 10MB，建议定期清理删除墓碑
3. **跨域限制** - WebDAV 请求依赖目标服务器支持 CORS 或正确的 WebDAV 协议

---

## 版本历史

| 版本 | 更新内容 |
|------|----------|
| 3.13.2 | 清理冗余代码，移除未使用的 visualEditor |
| 3.13.1 | 移除 incrementalSyncManager 和 syncManager |
| 3.13.0 | 移除分类功能，保留标签系统 |
| 3.12.0 | 完整重构同步机制 |

---

## 开发说明

### 本地调试

1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目文件夹
5. 修改代码后点击扩展详情页的刷新按钮

### 数据导出

可通过 WebDAV 界面导出完整数据备份。

### 添加新功能

1. 在对应模块添加功能代码
2. 更新 manifest.json 的 web_accessible_resources (如需)
3. 更新本文档

---

*最后更新: 2026-03-30*
