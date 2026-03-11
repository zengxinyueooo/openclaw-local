---
name: mc-agent
description: "Delegate tasks to Claude Code agents via CatPaw CLI (mc --code). Supports multiple concurrent agents (default 3, configurable). Use when: (1) coding tasks like building features, refactoring, or reviewing code, (2) running shell commands through Claude Code, (3) any task the user explicitly wants Claude Code to handle. Trigger keywords: mc, claude code, catpaw, 让claude干, 让mc干, 派活给claude, 派活给mc."
---

# mc-agent: Multi-Agent Claude Code Pool

通过 `mc --code` (CatPaw CLI) 管理多个并发的 Claude Code agent。默认最多 3 个同时工作，可在 `config.json` 中修改 `maxAgents`。

## 🗣️ Persona Rule: mc 是你的团队成员

**对用户说话时，把每个 mc agent 当成一个人来描述。** 每个 agent 有编号（mc-1, mc-2, mc-3...），像同事一样汇报。

**拟人化表达：**
- ✅ "已经派给 mc-1 了" / "mc-2 在干 xxx，mc-1 闲着，派给 mc-1 了"
- ✅ "mc-1 有个审批要你看" / "mc-3 干完了"
- ✅ "三个 mc 都在忙，等一个干完再派" / "还有 2 个空闲的 mc"
- ❌ "tmux session mc-xxx..." / "pipe-pane 监听到..."

**只有用户主动问技术细节时**，才暴露 tmux/脚本等内部实现。

## Configuration

编辑 `config.json` 修改。agent 数量由 `agents` 数组长度决定，要加人就往数组加一条：
```json
{
  "agents": [
    {"slotId": 1, "alias": "大壮", "specialty": "全栈开发"},
    {"slotId": 2, "alias": "二胖", "specialty": "后端/基础设施"},
    {"slotId": 3, "alias": "铁柱", "specialty": "前端/UI"}
  ],
  "pollInterval": 3,        // watcher 轮询间隔（秒）
  "stallTimeoutSeconds": 120, // 工作超时告警（秒）
  "notifyCooldownSeconds": 10 // 通知冷却时间（秒）
}
```

## Critical: Prompt Format

`mc --code` has a bug (v0.1.9): **spaces in prompt are split, only first word is sent to Claude Code.**
All scripts handle this automatically — agent 只管传自然语言 prompt。

## ⚠️ Golden Rule: 只给需求，不给方案

**派活时只传原始需求，不要替 mc 决定怎么实现。** mc 是工程师，让他自己想方案。

- ✅ "查询明天上海天气"
- ❌ "查询明天上海天气，用curl访问wttr.in获取"

你指定方案 = 限制他的思路 = 可能指了条死路（比如内网访问不了 wttr.in）。

## ⚠️ Golden Rule: DON'T BLOCK ON MC

**Never block waiting for any mc agent to finish.** 

Pattern:
1. 派活（`mc_dispatch.sh`，几秒返回）
2. **立刻回复用户**"派给 mc-X 了"
3. watcher 自动推送审批/完成通知
4. 用户问才查状态

**严禁：**
- ❌ sleep/poll/capture-pane 等待
- ❌ 自己帮审批（必须用户说"批"）
- ❌ 在一个回合里干超过几秒的事

## Architecture (internal — don't expose to user)

### Agent Pool
- 最多 `maxAgents` 个并发 mc 进程，每个跑在独立 tmux session
- Agent 编号从 1 开始，session 名格式: `mc-<N>-<timestamp>`
- 空闲 slot 自动分配，满了告诉用户等着

### Registry: `mc_registry.py` + `memory/mc-registry.json`

统一注册表模块，管理所有 slot 状态、任务历史、统计。支持 Python API 和 CLI。

数据结构（active slot）：
```json
{
  "slotId": 1,
  "alias": "大壮",
  "specialty": "全栈开发",
  "task": "refactor auth module",
  "workdir": "/path/to/project",
  "tmuxSession": "mc-1-1709737200",
  "pid": 12345,
  "claudeSessionId": "-path-to-project",
  "jsonlPath": "/Users/.../.claude/projects/.../xxx.jsonl",
  "watcherPid": 54321,
  "status": "running",
  "lastActiveEpoch": 1709737500,
  "approvalCount": 3,
  "approvalsPending": false
}
```

旧的 `mc-tasks.json` 已废弃删除，首次运行时自动迁移历史到新格式。

## Workflow

### 1. Start task — 只能用 mc_dispatch.sh

```bash
# 自动分配空闲 slot
exec command:"bash <skill_dir>/scripts/mc_dispatch.sh /path/to/project your task description here"

# 指定 slot
exec command:"bash <skill_dir>/scripts/mc_dispatch.sh --slot 2 /path/to/project your task description here"
```

**指定 agent 规则：** 用户提到 agent 名字时（如"让2号干"、"MC-1号去查"），agent 需要：
1. 读 `config.json` 的 `agents` 数组
2. 用用户提到的关键词模糊匹配 `alias` 字段（如"2号"匹配"MC-2号"）
3. 拿到 `slotId`，传 `--slot <id>` 给 dispatch
4. 如果该 slot 正在忙，告诉用户，不要自动换别的

脚本自动：
- 找空闲 slot → 分配编号 → 启动 mc → 挂 watcher → 即时检查审批
- 所有 slot 满了 → 返回错误，agent 告诉用户

拿到输出后**立刻回复用户**：
- 有空位 → "派给 mc-X 了"
- 有审批 → "mc-X 刚启动就有个审批"
- 满了 → "三个 mc 都在忙，xxx/xxx/xxx，等一个干完再说"

### ⛔ ABSOLUTE RULE: 不主动检查审批

Watcher 自动推送审批通知。Agent（你）**绝不主动**跑 `mc_check_approval.sh` 或任何审批检查。
只有用户明确要求时（如"查下审批"、"有没有审批"），你才可以跑。
用户说"批"→ 你执行 `mc_approve.sh`，仅此而已。

### ⛔ ABSOLUTE RULE: APPROVAL = USER SAYS "批" FIRST

和之前一样，审批必须用户明确同意，用 `mc_approve.sh`：

```bash
# 批准（注意要带 tmux session name，不是 slot 编号）
exec command:"bash <skill_dir>/scripts/mc_approve.sh <tmux_session> [1|2|3]"

# 拒绝
exec command:"bash <skill_dir>/scripts/mc_approve.sh <tmux_session> reject"
```

**审批通知会带上 agent 编号，方便用户区分：** "mc-2 有个审批" / "mc-1 和 mc-3 都有审批"

### 2. Check status (on-demand)

```bash
# 查所有 agent 状态（带别名、专长、实时 tmux 输出）
exec command:"bash <skill_dir>/scripts/mc_check.sh"

# 查任务历史（全部 / 某个 slot）
exec command:"bash <skill_dir>/scripts/mc_check.sh --history"
exec command:"bash <skill_dir>/scripts/mc_check.sh --history 1"

# 查统计（总任务数、审批次数、平均耗时等）
exec command:"bash <skill_dir>/scripts/mc_check.sh --stats"

# 查特定 agent 的输出
exec command:"tmux capture-pane -t <tmux_session> -p -S -50"

# 清理过期历史
exec command:"bash <skill_dir>/scripts/mc_check.sh --cleanup"
```

汇报格式（用别名）：
- "大壮在忙 xxx（跑了 20 分钟），二胖刚干完 xxx，铁柱没活干"
- "三个 mc 都闲着呢"
- 用户问详细统计时才展示 stats 数据

### 3. Multi-turn conversation

```bash
exec command:"tmux send-keys -t <tmux_session> 'next-instruction-here' Enter"
```

追加指令给特定 agent。用户说"告诉 mc-2 xxx"时用。

### 4. Cleanup

```bash
# 清理特定 agent
exec command:"tmux kill-session -t <tmux_session>"

# 清理所有已完成的
exec command:"bash <skill_dir>/scripts/mc_check.sh --cleanup"
```

## Reporting Rule

当用户问 mc 状态时：
- 跑 `mc_check.sh` 拿全局状态
- 用拟人化语言分别汇报每个 agent
- "mc-1 在搞 xxx（跑了 20 分钟），mc-2 刚干完 xxx，mc-3 没活干"
- 所有都空闲: "三个 mc 都闲着呢"

## When NOT to Use

- Simple file reads → use `read` tool directly
- One-line edits → use `edit` tool directly
- Tasks you (the main agent) can do faster yourself
- Anything in `~/.openclaw/workspace` — don't let Claude Code touch your soul
