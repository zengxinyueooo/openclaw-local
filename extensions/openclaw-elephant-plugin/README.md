# 大象通信（WebSocket）最小插件示例

这是一个**最小可用**的 channel 插件示例：在插件内部用 WebSocket 收发**纯文本**，并把入站消息交给 OpenClaw/Moltbot 的自动回复链路。

## 配置

目前用环境变量指定 WebSocket 地址：

- `ELEPHANT_WS_URL`: 例如 `ws://127.0.0.1:8787`

## WebSocket 协议（最小约定）

插件发送（出站）：

```json
{ "type": "send", "to": "<conversationId>", "text": "hello" }
```

插件接收（入站）：

```json
{
  "type": "message",
  "from": "<senderId>",
  "conversationId": "<conversationId>",
  "text": "hi"
}
```

> 兼容简单 echo：如果服务端直接推送纯文本帧，插件会把它当作入站文本（`from=unknown`）。

## 本地自测（可选）

启动一个最小 echo 服务端：

```bash
bun extensions/elephant/dev/echo-server.ts
```

然后（另开终端）启动 gateway 时带上：

```bash
export ELEPHANT_WS_URL="ws://127.0.0.1:8787"
```
