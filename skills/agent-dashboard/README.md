# Agent Dashboard - AI 办公室

一个可视化 3D 场景，展示本地运行的 AI Agent。以"写字楼办公室"为场景，每个 Agent 坐在工位上敲电脑，实时展示工作内容和进展。

## 功能特性

- **3D 办公室场景**：基于 Three.js 的精美 3D 渲染，包含办公桌、电脑、黑板、绿植等元素
- **实时状态展示**：Agent 坐在工位上，根据状态显示不同动画（敲键盘、休息、等待审批等）
- **任务黑板**：办公室墙上的黑板显示所有任务的待办/进行中/已完成状态
- **详情面板**：点击 Agent 查看详细信息、终端输出、历史任务
- **实时数据**：通过 WebSocket 实时推送状态变化

## 支持的 Agent 类型

1. **OpenClaw 主 Agent（二狗子）** - 主管，坐在中间大工位
2. **MC Agents（MC-1号、MC-2号）** - Claude Code 工人，各坐一个工位

## 技术栈

- **后端**：Node.js + Express + WebSocket
- **前端**：Three.js (3D 渲染) + Vanilla JS
- **实时通信**：WebSocket
- **文件监听**：chokidar

## 快速开始

### 1. 安装依赖

```bash
cd agent-dashboard/server
npm install
```

### 2. 启动服务

```bash
./start.sh
```

或使用 npm：

```bash
cd server
npm start
```

### 3. 访问

打开浏览器访问 http://localhost:3210

## 项目结构

```
agent-dashboard/
├── server/
│   ├── index.js              # Express 服务器 + WebSocket
│   ├── data-collector.js     # 文件监听和数据采集
│   ├── openclaw-client.js    # OpenClaw Gateway 连接
│   └── package.json
├── web/
│   ├── index.html            # 主页面
│   ├── styles.css            # 样式
│   ├── scene.js              # 3D 场景主控
│   ├── office.js             # 办公室 3D 模型
│   ├── characters.js         # Agent 角色模型和动画
│   ├── agents.js             # Agent 数据管理
│   ├── taskboard.js          # 任务黑板 UI
│   └── panel.js              # 详情面板
├── avatars/                  # 头像缓存
├── start.sh                  # 启动脚本
└── README.md
```

## API 端点

- `GET /api/agents` - 获取所有 Agent 列表和状态
- `GET /api/agents/:id` - 获取单个 Agent 详情
- `GET /api/agents/:id/output` - 获取终端输出 (tmux/jsonl)
- `GET /api/history` - 获取历史任务
- `GET /api/avatars/:id` - 获取头像图片
- `WS /live` - WebSocket 实时推送

## 数据源

| 数据 | 来源文件 |
|------|----------|
| OpenClaw 身份 | `IDENTITY.md`, `SOUL.md` |
| 用户信息 | `USER.md` |
| 模型配置 | `~/.openclaw/openclaw.json` |
| MC Agent 配置 | `skills/mc-agent/config.json` |
| MC 实时状态 | `skills/mc-agent/slots.json` |
| MC 历史任务 | `skills/mc-agent/history.json` |

## 操作说明

- **拖拽**：旋转视角
- **滚轮**：缩放
- **点击 Agent**：查看详情面板
- **点击黑板**：打开全屏任务看板
- **ESC**：关闭面板/复位视角

## 开发计划

- [x] Phase 1: 后端 + 数据打通
- [x] Phase 2: 前端 3D 场景
- [ ] Phase 3: AI 生成卡通头像
