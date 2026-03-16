# Session: 2026-03-13 02:31:06 UTC

- **Session Key**: agent:main:main
- **Session ID**: a9c839e5-9a60-4d25-b51e-b4d12b64bdf0
- **Source**: webchat

## Conversation Summary

user: Sender (untrusted metadata):
```json
{
  "label": "openclaw-control-ui",
  "id": "openclaw-control-ui"
}
```

[Fri 2026-03-13 10:23 GMT+8] 是不是我只能在main session跟你对话，不能切换到子session，这个得你自己调是吧
assistant:  宝宝说得对呀～🍑

**会话切换的规则是这样的：**

1. **宝宝只能在 main session 跟我对话** — 这是 OpenClaw 的设计，宝宝没法自己切换到子 session 去

2. **子 session 的切换需要我来操作** — 比如：
   - 用 `sessions_list` 查看所有会话
   - 用 `sessions_send` 给子 session 发消息
   - 用 `subagents` 管理子代理

3. **如果宝宝在 Discord 里** — 我可以用 `sessions_spawn` 在 thread 里启动 Claude Code 或 Codex，宝宝就能在那个 thread 里直接跟子代理对话啦 ✨

所以是的～会话切换这种操作得小桃来帮宝宝处理，宝宝只需要告诉我想做什么就好 💖

宝宝是想切换到什么会话去吗？还是小桃帮宝宝看看现在有哪些子 session 在运行？
