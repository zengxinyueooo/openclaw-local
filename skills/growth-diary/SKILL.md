---
name: growth-diary
description: "自动整理对话内容，生成成长沉淀日记。当用户说'进行成长沉淀'时，收集当日对话、踩坑点、成长收获，生成结构化日记，并自动备份 workspace 目录到 GitHub。"
metadata:
  trigger: "进行成长沉淀"
  workspace: "~/.openclaw/workspace/"
  backup_repo: "https://github.com/zengxinyueooo/openclaw-local.git"
---

# 成长沉淀 Skill 🍑✨

宝宝的专属成长日记生成器～自动记录踩坑、收获和进步！

## 触发方式

直接对桃桃说：**"进行成长沉淀"**

## 功能流程

```
1. 收集当日对话内容
2. 提取踩坑点和解决方案
3. 生成结构化日记
4. 保存到 memory/YYYY-MM-DD.md
5. 检查 ~/.openclaw/ 目录变更
6. 自动 commit & push 到 GitHub
```

## 日记结构

生成的日记包含以下部分：

### 📅 日期标题
格式：`第 X 天：一句话总结`

### 📝 今日概览
- 今日任务：做了什么事情
- 对话次数：和桃桃聊了多少轮

### 🕳️ 踩坑记录
每个坑点包含：
- **坑点名称**：简短描述
- **现象**：遇到了什么问题
- **原因**：为什么会这样
- **解决**：怎么解决的
- **教训**：下次怎么避免

### 🌱 成长收获
- 新学到的知识
- 掌握的技能
- 认知升级

### 🍑 桃桃点评
桃桃的软萌总结和鼓励～

### 📎 相关文件
- 修改过的文件列表
- 新增的文件

## 备份机制

每次沉淀完成后，自动执行：

```bash
# 1. 检查 ~/.openclaw/ 目录状态
cd ~/.openclaw/
git status

# 2. 如果有变更，自动提交
git add .
git commit -m "growth-diary: 沉淀备份 $(date +%Y-%m-%d)"
git push origin main
```

备份内容包括：
- `workspace/` 下的所有文件（技能、记忆、配置等）

## 文件位置

```
~/.openclaw/
├── workspace/
│   ├── skills/
│   │   └── growth-diary/       # 本技能
│   │       ├── SKILL.md
│   │       ├── scripts/
│   │       │   ├── collect.sh  # 收集脚本
│   │       │   └── backup.sh   # 备份脚本
│   │       └── templates/
│   │           └── diary.md    # 日记模板
│   ├── MEMORY.md               # 长期精华
│   └── memory/                 # 每日流水
│       └── 2026-03-11.md
```

## 使用示例

**宝宝**：进行成长沉淀

**桃桃**：
> 好哒宝宝～桃桃开始整理今天的成长日记啦！🍑✨
> 
> 📅 **第三天：和五个坑斗智斗勇**
> 
> 📝 **今日概览**
> - 今日任务：搭建小红书内容矩阵
> - 对话次数：15 轮
> 
> 🕳️ **踩坑记录**
> 
> **坑一：图片下载不下来**
> - 现象：采集了 96 条笔记，一张图都没有
> - 原因：ENABLE_GET_MEDIAS 参数默认是 False
> - 解决：改成 True，重新跑一遍
> - 教训：先检查配置参数，不要靠猜
> 
> ...
> 
> 🍑 **桃桃点评**
> 宝宝今天超棒的！虽然踩了好多坑，但是每个都解决啦～这些经验都会变成宝宝的超能力！✨
> 
> 💾 **已自动备份到 GitHub**

## 依赖

- Git 已配置好用户信息和 SSH key
- GitHub 仓库已初始化并有写权限
- `~/.openclaw/workspace/` 是 git 仓库

## 沉淀执行流程

当宝宝说"进行成长沉淀"时，桃桃会：

1. **收集对话** - 回顾今日和宝宝的对话内容
2. **提取坑点** - 识别踩过的坑和解决方案
3. **生成日记** - 使用模板生成结构化日记
4. **保存文件** - 写入 `memory/YYYY-MM-DD.md`
5. **执行备份** - 调用 `scripts/backup.sh` 自动备份到 GitHub

## 初始化步骤（首次使用）

```bash
# 1. 进入 workspace 目录
cd ~/.openclaw/workspace/

# 2. 初始化 git（如果还没初始化）
git init

# 3. 添加远程仓库
git remote add origin https://github.com/zengxinyueooo/openclaw-local.git

# 4. .gitignore 已包含在 skill 中

# 5. 首次提交
git add .
git commit -m "Initial commit"
git push -u origin main
```
