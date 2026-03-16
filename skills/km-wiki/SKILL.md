---
name: km-wiki
description: 美团学城(KM)知识库的浏览器自动化操作工具。通过 Chrome DevTools Protocol 访问学城页面、读取文档内容、提取表格数据、截图页面、编辑文档。Use when 用户提到学城、KM、知识库、km.sankuai.com、collabpage，或需要访问、阅读、编辑任何 km.sankuai.com 的页面或链接时使用.
---

# 学城(KM) 操作指南

## 快速开始

使用辅助脚本（路径相对于 skill 目录）:

```bash
# 检查浏览器状态
python3 scripts/km_browser.py check

# 导航到学城页面
python3 scripts/km_browser.py navigate https://km.sankuai.com/collabpage/PAGE_ID

# 获取页面文本内容
python3 scripts/km_browser.py content

# 获取所有表格数据(JSON格式)
python3 scripts/km_browser.py tables

# 截图保存
python3 scripts/km_browser.py screenshot /tmp/km_page.png
```

## SSO 认证处理

**访问学城遇到登录问题时**，需要用户提供 misId 执行认证脚本:

```bash
bash scripts/inject-km-cookie.sh <用户misId>
```

⚠️ **重要**：misId 不是固定值，必须询问用户获取其个人 misId。

此脚本会:

1. 发起CIBA认证请求
2. 轮询等待用户在大象确认授权(最多3分钟)
3. 将 cookie 注入到浏览器 (scripts/inject-cookie.py)

**认证失败迹象**:

- 页面标题包含 "Login" 或 "SSO"
- URL 跳转到 `ssosv.sankuai.com`
- `python3 scripts/km_browser.py check` 显示 `sso_detected: true`

## 编辑文档

1. 进入编辑模式：点击页面上的"编辑"按钮 (`.doc-mode-switch-item.edit`)
2. 定位光标到末尾，使用 `Input.insertText` CDP 方法插入内容
3. 学城会自动保存编辑内容

## 内置脚本

| 脚本                                  | 用途                 |
| ------------------------------------- | -------------------- |
| `scripts/inject-km-cookie.sh <misId>` | SSO 认证主脚本       |
| `scripts/inject-cookie.py`            | 注入 cookie 到浏览器 |
| `scripts/km_browser.py`               | 浏览器操作辅助脚本   |
| `read-env.sh`                         | 读取环境变量容器标识 |

## URL 格式

- 文档页面: `https://km.sankuai.com/collabpage/{page_id}`
- 知识库节点: `https://km.sankuai.com/page/{page_id}`

## 页面结构

学城使用富文本编辑器，关键选择器:

| 元素       | CSS 选择器                   |
| ---------- | ---------------------------- |
| 内容区域   | `.ct-editor-content`         |
| 编辑器容器 | `.ct-editor-wrapper`         |
| 编辑按钮   | `.doc-mode-switch-item.edit` |
| 可编辑元素 | `[contenteditable="true"]`   |
| 表格       | `table`                      |
| 标题       | `h1, h2, h3`                 |

## 常见问题

**Cookie 过期**: 询问用户 misId，重新执行 `scripts/inject-km-cookie.sh <misId>`

**页面加载不完整**: 导航后等待 5 秒再获取内容

**浏览器未启动**: 检查 `curl -s http://127.0.0.1:9222/json/version`
