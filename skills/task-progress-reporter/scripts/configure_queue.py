#!/usr/bin/env python3
"""Configure OpenClaw message queue for task progress reporting.

Modifies openclaw.json to enable steer-backlog mode and optionally
appends progress reporting rules to SOUL.md.

Usage:
    python3 configure_queue.py                  # Configure queue only
    python3 configure_queue.py --update-soul    # Also update SOUL.md
    python3 configure_queue.py --config PATH    # Custom openclaw.json path
    python3 configure_queue.py --workspace PATH # Custom workspace path
"""

import argparse
import json
import os
import sys

DEFAULT_CONFIG_PATH = os.path.expanduser("~/.openclaw/openclaw.json")

QUEUE_CONFIG = {
    "mode": "steer-backlog",
    "debounceMs": 1000,
    "cap": 20,
    "drop": "summarize"
}

SOUL_BLOCK = """
## 任务中断与进度汇报

当我正在执行长任务时收到新消息（steer 插入）：

**如果是问进度**（包括但不限于："在吗"、"到哪了"、"进度怎么样"、"还要多久"、"做到哪了"、"在干嘛"、"搞完了吗"等）：
→ **立即用 `message` 工具发送一条进度消息**（不能只写在回复文本里，必须调 message 工具确保送达）
→ 内容：当前正在做什么、已完成哪些步骤、预计还需多久
→ 发完后继续原任务

**如果是其他内容**（新任务、新问题、闲聊等）：
→ 回复"正在处理 XXX，完成后马上处理你的消息"，不打断原任务，优先完成当前工作
"""


def configure_queue(config_path: str) -> bool:
    """Add steer-backlog queue config to openclaw.json."""
    if not os.path.exists(config_path):
        print(f"❌ Config file not found: {config_path}", file=sys.stderr)
        return False

    with open(config_path, "r") as f:
        config = json.load(f)

    # Preserve existing messages config
    if "messages" not in config:
        config["messages"] = {}

    old_queue = config["messages"].get("queue", {})
    config["messages"]["queue"] = QUEUE_CONFIG

    with open(config_path, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    if old_queue:
        print(f"✅ Updated messages.queue in {config_path}")
        print(f"   Previous: {json.dumps(old_queue)}")
    else:
        print(f"✅ Added messages.queue to {config_path}")
    print(f"   Current:  {json.dumps(QUEUE_CONFIG)}")
    return True


def update_soul(workspace_path: str) -> bool:
    """Append progress reporting rules to SOUL.md."""
    soul_path = os.path.join(workspace_path, "SOUL.md")

    if not os.path.exists(soul_path):
        print(f"❌ SOUL.md not found: {soul_path}", file=sys.stderr)
        print("   Create SOUL.md first, then re-run with --update-soul", file=sys.stderr)
        return False

    with open(soul_path, "r") as f:
        content = f.read()

    if "任务中断与进度汇报" in content:
        print(f"⚠️  SOUL.md already contains progress reporting rules, skipping")
        return True

    with open(soul_path, "a") as f:
        f.write(SOUL_BLOCK)

    print(f"✅ Appended progress reporting rules to {soul_path}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Configure task progress reporting")
    parser.add_argument("--config", default=DEFAULT_CONFIG_PATH,
                        help=f"Path to openclaw.json (default: {DEFAULT_CONFIG_PATH})")
    parser.add_argument("--workspace", default=None,
                        help="Workspace path containing SOUL.md")
    parser.add_argument("--update-soul", action="store_true",
                        help="Also update SOUL.md with progress reporting rules")
    args = parser.parse_args()

    print("🔧 Configuring task progress reporter...\n")

    # Step 1: Configure queue
    ok = configure_queue(args.config)
    if not ok:
        sys.exit(1)

    # Step 2: Update SOUL.md if requested
    if args.update_soul:
        if not args.workspace:
            # Try to find workspace from config
            with open(args.config, "r") as f:
                config = json.load(f)
            agents = config.get("agents", {}).get("list", [])
            if agents:
                ws = agents[0].get("workspace")
                if ws:
                    args.workspace = os.path.expanduser(ws)
            if not args.workspace:
                print("\n❌ Cannot determine workspace path. Use --workspace PATH", file=sys.stderr)
                sys.exit(1)

        print()
        update_soul(args.workspace)

    print("\n📋 Next steps:")
    print("   1. Reload Gateway: kill -USR1 $(pgrep openclaw-gateway)")
    print("   2. Or restart:     openclaw gateway restart")
    print("   3. Test: Give the agent a long task, then ask for progress mid-task")


if __name__ == "__main__":
    main()
