# OpenClaw 多Agent架构配置指南 🍑🍊🍇

> 本文档记录从零开始配置多Agent架构的完整实践过程
> 基于 OpenClaw + 水果Agent团队（小桃/小橙/小葡）

---

## 📋 目录

1. [架构概览](#架构概览)
2. [核心概念](#核心概念)
3. [配置步骤](#配置步骤)
4. [三种派活方式](#三种派活方式)
5. [踩坑记录](#踩坑记录)
6. [最佳实践](#最佳实践)

---

## 架构概览

### 水果Agent团队

```
┌─────────────────────────────────────────────────────────┐
│                    小桃 🍑 (主管Agent)                    │
│              主工作区: ~/.openclaw/workspace/             │
│                   职责: 派活 + 协调                        │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐      ┌─────────────────────┐
│    小橙 🍊           │      │    小葡 🍇           │
│  Coding Agent       │      │  Research Agent     │
│  workspace-coder/   │      │  workspace-researcher/│
│  写代码/重构/Review  │      │  查资料/调研/读文档   │
└─────────────────────┘      └─────────────────────┘
           │                               │
           └───────────────┬───────────────┘
                           ▼
              ┌─────────────────────┐
              │   shared/ 共享空间   │
              │  - 任务数据库        │
              │  - 进度监控          │
              │  - 工具脚本          │
              └─────────────────────┘
```

---

## 核心概念

### 1. Multi-Agent vs SubAgent

| 特性 | Multi-Agent | SubAgent |
|------|-------------|----------|
| 生命周期 | 长期运行 | 临时创建 |
| 身份定义 | AGENTS.md | 无固定身份 |
| Workspace | 独立目录 | 可指定cwd |
| 使用场景 | 专职角色 | 并行任务 |
| 创建方式 | 配置文件 | sessions_spawn |

### 2. Ralph Loop 任务管理模式

```
Cron Job (每30分钟)
    │
    ▼
┌─────────────┐
│   小桃 🍑    │ ──读取──┐
│  (主管)      │         │
└─────────────┘         │
                        ▼
              ┌─────────────────┐
              │  shared/tasks.json │
              │    任务数据库      │
              └─────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │ 小橙 🍊  │    │ 小葡 🍇  │    │ 其他Agent│
   │检查清单  │    │检查清单  │    │检查清单  │
   └─────────┘    └─────────┘    └─────────┘
```

**核心思想**：Agent自治 + 定时唤醒 + 清单驱动

---

## 配置步骤

### 步骤1: 创建Agent工作目录

```bash
# 创建小橙的workspace
mkdir -p ~/.openclaw/workspace-coder
mkdir -p ~/.openclaw/workspace-coder/scripts

# 创建小葡的workspace
mkdir -p ~/.openclaw/workspace-researcher

# 创建共享空间
mkdir -p ~/.openclaw/shared
mkdir -p ~/.openclaw/shared/progress
mkdir -p ~/.openclaw/shared/dashboard
```

### 步骤2: 配置 openclaw.json

编辑 `~/.openclaw/openclaw.json`，添加 agents 配置：

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "baiduqianfancodingplan/kimi-k2.5"
      },
      "subagents": {
        "maxConcurrent": 8
      },
      "workspace": "/Users/zengxinyue/.openclaw/workspace"
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "name": "小桃",
        "model": "baiduqianfancodingplan/kimi-k2.5",
        "subagents": {
          "allowAgents": [
            "coder",
            "researcher"
          ]
        }
      },
      {
        "id": "coder",
        "name": "小橙 - Coding Agent",
        "workspace": "/Users/zengxinyue/.openclaw/workspace-coder",
        "model": "baiduqianfancodingplan/kimi-k2.5"
      },
      {
        "id": "researcher",
        "name": "小葡 - Research Agent",
        "workspace": "/Users/zengxinyue/.openclaw/workspace-researcher",
        "model": "baiduqianfancodingplan/kimi-k2.5"
      }
    ]
  },
  "tools": {
    "profile": "full",
    "sessions": {
      "visibility": "all"
    },
    "agentToAgent": {
      "enabled": true
    }
  }
}
```

**关键配置说明**：
- `agents.list`: 定义所有Agent
- `subagents.allowAgents`: 允许创建的子Agent类型
- `tools.sessions.visibility: "all"`: 让小桃能看到所有session
- `tools.agentToAgent.enabled: true`: 启用Agent间通信

### 步骤3: 创建Agent身份文件

每个Agent需要自己的身份定义文件：

**小橙 - workspace-coder/AGENTS.md**:
```markdown
# AGENTS.md - 小橙 🍊

## 身份
- 名称：小橙
- 角色：Coding Agent
- 职责：写代码、重构、Code Review

## 工作模式
1. 读取 TASKS.md 待办清单
2. 使用 Claude Code (mc --code) 写代码
3. 上报进度到 shared/progress/
4. 完成任务后更新 TASKS.md

## 工具
- 代码编辑：Claude Code
- 进度上报：shared/progress_reporter.py
```

**小橙 - workspace-coder/TASKS.md**:
```markdown
# TASKS.md - 小橙的待办清单

## 进行中
- [ ] task-001: 重构代码
- [ ] task-002: Code Review

## 待办
- [ ] task-003: 写新功能

## 已完成
- [x] task-000: 初始化项目
```

### 步骤4: 创建共享工具

**shared/progress_reporter.py** - 进度上报工具：
```python
#!/usr/bin/env python3
"""进度上报工具 - 供Agent上报任务进度"""

import json
import os
from datetime import datetime
from pathlib import Path

PROGRESS_DIR = Path.home() / ".openclaw" / "shared" / "progress"

def update_progress(agent_id: str, task_id: str, status: str, 
                    progress: int, message: str, details: dict = None):
    """更新任务进度"""
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
    
    data = {
        "agent_id": agent_id,
        "task_id": task_id,
        "status": status,  # started/running/completed/failed
        "progress": progress,  # 0-100
        "message": message,
        "timestamp": datetime.now().isoformat(),
        "details": details or {}
    }
    
    progress_file = PROGRESS_DIR / f"{agent_id}-{task_id}.json"
    with open(progress_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"📊 [{agent_id}] {progress}% - {message}")
```

**shared/tasks.json** - 任务数据库：
```json
{
  "tasks": [
    {
      "id": "task-001",
      "title": "示例任务",
      "agent": "coder",
      "status": "pending",
      "priority": "high",
      "created_at": "2026-03-12T10:00:00"
    }
  ]
}
```

### 步骤5: 验证配置

```bash
# 重启 OpenClaw
openclaw gateway restart

# 查看Agent列表
openclaw agents list

# 预期输出：
# main (default) - 小桃
# coder - 小橙 - Coding Agent
# researcher - 小葡 - Research Agent
```

---

## 三种派活方式

### 方式1: Bindings 路由（被动响应）

**场景**：根据消息内容自动路由到不同Agent

**配置**：在 `openclaw.json` 中添加 bindings

```json
{
  "bindings": [
    {
      "from": "*",
      "to": "coder",
      "when": "message contains '写代码' or '重构'"
    },
    {
      "from": "*",
      "to": "researcher",
      "when": "message contains '调研' or '查资料'"
    }
  ]
}
```

### 方式2: Subagents 派活（主动并行）

**场景**：小桃主动创建子Agent执行并行任务

```python
# 小桃使用 sessions_spawn 创建子Agent
sessions_spawn(
    task="编写代码...",
    runtime="subagent",
    cwd="~/.openclaw/workspace-coder"
)

# 查看子Agent状态
subagents(action="list")

# 发送消息给子Agent
sessions_send(sessionKey="xxx", message="继续执行")
```

### 方式3: Ralph Loop 文件监控（自治模式）

**场景**：Agent定时检查自己的 TASKS.md

```python
# 每个Agent的定时任务
def check_tasks():
    """检查待办清单并执行"""
    with open("TASKS.md") as f:
        tasks = parse_tasks(f.read())
    
    for task in tasks["进行中"]:
        execute_task(task)
        update_progress("coder", task.id, "running", 50, "执行中...")
```

**对比**：

| 方式 | 触发方式 | 适用场景 | 复杂度 |
|------|----------|----------|--------|
| Bindings | 消息触发 | 被动响应 | 低 |
| Subagents | 主动创建 | 并行任务 | 中 |
| Ralph Loop | 定时检查 | 自动化 | 中 |

---

## 踩坑记录

### 坑1: sessions_spawn 不能指定 agentId

**问题**：
```python
# ❌ 错误：不能这样指定Agent类型
sessions_spawn(agentId="coder", task="...")
```

**解决**：
```python
# ✅ 正确：通过 cwd 指定 workspace
sessions_spawn(
    task="...",
    cwd="~/.openclaw/workspace-coder"  # 小橙的workspace
)
```

### 坑2: Agent间不能直接通信

**问题**：
```python
# ❌ 错误：不能直接发消息给Agent
message(to="coder", message="...")
```

**解决**：
```python
# ✅ 方案1：通过 sessions_send 给子Agent
sessions_send(sessionKey="xxx", message="...")

# ✅ 方案2：通过文件共享状态
# 写入 shared/progress/coder-task-001.json
```

### 坑3: Claude Code 需要 TTY

**问题**：自动化脚本无法完全模拟 `mc --code` 的交互

**解决**：
- 方案A：使用 `os.execvp` 替换当前进程保留终端
- 方案B：半自动模式（Agent准备 + 人工执行）
- 方案C：直接使用 Claude API 而非 CLI

### 坑4: 配置不生效

**问题**：修改 `openclaw.json` 后 Agent 列表未更新

**解决**：
```bash
# 必须重启 gateway
openclaw gateway restart

# 然后验证
openclaw agents list
```

---

## 最佳实践

### 1. 角色设计原则

- **小桃（主管）**：不处理具体任务，专注派活和协调
- **小橙（Coding）**：专职代码，不处理其他类型任务
- **小葡（Research）**：专职调研，输出结构化报告

### 2. 任务分配策略

```
用户请求
    │
    ▼
小桃分析
    │
    ├─→ 代码相关 ──→ 派给小橙 🍊
    ├─→ 调研相关 ──→ 派给小葡 🍇
    └─→ 复杂协调 ──→ 小桃自己处理 🍑
```

### 3. 进度监控方案

```
shared/
├── progress/
│   ├── coder-task-001.json    # 小橙任务进度
│   ├── coder-task-002.json
│   ├── researcher-task-001.json
│   └── dashboard.pid
├── tasks.json                  # 全局任务数据库
└── dashboard/
    ├── index.html             # 可视化看板
    └── server.py              # 监控服务
```

访问看板：`http://localhost:8080`

### 4. 文件组织规范

```
~/.openclaw/
├── workspace/                  # 小桃的主工作区
│   ├── MEMORY.md              # 共享记忆
│   ├── AGENTS.md              # 小桃的身份定义
│   └── docs/                  # 文档
├── workspace-coder/           # 小橙的工作区
│   ├── TASKS.md               # 待办清单
│   ├── AGENTS.md              # 小橙的身份定义
│   └── scripts/               # 工具脚本
├── workspace-researcher/      # 小葡的工作区
│   ├── TASKS.md
│   └── AGENTS.md
└── shared/                    # 共享空间
    ├── progress/              # 进度文件
    ├── dashboard/             # 监控看板
    └── *.py                   # 共享工具
```

---

## 快速启动命令

```bash
# 1. 启动监控看板
cd ~/.openclaw/shared/dashboard
python3 server.py &

# 2. 查看Agent状态
openclaw agents list

# 3. 查看任务进度
ls ~/.openclaw/shared/progress/

# 4. 打开看板
open http://localhost:8080
```

---

## 参考文档

- [学城文章] 一周从0-1多Agent架构OpenClaw实践分享
- [学城文章] 第八天：让AI团队学会自己看待办清单
- OpenClaw 官方文档: https://docs.openclaw.ai

---

*文档创建：2026-03-12*  
*作者：小桃 🍑*  
*版本：v1.0*
