#!/usr/bin/env node
/**
 * 小红书 Cookie 提取脚本
 * 通过 Chrome DevTools Protocol 获取登录后的 Cookie
 */

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(process.env.HOME, '.openclaw/workspace/.secrets/redbook-cookie.txt');

async function extractCookie() {
    let client;
    try {
        // 连接 Chrome
        client = await CDP({ port: 9222 });
        const { Network } = client;

        // 获取所有 Cookie
        const { cookies } = await Network.getAllCookies();
        
        // 筛选小红书的 Cookie
        const redbookCookies = cookies.filter(cookie => 
            cookie.domain.includes('xiaohongshu.com')
        );

        if (redbookCookies.length === 0) {
            console.log('❌ 未找到小红书的 Cookie，请确保已登录');
            process.exit(1);
        }

        // 格式化 Cookie
        const cookieString = redbookCookies
            .map(c => `${c.name}=${c.value}`)
            .join('; ');

        // 确保目录存在
        const dir = path.dirname(COOKIE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 保存 Cookie
        fs.writeFileSync(COOKIE_FILE, cookieString, 'utf8');
        fs.chmodSync(COOKIE_FILE, 0o600);

        console.log('✅ Cookie 提取成功！');
        console.log(`📁 已保存到: ${COOKIE_FILE}`);
        console.log('');
        console.log('🍠 Cookie 内容:');
        console.log(cookieString.substring(0, 100) + '...');

        return cookieString;
    } catch (err) {
        console.error('❌ 错误:', err.message);
        console.log('');
        console.log('💡 请确保:');
        console.log('   1. Chrome 已启动并开启了调试端口 (9222)');
        console.log('   2. 已在小红书网页登录');
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
        }
    }
}

extractCookie();
