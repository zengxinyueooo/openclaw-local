- OPX AccessToken 获取工具

  自动获取 OPX AI (https://opx-ai.sankuai.com/opx-ai-manage/#/content-marketing/auto-publish) 的 **Cookie** 和 **accessToken**。

  ## 原理

  1. 通过 OpenClaw Browser Relay (`profile: "chrome"`) 连接你本地已登录的 Chrome 浏览器
  2. 打开 `https://opx-ai.sankuai.com/opx-ai-manage/#/content-marketing/auto-publish`
  3. 执行 JavaScript 调用 `/sso/web/auth` 接口
  4. 提取 **document.cookie** 和响应中的 **accessToken**

  ## 前置条件

  - Chrome 浏览器已安装 OpenClaw Browser Relay 扩展
  - 扩展已连接（toolbar 图标显示 ON）
  - 已在浏览器中登录 OPX AI

  ## 使用方法

  ### 方式一：OpenClaw 自动执行（推荐）

  直接告诉 OpenClaw：

  > "获取 OPX access token"

  **⚠️ 重要：必须使用 `profile: "chrome"`**

  OpenClaw 会自动执行：

  ```javascript
  // 1. 打开 OPX 页面（必须指定 profile: "chrome"）
  await browser.open('https://opx-ai.sankuai.com/opx-ai-manage/#/content-marketing/auto-publish', { profile: 'chrome' });
  
  // 2. 执行 JS 获取 Cookie 和 Token（必须指定 profile: "chrome"）
  await browser.act({
    profile: 'chrome',  // ⚠️ 必须显式指定，不能依赖默认值
    kind: 'evaluate',
    fn: `() => {
      return new Promise(async (resolve) => {
        try {
          const res = await fetch('https://opx-ai.sankuai.com/sso/web/auth?clientId=055da5ec53&accessEnv=product&ssoprotect=1', {
            credentials: 'include'
          });
          const data = await res.json();
          resolve({
            cookie: document.cookie,
            accessToken: data.data?.accessToken,
            response: data
          });
        } catch (e) {
          resolve({ error: e.message, cookie: document.cookie });
        }
      });
    }`
  });
  ```

  **为什么必须指定 `profile: "chrome"`？**

  - `profile: "chrome"` → 连接你本地 Chrome 的 Browser Relay 扩展（端口 18792）
  - `profile: "openclaw"`（默认）→ OpenClaw 自己启动 Chrome（端口 18800）
  - 使用 Browser Relay 扩展时，**必须**用 `profile: "chrome"`，否则连接失败

  ### 方式二：浏览器 Console 手动执行（最可靠备用方案）

  当 OpenClaw 自动化获取失败时，直接在浏览器里执行：

  1. 在 Chrome 中打开 `https://opx-ai.sankuai.com/opx-ai-manage/#/content-marketing/auto-publish`
  2. 按 **F12** 打开开发者工具 → 切换到 **Console** 标签
  3. 粘贴并执行以下代码：

  ```javascript
  fetch('https://opx-ai.sankuai.com/sso/web/auth?clientId=055da5ec53&accessEnv=product&ssoprotect=1', {
    credentials: 'include'
  }).then(r => r.json()).then(data => {
    console.log('=== Cookie ===');
    console.log(document.cookie);
    console.log('=== AccessToken ===');
    console.log(data.data?.accessToken);
    console.log('=== Full Response ===');
    console.log(JSON.stringify(data, null, 2));
  });
  ```

  4. 复制输出的 Cookie 和 AccessToken

  **优点：**

  - 不依赖扩展连接稳定性
  - 100% 成功率（只要你已登录）
  - 可以直接拿到 Cookie 和 Token

  ### 方式三：命令行脚本

  如需在命令行运行（需要 Chrome 开启调试端口）：

  ```bash
  # 1. 重启 Chrome 开启调试端口
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
  
  # 2. 在 Chrome 中打开 OPX 并登录
  
  # 3. 运行脚本
  cd ~/.openclaw/workspace/skills/opx-auth
  node get-token.js
  ```

  **注意：** 此脚本需要 Chrome 已启用调试模式（`--remote-debugging-port=9222`）

  ## 预期输出

  ```json
  {
    "cookie": "AWPTALOS23222=; _lxsdk_cuid=...; cube_session=...",
    "accessToken": "eAGFzrtKA0EYhmGmW7QRr...",
    "response": {
      "code": 200,
      "data": {
        "accessToken": "..."
      },
      "msg": "success"
    }
  }
  ```

  ## 文件说明

  - `get-token.js` - Node.js 脚本，通过 CDP 连接 Chrome 获取 Token（备用方案）

  ## 注意事项

  - `/sso/web/auth` 接口需要带 `clientId` 参数，如：`clientId=055da5ec53&accessEnv=product&ssoprotect=1`
  - 请求需要 `credentials: 'include'` 来携带当前页面的 Cookie

  ## 故障排除

  ### 错误：Failed to start Chrome CDP on port 18800

  **症状：**

  ```
  Error: Failed to start Chrome CDP on port 18800 for profile "openclaw".
  Chrome stderr: ... Permission denied ... Address already in use ...
  ```

  **原因：**

  - 使用了默认的 `profile: "openclaw"`（端口 18800）
  - OpenClaw 尝试自己启动 Chrome，但权限/端口冲突导致失败

  **解决：**
  确保所有 `browser` 调用都显式指定 `profile: "chrome"`：

  ```javascript
  // ❌ 错误 - 使用默认 profile
  await browser.open('https://opx-ai.sankuai.com/...');
  await browser.act({ kind: 'evaluate', fn: ... });
  
  // ✅ 正确 - 显式指定 profile: "chrome"
  await browser.open('https://opx-ai.sankuai.com/...', { profile: 'chrome' });
  await browser.act({ profile: 'chrome', kind: 'evaluate', fn: ... });
  ```

  ### 浏览器操作超时

  如果 `browser` 工具调用超时失败：

  1. **先重试** - 等待几秒后重新执行相同的操作
  2. **不要 panic** - 网络/服务偶尔波动很正常，简单重试通常能解决问题
  3. **多次失败后再换方案** - 连续 2-3 次失败才考虑使用备用脚本或其他方法

  **错误示范：** 一次超时后立刻换方案（脚本方式、手动执行等），绕了一大圈后发现原方法重试就能成功。

  **正确示范：** 超时 → 重试 → 成功（90% 的情况）
