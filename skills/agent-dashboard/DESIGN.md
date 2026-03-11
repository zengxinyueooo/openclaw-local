# Agent Dashboard — 技术方案

## 一、产品概述

一个可视化网站，以"写字楼某层办公室"为场景，展示本地运行的各个 AI Agent。每个 Agent 坐在工位上敲电脑，实时展示工作内容和进展。基于 Agent 的核心配置文件生成拟人化卡通形象。

**当前版本覆盖的 Agent 类型：**
1. **OpenClaw 主 Agent（二狗子）** — 主控，坐在中间大工位
2. **MC Agents（MC-1号、MC-2号）** — Claude Code 工人，各坐一个工位

## 二、数据源

### 2.1 OpenClaw 主 Agent

| 数据 | 来源 | 方式 |
|---|---|---|
| 身份/性格 | `IDENTITY.md`、`SOUL.md` | 文件读取 |
| 用户信息 | `USER.md` | 文件读取 |
| 运行状态 | Gateway WebSocket `ws://127.0.0.1:18789/` | WS 连接，method: `connect` → 事件流 |
| 会话消息 | Gateway WebSocket `chat.send` / `chat.inject` 事件 | 实时推送 |
| 当前模型 | `openclaw.json` 的 `models` 配置 | 文件读取 |

### 2.2 MC Agents

| 数据 | 来源 | 方式 |
|---|---|---|
| Agent 配置 | `skills/mc-agent/config.json` | 文件读取（agents 数组：alias、autoApprove） |
| 实时 slot 状态 | `skills/mc-agent/slots.json` | 文件轮询（task、status、approvalsPending、tmuxSession） |
| 历史任务 | `skills/mc-agent/history.json` | 文件读取 |
| 工作输出实时流 | Claude Code jsonl 文件（路径从 slots.json 的 `jsonlPath` 取） | 文件 tail（类似 watcher 的逻辑） |
| 终端画面 | `tmux capture-pane -t <tmuxSession> -p` | 命令执行 |

### 2.3 拟人化形象生成

**原则：有什么展示什么，没有就不展示。零硬编码。**

| 字段 | 来源 | 缺失时处理 |
|---|---|---|
| 名字 | OpenClaw: `IDENTITY.md` 的 Name；MC: `config.json` 的 alias | 用 agent type + id 兜底（如 "mc-1"） |
| 性格/Vibe | OpenClaw: `IDENTITY.md` / `SOUL.md`；MC: 无 | 不展示 |
| Emoji | OpenClaw: `IDENTITY.md` 的 Emoji；MC: 无 | 不展示 |
| 头像 | `avatars/<agent-id>.png` 缓存文件 | 用默认通用卡通头像占位 |
| 任何其他字段 | 从配置/接口动态读 | 字段不存在就不渲染对应 UI 区域 |

Agent 数量、名字、类型全部从数据源（文件/接口）动态推导，前端不硬编码任何 agent 信息。新增/删除 agent 只需改配置文件，前端自动适配。

## 三、架构

```
┌─────────────────────────────────────────────────┐
│                  浏览器前端                       │
│  React + Three.js/PixiJS (2.5D 办公室场景)       │
│  - 写字楼楼层俯视图                              │
│  - 每个 Agent 一个工位，有卡通形象坐着敲电脑       │
│  - 点击 Agent → 侧边栏显示详情                    │
│  - 气泡显示当前任务/状态                          │
└────────────────┬────────────────────────────────┘
                 │ HTTP + WebSocket
┌────────────────▼────────────────────────────────┐
│              Node.js 后端 (Express)              │
│  端口: 3210                                      │
│                                                  │
│  /api/agents          → 所有 Agent 列表 + 状态    │
│  /api/agents/:id      → 单个 Agent 详情           │
│  /api/agents/:id/output → 最近输出（tmux/jsonl）  │
│  /api/history         → MC 历史任务               │
│  /api/avatars/:id     → 头像图片                  │
│  ws://…/live          → 实时状态推送               │
│                                                  │
│  数据采集层:                                      │
│  - 文件 watcher: slots.json, config.json         │
│  - jsonl tailer: 各 slot 的 jsonl 文件            │
│  - tmux bridge: capture-pane 定期采集             │
│  - OpenClaw WS client: 连 gateway 拿主 agent 状态│
└─────────────────────────────────────────────────┘
```

## 四、前端场景设计

### 4.1 视觉风格

**精美 3D 卡通渲染风格**（类 Overcooked / The Sims 低多边形精致风），三维透视视角俯瞰办公室。

技术方案：**Three.js** 渲染
- 场景光照：暖色主灯 + 窗外自然光 + 屏幕冷光反射
- 材质：PBR 材质，低多边形但质感精致（玻璃、金属、木纹）
- 角色：3D 卡通人物模型（基于 AI 生成头像贴图到角色面部）
- 相机：固定 45° 俯瞰视角，支持鼠标拖拽旋转和滚轮缩放

### 4.2 办公室布局

一个开放式写字楼楼层，落地窗外可见城市天际线：

```
┌──────────────────────────────────────────────┐
│ 🪟 落地窗（城市天际线）                   🪟  │
│                                              │
│  ┌──────────────────────┐                    │
│  │     📋 任务黑板       │  ← 墙上大黑板     │
│  │  (实时任务看板)       │                    │
│  └──────────────────────┘                    │
│                                              │
│      ┌───────────┐                           │
│      │  二狗子    │  ← 主管大桌（面朝黑板）   │
│      │  🐕 💻    │                           │
│      └───────────┘                           │
│                                              │
│  ┌───────────┐     ┌───────────┐             │
│  │  MC-1号   │     │  MC-2号   │  ← 员工工位  │
│  │  🤖 💻   │     │  🤖 💻   │             │
│  └───────────┘     └───────────┘             │
│                                              │
│  🪴 绿植        ☕ 咖啡机       📦 文件柜     │
└──────────────────────────────────────────────┘
```

### 4.3 任务黑板

办公室正墙挂一块大黑板（3D 渲染的真实黑板材质，粉笔字风格），实时展示所有任务：

```
╔══════════════════════════════════════════════════╗
║              📋 TASK BOARD                       ║
║──────────────────────────────────────────────────║
║  待办 (TODO)    │  进行中 (WIP)   │  已完成 (DONE) ║
║─────────────────┼─────────────────┼──────────────║
║                 │ MC-1号          │ MC-1号        ║
║                 │ 查上海3号线站点  │ 淮安天气 ✓    ║
║                 │ ⏱ 4m 🔄        │ 32s           ║
║                 │                 │               ║
║                 │ MC-2号          │ MC-2号        ║
║                 │ 扬州天气        │ 镇江天气 ✓    ║
║                 │ ⏱ 2m 🔄        │ 33s           ║
╚══════════════════════════════════════════════════╝
```

黑板数据来源：
- **进行中**：`slots.json` 中 `status == "running"` 的 slot
- **已完成**：`history.json` 的最近 N 条
- **待办**：`slots.json` 中 `approvalsPending == true` 的标红闪烁

黑板可点击放大为全屏看板视图。

### 4.4 Agent 状态视觉映射

| 状态 | 视觉表现 |
|---|---|
| running（工作中） | 角色坐工位敲键盘（手部动画）+ 屏幕亮蓝光 + 头顶气泡浮动显示任务摘要 |
| idle（空闲） | 角色后仰靠椅，手端咖啡杯，屏幕待机 |
| approval（等审批） | 角色转头看向主管（二狗子）+ 头顶红色 ❗ 气泡脉冲闪烁 + 屏幕橙色警告 |
| offline（未启动） | 工位空着，屏幕关闭，椅子推到桌下 |
| error | 屏幕显示红色错误画面，角色双手抱头 |

### 4.5 交互

- **悬停 Agent** → 3D 高亮光圈 + 浮窗（名字、任务、时长）
- **点击 Agent** → 相机平滑推近到该工位，右侧滑出详情面板：
  - 卡通头像（AI 生成） + 名字 + 性格描述
  - 当前任务 + 进展
  - 终端实时输出（tmux capture，等宽字体终端模拟，自动滚动）
  - 审批操作按钮（如果等审批）
  - 历史任务时间线
- **点击黑板** → 全屏任务看板视图
- **ESC / 点空白** → 相机复位到全景

## 五、后端 API 详细设计

### GET /api/agents

响应只包含从数据源实际读到的字段，缺失字段不返回（前端按有无渲染）：

```json
[
  {
    "id": "openclaw",
    "type": "openclaw",
    "status": "running",
    "name": "二狗子",          // 来自 IDENTITY.md，没有则不含此字段
    "emoji": "🐕",            // 来自 IDENTITY.md，没有则不含
    "vibe": "实在、不装、直来直去", // 来自 IDENTITY.md，没有则不含
    "model": "friday/aws.claude-opus-4.6", // 来自 openclaw.json，没有则不含
    "avatarUrl": "/api/avatars/openclaw"   // 有缓存头像才返回
  },
  {
    "id": "mc-1",
    "type": "mc-agent",
    "slotId": 1,
    "status": "running",
    "name": "MC-1号",          // 来自 config.json alias，没有则不含
    "autoApprove": true,       // 来自 config.json
    "currentTask": {           // 来自 slots.json，slot 空闲则不含
      "task": "查询上海地铁3号线站点",
      "workdir": "/tmp",
      "startedAt": "2026-03-09T00:18:09+0800",
      "ageMinutes": 7.5,
      "approvalsPending": false
    }
  }
]
```

### GET /api/agents/:id/output

返回最近的终端输出（tmux capture-pane 结果）或 jsonl 最近事件。

### WebSocket /live

服务端 → 客户端推送事件：

```json
{"event": "agent.status", "agentId": "mc-1", "status": "running", "task": "..."}
{"event": "agent.output", "agentId": "mc-1", "text": "..."}  
{"event": "agent.approval", "agentId": "mc-1", "tool": "Bash", "command": "curl ..."}
{"event": "agent.completed", "agentId": "mc-1"}
```

## 六、关键文件路径

```
~/.openclaw/workspace/
├── IDENTITY.md              # 主 Agent 身份
├── SOUL.md                  # 主 Agent 性格
├── USER.md                  # 用户信息
├── openclaw.json            → ~/.openclaw/openclaw.json（gateway 配置）
├── skills/mc-agent/
│   ├── config.json          # MC Agent 配置（alias, autoApprove）
│   ├── slots.json           # 实时 slot 状态
│   └── history.json         # 历史任务
└── agent-dashboard/         # 本项目
    ├── DESIGN.md            # 本文档
    ├── server/              # Node.js 后端
    │   ├── index.js
    │   ├── data-collector.js    # 数据采集（文件 watch + tmux + jsonl tail）
    │   └── openclaw-client.js   # OpenClaw Gateway WS 客户端
    ├── web/                 # 前端
    │   ├── index.html
    │   ├── scene.js         # Three.js 3D 办公室场景
    │   ├── office.js        # 办公室家具/布局（桌椅、黑板、绿植等）
    │   ├── characters.js    # 3D 角色模型 + 动画状态机
    │   ├── taskboard.js     # 任务黑板渲染（3D 纹理 + 全屏看板）
    │   ├── agents.js        # Agent 数据管理 + WS 客户端
    │   ├── panel.js         # 右侧详情面板（终端输出、审批等）
    │   └── styles.css
    └── avatars/             # 生成的头像缓存
```

## 七、技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 前端渲染 | **Three.js** | 精美 3D 场景，PBR 材质，低多边形卡通风 |
| 前端框架 | **Vanilla JS** + 模块化 | 页面逻辑不复杂，Three.js 自己管渲染 |
| 后端 | **Node.js + Express** | 和 OpenClaw 生态一致，方便调 WS |
| 实时通信 | **WebSocket (ws)** | 后端 → 前端推送状态变化 |
| 文件监听 | **chokidar** | 监听 slots.json / config.json 变化 |
| 头像生成 | **qwen-image skill** | 已有的文生图能力 |

## 八、实现计划

### Phase 1 — 后端 + 数据打通
1. Express 服务 + API endpoints
2. 文件采集层：watch slots.json / config.json，读 IDENTITY.md / SOUL.md
3. tmux capture-pane bridge
4. WebSocket 推送

### Phase 2 — 前端场景
1. PixiJS 等距办公室场景
2. Agent 工位 + 状态动画
3. 点击交互 + 详情面板
4. 实时输出展示

### Phase 3 — 拟人化
1. 从 MD 文件提取特征生成画图 prompt
2. 调 qwen-image 生成卡通头像
3. 头像集成到场景中

## 九、注意事项

1. **所有数据来自真实接口/文件**，零硬编码——包括 agent 数量、名字、类型、身份信息全部动态读取，有什么展示什么，没有就不展示
2. **文件路径全部从配置推导**，不写死绝对路径
3. **Gateway token** 从 `openclaw.json` 读取，不硬编码
4. **轮询频率**：slots.json 文件 watch（事件驱动），tmux capture 每 3 秒，不过度消耗资源
5. **头像缓存**：生成一次后存本地，配置变更才重新生成




补充需求-1：
1、优化整体样式 - 明亮现代化，魔都三件套窗外景观
2、黑板直接展示内容（3D 纹理）
3、程序员设备 - 横竖显示器、Mac
4、修复人物位置（不要长在桌子里）
5、优化视角控制 - 拖拽更换视角中心


补充需求-2：
1、桌子上要放一个牌子，写上人物的名字；
2、人物头部旁边，如果有进行中的任务，需要展示气泡说明。
