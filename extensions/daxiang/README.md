### 切换到纯插件模式（推荐用于分发）

如果要分发给其他用户，执行以下步骤：

#### 1. 测试插件独立性

```bash
cd extensions/daxiang

# 方式1：使用项目的 TypeScript（如果 Node >= 22）
bash build-test.sh

# 方式2：使用全局 TypeScript
npm install -g typescript@5.9.3
npm run build

# 检查构建产物
ls -la dist/
```

#### 2. 本地安装测试

```bash
# 打包插件
npm pack
# 会生成：ai-daxiang-1.0.0-beta2.tgz

# 安装到主项目测试
cd ../..
openclaw plugin install ./extensions/daxiang/ai-daxiang-1.0.0-beta2.tgz

# 启动测试
openclaw gateway start
```

#### 3. 发布到 NPM

```bash
cd extensions/daxiang

# 登录 NPM（首次）
mnpm login

# 或发布到私有仓库
mnpm publish
```

#### 4. 用户安装方式

其他用户可以通过以下方式安装（推荐使用 openclaw plugin install）：

```bash
# 推荐方式：使用 OpenClaw 插件管理器
openclaw plugin install @ai/daxiang

# 或使用 npm 全局安装
npm install -g @ai/daxiang --registry=http://r.npm.sankuai.com/
```

#### 5. 首次使用（自动配置）

安装后重启 OpenClaw，插件会自动：

1. ✅ 添加 `channels.daxiang` 配置到 `openclaw.json`
2. ✅ 打开浏览器进行 SSO 认证
3. ✅ 保存用户 MIS 和访问令牌

完全零配置，开箱即用！

如果自动认证失败，可以手动执行：
```bash
cd ~/.openclaw/plugins/<安装目录>
npm run generate-sso
```

