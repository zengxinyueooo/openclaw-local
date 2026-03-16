import type { OpenClawPluginApi } from 'openclaw/plugin-sdk'
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk'

import { elephantPlugin } from './src/channel.ts'
import { startElephantSsoLogin } from './src/meituan-sso.ts'
import { setElephantRuntime } from './src/runtime.ts'

const plugin = {
  id: 'openclaw-elephant-plugin',
  name: '大象通信',
  description: '大象通信 WebSocket channel plugin (minimal example)',
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setElephantRuntime(api.runtime)
    api.registerChannel({ plugin: elephantPlugin })

    // 在 gateway 启动时触发 SSO 登录（不阻塞启动）。clientId 从 KMS 拉取，无需 secret；登录为浏览器/CLI 流程。
    const profile =
      api.pluginConfig?.env === 'prod' || api.pluginConfig?.env === 'test'
        ? (api.pluginConfig.env as 'test' | 'prod')
        : 'prod'
    api.registerService({
      id: 'elephant-sso',
      start: ({ logger }) => {
        startElephantSsoLogin({
          profile,
          logger,
        })
      },
    })
  },
}

export default plugin
