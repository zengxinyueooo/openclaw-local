#!/usr/bin/env node
/**
 * DaXiang SSO 默认账户令牌生成脚本
 * 用法: node scripts/generate-sso-default.mjs
 */

import {getSSOAccessToken, getSSOUserInfo} from '../dist/src/sso-client.js';

async function main() {
  const config = {
    enabled: true,
    clientId: 'a034c9d845',
    accessEnv: 'product',
    localPortList: [9152, 10152, 11152, 12152],
  };

  console.log('⚠️  浏览器即将打开...\n');

  const token = await getSSOAccessToken('default', config);
  console.log('✅ Token 获取成功\n');

  const userInfo = await getSSOUserInfo('default', config);
  console.log(`✅ 用户: ${userInfo.name} (${userInfo.subject})\n`);
  console.log('Token 已保存到: ~/.openclaw/daxiang/sso-token-default.json');

  // 保持进程运行，作为长期服务
  console.log('\n🔄 SSO 令牌服务运行中... (按 Ctrl+C 停止)\n');
  // 可选：设置定时器保持进程活跃
  // setInterval(() => {}, 1000);
}

main().catch(console.error);

