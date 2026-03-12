# Claude Code 使用指南 🍊

## 快速开始

当小桃派活后，按以下步骤执行：

### 步骤1：读取任务
```bash
# 查看当前任务
cat TASKS.md
```

### 步骤2：启动 Claude Code
```bash
mc --code
```

### 步骤3：同意协议
看到提示后输入：
```
y
```

### 步骤4：发送任务
Claude Code 就绪后，直接输入任务描述，例如：
```
请写一个Python脚本，读取JSON文件并统计字段频率，用matplotlib生成柱状图。要求有命令行参数和错误处理。
```

### 步骤5：等待完成
让 Claude Code 自动执行，它会：
- 分析需求
- 创建文件
- 编写代码
- 测试运行

### 步骤6：更新进度
在另一个终端，使用 progress_reporter 上报进度：
```python
from progress_reporter import ProgressReporter
reporter = ProgressReporter("coder", "task-001")
reporter.complete("任务完成", {"file": "xxx.py"})
```

### 步骤7：标记完成
更新 TASKS.md，将任务移到"已完成"部分。

## 常见问题

**Q: Claude Code 卡住怎么办？**
A: 按 Ctrl+C 退出，重新启动。

**Q: 如何查看 Claude Code 的输出？**
A: 所有输出会显示在终端，可以复制保存。

**Q: 任务太复杂怎么办？**
A: 拆分成多个小任务，分批执行。
