---
name: redbook-login
description: 自动登录小红书，通过 Chrome 浏览器扫码登录并提取 Cookie
---

# 小红书扫码登录 Skill 🍠✨

自动打开 Chrome 浏览器，显示小红书登录二维码，用户扫码后自动提取登录 Cookie。

## 触发方式

- "登录小红书"
- "小红书扫码登录"
- "获取小红书 Cookie"

## 使用流程

```
1. 调用 skill → 打开 Chrome 显示小红书登录页
2. 显示二维码 → 提示用户用手机小红书 App 扫码
3. 用户扫码登录 → 等待登录完成
4. 自动提取 Cookie → 保存到文件
5. 返回登录结果 → 显示 Cookie 信息
```

## 前置条件

- Chrome 浏览器已安装
- 小红书 App 已安装且已登录
- 网络畅通

## 实现步骤

### Step 1: 打开小红书登录页

使用 browser 工具打开小红书网页版登录页：

```javascript
await browser.open('https://www.xiaohongshu.com/sign_in', {
  profile: 'chrome',
  width: 1280,
  height: 800
});
```

### Step 2: 等待二维码加载

等待页面加载完成，二维码显示：

```javascript
await browser.act({
  profile: 'chrome',
  kind: 'wait',
  timeMs: 3000
});
```

### Step 3: 提示用户扫码

显示消息提示用户扫码：

> "请用手机小红书 App 扫描页面上的二维码登录～"

### Step 4: 检测登录状态

轮询检测登录状态，等待用户扫码完成：

```javascript
// 检查是否有登录成功的标记（如用户头像、用户名等）
const isLoggedIn = await browser.act({
  profile: 'chrome',
  kind: 'evaluate',
  fn: `() => {
    // 检查登录状态：是否有用户头像或特定元素
    const avatar = document.querySelector('.user-avatar, .avatar, [class*="avatar"]');
    const userName = document.querySelector('.user-name, .nickname, [class*="user"]');
    return !!(avatar || userName || document.cookie.includes('web_session'));
  }`
});
```

### Step 5: 提取 Cookie

登录成功后提取 Cookie：

```javascript
const cookies = await browser.act({
  profile: 'chrome',
  kind: 'evaluate',
  fn: `() => {
    return document.cookie;
  }`
});
```

### Step 6: 保存 Cookie

将 Cookie 保存到文件：

```bash
# 保存到 ~/.openclaw/workspace/.secrets/redbook-cookie.txt
mkdir -p ~/.openclaw/workspace/.secrets
echo "${COOKIE}" > ~/.openclaw/workspace/.secrets/redbook-cookie.txt
chmod 600 ~/.openclaw/workspace/.secrets/redbook-cookie.txt
```

## 输出格式

```json
{
  "status": "success",
  "message": "小红书登录成功",
  "cookie": "web_session=xxx; webId=xxx; ...",
  "saved_to": "~/.openclaw/workspace/.secrets/redbook-cookie.txt",
  "timestamp": "2026-03-11T15:30:00+08:00"
}
```

## 注意事项

- **二维码有效期**：小红书二维码通常有效期为几分钟，超时需刷新
- **Cookie 有效期**：登录后的 Cookie 有一定有效期，过期需重新登录
- **隐私安全**：Cookie 文件保存在 `.secrets/` 目录，权限设置为 600

## 故障排除

### 二维码无法显示
- 检查网络连接
- 刷新页面重试

### 扫码后无反应
- 确保手机小红书 App 已登录
- 检查手机网络连接
- 尝试重新扫码

### Cookie 提取失败
- 确保已登录成功（页面显示用户信息）
- 检查浏览器控制台是否有报错

## 相关文件

- `scripts/login.sh` - 登录脚本
- `scripts/extract-cookie.js` - Cookie 提取脚本
