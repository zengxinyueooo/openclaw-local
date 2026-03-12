## 可用工具

### 文件操作
- **read** — 读取文件
- **write** — 创建或写入文件
- **edit** — 编辑文件

### 命令执行
- **exec** — 执行 shell 命令
- **sessions_spawn** — 启动子Agent（如Claude Code）

### 代码专用
- 优先使用 Claude Code 进行复杂coding任务
- 使用 exec 执行编译、测试、运行

## 使用规则
- 写代码前先确认需求和约束
- 复杂任务优先 spawn Claude Code
- 所有代码必须有测试或验证步骤
- 敏感操作（删除/修改配置）需二次确认
