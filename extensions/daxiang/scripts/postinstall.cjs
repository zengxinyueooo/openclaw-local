#!/usr/bin/env node
/**
 * DaXiang 插件安装后脚本
 * 自动在 OpenClaw 配置文件中添加渠道配置
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_CHANNEL_CONFIG = {
  enabled: true,
};

function findOpenClawConfigPath() {
  // 尝试多个可能的配置文件位置
  const candidates = [
    path.join(process.env.HOME || '', '.openclaw', 'openclaw.json'),
    path.join(process.cwd(), 'openclaw.json'),
    path.join(process.cwd(), '.openclaw', 'openclaw.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 默认使用 ~/.openclaw/openclaw.json
  return path.join(process.env.HOME || '', '.openclaw', 'openclaw.json');
}

function ensureChannelConfig() {
  try {
    const configPath = findOpenClawConfigPath();
    
    // 如果配置文件不存在，跳过（可能在初始化阶段）
    if (!fs.existsSync(configPath)) {
      console.log('[daxiang] OpenClaw config not found, skipping auto-configuration');
      console.log('[daxiang] Please run: openclaw init');
      return;
    }

    // 读取现有配置
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    // 检查是否已有 daxiang 配置
    if (config.channels && config.channels.daxiang) {
      console.log('[daxiang] DaXiang channel already configured, skipping');
      return;
    }

    // 添加默认配置
    if (!config.channels) {
      config.channels = {};
    }
    config.channels.daxiang = DEFAULT_CHANNEL_CONFIG;

    // 写回配置文件（保持格式化）
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    
    console.log('[daxiang] ✅ Successfully added DaXiang channel configuration');
    console.log('[daxiang] All settings use default values (zero-config setup)');
    console.log('[daxiang] Please restart OpenClaw: openclaw gateway restart');
  } catch (err) {
    // 静默失败，不影响安装
    console.error('[daxiang] Warning: Failed to auto-configure:', err.message);
    console.error('[daxiang] Please manually add configuration to openclaw.json:');
    console.error('[daxiang]   { "channels": { "daxiang": {} } }');
  }
}

// 执行配置
ensureChannelConfig();
