---
name: task-progress-reporter
description: 为 OpenClaw Agent 配置任务进度实时汇报能力。当 Agent 执行长任务时，用户可以随时询问进度并立即收到回复，任务不会被中断。适用场景：(1) 希望在 Agent 执行耗时任务时能随时查看进度 (2) 配置消息队列的 steer-backlog 模式 (3) 配置 Agent 的进度汇报行为规则。触发词：任务进度、进度汇报、steer-backlog、长任务中断、实时进度、任务不中断回复进度。
---

# Task Progress Reporter

为 OpenClaw Agent 配置"长任务执行中可随时汇报进度"的能力。

## 原理

利用 OpenClaw 消息队列的 `steer-backlog` 模式：

1. **steer**：新消息在当前任务的工具调用边界插入，Agent 先处理新消息
2. **backlog**：处理完后继续原任务，并在任务结束后对插入的消息再做一次 followup 回复

配合 SOUL.md 中的行为规则，Agent 会根据消息内容判断：
- **问进度** → 用 `message` 工具主动推送进度，然后继续任务
- **其他消息** → 告知在忙，任务优先完成

## 配置步骤

### Step 1：配置消息队列模式

运行配置脚本：

```bash
python3 {baseDir}/scripts/configure_queue.py
```

脚本会自动修改 `openclaw.json`，将 `messages.queue.mode` 设为 `steer-backlog`。

也可手动编辑 `~/.openclaw/openclaw.json`，在 `messages` 字段下添加：

```json
{
  "messages": {
    "queue": {
      "mode": "steer-backlog",
      "debounceMs": 1000,
      "cap": 20,
      "drop": "summarize"
    }
  }
}
```

### Step 2：添加 Agent 行为规则

在 Agent 的 `SOUL.md`（工作空间根目录）中添加以下内容：

```markdown
## 任务中断与进度汇报

当我正在执行长任务时收到新消息（steer 插入）：

**如果是问进度**（包括但不限于："在吗"、"到哪了"、"进度怎么样"、"还要多久"、"做到哪了"、"在干嘛"、"搞完了吗"等）：
→ **立即用 `message` 工具发送一条进度消息**（不能只写在回复文本里，必须调 message 工具确保送达）
→ 内容：当前正在做什么、已完成哪些步骤、预计还需多久
→ 发完后继续原任务

**如果是其他内容**（新任务、新问题、闲聊等）：
→ 回复"正在处理 XXX，完成后马上处理你的消息"，不打断原任务，优先完成当前工作
```

也可运行脚本自动追加：

```bash
python3 {baseDir}/scripts/configure_queue.py --update-soul
```

### Step 3：重载 Gateway 配置

配置修改后需让 Gateway 加载新配置：

```bash
kill -USR1 $(pgrep openclaw-gateway)
```

或重启 Gateway：

```bash
openclaw gateway restart
```

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `mode` | `steer-backlog` | 队列模式。`steer` 只插入不保留 backlog，`collect` 不插入等任务完成 |
| `debounceMs` | `1000` | 等待静默后再开始 followup（防止连续消息重复触发） |
| `cap` | `20` | 最大排队消息数 |
| `drop` | `summarize` | 溢出策略：`old` 丢旧、`new` 丢新、`summarize` 摘要 |

## 注意事项

- steer 只能在**工具调用边界**插入，如果 Agent 正在等一个很慢的工具返回，需等它完成才能响应
- `steer-backlog` 会在任务完成后对 steer 消息产生额外的 followup 回复，属正常现象
- 进度汇报必须用 `message` 工具主动推送，不能只写在回复文本中（否则会被后续工具调用覆盖）
- 行为规则通过 SOUL.md 的 prompt 约束，非硬编码逻辑
