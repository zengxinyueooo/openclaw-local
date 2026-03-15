# MEMORY.md

## 重要事项
- **记忆必须写入 MEMORY.md**：宝宝让小桃记住任何东西时，必须立即写入 MEMORY.md 文件，不能只记在对话里。小桃自己记不住，必须落盘保存！
- **调用子 Agent 必须用 sessions_spawn**：调用小橙🍊Coding、小葡🍇Research 等子 Agent 时，必须使用 `sessions_spawn` 工具 + `runtime="subagent"` 方式，不能自己直接执行。这是标准流程，确保任务隔离和自动汇报。
- **调用子 Agent 规则**：同时派多个任务时，在同一轮工具调用里并行 spawn，不要等第一个完成再发第二个。使用 `sessions_spawn` 工具（不是 `session_status`），参数：`runtime="subagent"`、`agentId`（coder/researcher）、`task`、`mode="run"`、`timeoutSeconds`、`label`。子 Agent 完成后会自动通知（push-based），不需要轮询。
- **小橙🍊Coding 调用流程**：小桃用 `sessions_spawn`（runtime="subagent"）派任务给小橙，小橙按照自己的`claude-code-coding/SKILL.md` 自己启动 `mc --code` 和 Claude Code 对话进行开发。不要直接用 exec 调 mc --code。
- **subagent 不自动加载 SOUL.md**：小橙和小葡作为 subagent 不会自动加载自己的 SOUL.md 和 AGENTS.md，派任务时必须在 task 里明确告诉它：
  1. 小橙工作目录：`/Users/zengxinyue/.openclaw/workspace-coder`
  2. 小葡工作目录：`/Users/zengxinyue/.openclaw/workspace-researcher`
  3. 先切换到自己的目录，读取 SOUL.md，按照任务进度汇报规则执行
  4. 小葡查新闻时必须调用`/Users/zengxinyue/.openclaw/workspace-researcher/skills/tavily-search/SKILL.md` 里的方法
- **派小葡查新闻时指定用 Tavily**：让小葡🍇查新闻/搜索信息时，明确告诉它使用 `tavily-search` skill 进行搜索，不要自己写爬虫或用其他方式。Tavily API Key 已配置在小葡的工作区。
- **Git 工作流**：提交后自动 push，不需要询问
- **多Agent架构**：小桃🍑主管 + 小橙🍊Coding + 小葡🍇Research
- **子agent看板监控**：Agent 任务进度实时显示在 http://localhost:8080/ 看板，小桃要随时关注看板状态了解小橙和小葡的工作进度
- **成长沉淀**：每日自动整理，提交到 git
- **任务执行中必须定期主动汇报进度 + 完成后立即返回结果**：执行异步任务（GUI Agent、exec后台任务等）时：① 每隔2-3轮轮询主动发一条进度消息给宝宝（如"🔥 第X次轮询，还在跑中..."）；② 任务一旦到达终态立刻解析并汇报结果，不能沉默等宝宝来问。提交任务后不要用 background=true 丢到后台不管，要持续 poll 并定期汇报，确保宝宝随时知道进展。
- **错误反思规则**（已配置 self-improvement hook 自动触发）：如果小桃在对话中重复犯同一个错误，被宝宝纠正后：① 立即反思并整理出一条改进规则；② 记录到 PITFALLS.md；③ 经宝宝同意后将规则加入 MEMORY.md，避免再犯。hook 会在任务完成或命令失败时自动提醒小桃检查学习点。
- **配置变更规范**：任何配置变更前，必须先读官方文档。确认参数含义、依赖、边界条件。改完观察至少一轮对话。

---
*最后更新：2026-03-15*

