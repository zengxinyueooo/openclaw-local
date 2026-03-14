---
name: claude-code-coding
description: "指导 Coding Agent 使用 Claude Code (mc --code) 进行开发工作。当需要让 Claude Code 协助编码、重构、代码审查时使用。支持多轮对话、任务委派和结果汇总。"
---

# Claude Code Coding Skill

本 Skill 指导 Coding Agent 如何与 Claude Code 协作完成开发任务。

## 启动 Claude Code

使用 `mc --code` 启动交互式 Claude Code 会话：

```bash
# 在项目目录启动
bash pty:true workdir:/path/to/project command:"mc --code"

# 或在临时目录测试
bash pty:true workdir:/tmp command:"mc --code"
```

**重要：必须使用 `pty:true`**，Claude Code 是交互式终端应用。

## 首次启动流程

1. Claude Code 会询问是否信任当前目录
2. 按回车选择默认选项（Yes, proceed）
3. 进入主界面后即可开始对话

## 与 Claude Code 对话

### 发送消息

```bash
# 发送自然语言指令（注意 mc v0.1.9 bug：空格会被分割）
# 解决方案：使用引号包裹或使用 process submit
process action:submit sessionId:<session_id> data:"你的指令"
```

### 处理 mc v0.1.9 的 Bug

由于 mc 会将空格分割，使用以下方式绕过：

```bash
# 方法1：使用下划线替代空格，Claude Code 能理解
process action:submit sessionId:<session_id> data:"创建一个_Python_程序_输出_Hello_World"

# 方法2：分多次发送（不推荐，但可行）
process action:write sessionId:<session_id> data:"创建"
process action:write sessionId:<session_id> data:" Python "
process action:write sessionId:<session_id> data:"程序"
process action:submit sessionId:<session_id> data:""
```

## 工作模式

### 模式1：一次性任务

适合简单、明确的任务：

```bash
# 1. 启动 Claude Code
bash pty:true workdir:/tmp/test-project background:true command:"mc --code"
# 返回 session_id

# 2. 确认信任目录（首次）
process action:submit sessionId:<id> data:""

# 3. 发送任务（使用下划线绕过空格bug）
process action:submit sessionId:<id> data:"创建_hello.py_输出_Hello_Claude"

# 4. 等待并检查结果
process action:log sessionId:<id> limit:100
```

### 模式2：多轮对话

适合复杂、需要迭代的任务：

```bash
# 1. 启动并确认信任
bash pty:true workdir:/path/to/project background:true command:"mc --code"

# 2. 第一轮：描述需求
process action:submit sessionId:<id> data:"帮我设计一个用户认证模块"

# 3. 查看响应，继续追问
process action:log sessionId:<id> limit:100
process action:submit sessionId:<id> data:"使用_JWT_实现_支持刷新token"

# 4. 如此往复直到满意
```

### 模式3：代码审查

```bash
# 审查特定文件
process action:submit sessionId:<id> data:"审查_src/auth.js_代码质量"

# 审查整个项目
process action:submit sessionId:<id> data:"审查整个项目_给出改进建议"
```

## 监控 Claude Code 状态

```bash
# 查看最新输出
process action:log sessionId:<session_id> limit:100

# 检查是否还在运行
process action:poll sessionId:<session_id>

# 列出所有会话
process action:list
```

## 处理 Claude Code 的询问

Claude Code 可能会询问：
- **文件操作确认**："是否要创建文件 xxx？"
- **命令执行确认**："是否要运行 npm install？"
- **选择选项**："请选择 1/2/3"

处理方式：

```bash
# 确认/同意
process action:submit sessionId:<id> data:"y"

# 或选择选项
process action:submit sessionId:<id> data:"1"

# 拒绝
process action:submit sessionId:<id> data:"n"
```

## 结束会话

```bash
# 方式1：发送 exit
process action:submit sessionId:<id> data:"exit"

# 方式2：直接 kill
process action:kill sessionId:<id>
```

## 完整示例

### 示例：创建一个简单的 Web 服务器

```bash
# 1. 准备工作目录
mkdir -p /tmp/web-demo && cd /tmp/web-demo && git init

# 2. 启动 Claude Code
bash pty:true workdir:/tmp/web-demo background:true command:"mc --code"
# 假设返回 sessionId: demo-session

# 3. 确认信任（首次）
process action:submit sessionId:demo-session data:""

# 4. 发送任务
process action:submit sessionId:demo-session data:"创建一个_Express_服务器_监听3000端口_返回HelloWorld"

# 5. 等待几秒后检查结果
process action:log sessionId:demo-session limit:100

# 6. 如果需要安装依赖
process action:submit sessionId:demo-session data:"y"

# 7. 继续对话直到完成
process action:submit sessionId:demo-session data:"添加一个_/users_路由_返回用户列表"

# 8. 查看最终代码
read path:"/tmp/web-demo/server.js"

# 9. 结束会话
process action:kill sessionId:demo-session
```

## 最佳实践

1. **总是用 `pty:true`**：Claude Code 需要伪终端
2. **处理空格 bug**：使用下划线或短横线替代空格
3. **分步骤进行**：复杂任务拆成多轮对话
4. **及时检查日志**：用 `process log` 查看响应
5. **确认关键操作**：Claude Code 询问时及时响应
6. **清理会话**：任务完成后 `kill` 会话

## 故障排查

| 问题 | 解决方案 |
|------|----------|
| Claude Code 不响应 | 检查是否确认了信任目录 |
| 指令被截断 | 使用下划线替代空格 |
| 输出乱码 | 确保使用了 `pty:true` |
| 会话卡住 | 尝试 `process action:poll` 检查状态 |
| 需要审批/确认 | 发送 `y` 或对应选项数字 |
