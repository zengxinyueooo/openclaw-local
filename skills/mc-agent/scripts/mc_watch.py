#!/usr/bin/env python3
"""mc_watch.py — Monitor Claude Code jsonl logs and push notifications via chat.inject.

Usage: mc_watch.py <project_dir_pattern> [poll_interval_seconds]

Env:
  SLOT_LABEL — e.g. "大壮" or "mc-1", used in notification messages.
  SLOT_ID    — numeric slot id, used to update registry.

Tails the latest .jsonl file in the Claude Code project directory.
Detects:
  - tool_use (approval needed): pushes command details
  - assistant text after tool results (task complete): pushes summary
  - tool_result rejected: pushes rejection notice

Updates mc_registry.py with real-time status (approvalsPending, lastActiveEpoch).
"""

import json, sys, os, time, glob, subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PUSH_SCRIPT = os.path.join(SCRIPT_DIR, "mc_push.py")

# Read config
CONFIG_FILE = os.path.join(os.path.dirname(SCRIPT_DIR), "config.json")
config = {}
try:
    with open(CONFIG_FILE) as f:
        config = json.load(f)
except Exception:
    pass

COOLDOWN = config.get("notifyCooldownSeconds", 10)
SLOT_LABEL = os.environ.get("SLOT_LABEL", "mc")
SLOT_ID = os.environ.get("SLOT_ID", "")
last_notify_ts = 0


def _is_auto_approve() -> bool:
    """Check if this slot has autoApprove enabled in config."""
    slot_id = int(SLOT_ID) if SLOT_ID else 0
    for agent in config.get("agents", []):
        if agent.get("slotId") == slot_id:
            return agent.get("autoApprove", False)
    return False


def _auto_approve(tmux_session: str):
    """Send Enter to tmux session to auto-approve.
    Small delay to ensure Claude Code's approval UI is fully rendered."""
    try:
        time.sleep(1)  # Wait for approval UI to render
        subprocess.run(
            ["tmux", "send-keys", "-t", tmux_session, "Enter"],
            capture_output=True, timeout=3,
        )
    except Exception as e:
        print(f"Auto-approve failed: {e}", file=sys.stderr)


AUTO_APPROVE = _is_auto_approve()


def _get_tmux_session() -> str:
    """Get tmux session name for this slot from registry."""
    if not SLOT_ID:
        return ""
    try:
        sys.path.insert(0, SCRIPT_DIR)
        from mc_registry import Registry
        reg = Registry()
        slot = reg.get_slot(int(SLOT_ID))
        return slot.get("tmuxSession", "") if slot else ""
    except Exception:
        return ""


def _registry_update(slot_id: str, **kwargs):
    """Update registry for this slot (best-effort)."""
    if not slot_id:
        return
    try:
        sys.path.insert(0, SCRIPT_DIR)
        from mc_registry import Registry
        reg = Registry()
        updates = {k: v for k, v in kwargs.items()}
        reg.update_slot(int(slot_id), **updates)
    except Exception as e:
        print(f"Registry update failed: {e}", file=sys.stderr)


def push(msg: str, force: bool = False):
    """Send notification via mc_push.py. force=True bypasses cooldown."""
    global last_notify_ts
    now = time.time()
    if not force and now - last_notify_ts < COOLDOWN:
        return
    last_notify_ts = now
    try:
        subprocess.Popen(
            [sys.executable, PUSH_SCRIPT, msg],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        print(f"Push failed: {e}", file=sys.stderr)


def find_latest_jsonl(project_dir: str) -> str:
    """Find the most recently modified .jsonl file in the project dir."""
    pattern = os.path.join(project_dir, "*.jsonl")
    files = glob.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getmtime)


def extract_tool_command(content_item: dict) -> str:
    """Extract a human-readable summary from a tool_use content item."""
    name = content_item.get("name", "Tool")
    inp = content_item.get("input", {})
    # Bash: has "command"
    cmd = inp.get("command", "")
    if cmd:
        return f"{name}: {cmd}"
    # Write/Edit: has "file_path"
    fp = inp.get("file_path", "")
    if fp:
        return f"{name}: {fp}"
    # Other tools: summarize input keys
    if inp:
        summary = ", ".join(f"{k}={str(v)[:50]}" for k, v in inp.items())
        return f"{name}: {summary}"
    return f"{name}: (no details)"


def process_line(line: str, state: dict):
    """Process a single jsonl line and push notifications as needed."""
    try:
        obj = json.loads(line.strip())
    except (json.JSONDecodeError, ValueError):
        return

    t = obj.get("type", "")

    if t == "assistant":
        msg = obj.get("message", {})
        stop_reason = msg.get("stop_reason", "")
        content = msg.get("content", [])
        if not isinstance(content, list):
            return

        for item in content:
            if not isinstance(item, dict):
                continue
            item_type = item.get("type", "")

            if item_type == "tool_use":
                cmd = extract_tool_command(item)
                state["pending_tool"] = cmd
                state["waiting_approval"] = True
                inp = item.get("input", {})
                name = item.get("name", "Tool")

                # Build a readable summary of the tool input
                raw_cmd = inp.get("command", "") or inp.get("file_path", "") or json.dumps(inp, ensure_ascii=False)[:200]

                # Save full input to file for on-demand viewing
                cmd_dir = f"/tmp/mc/{SLOT_LABEL}"
                os.makedirs(cmd_dir, exist_ok=True)
                cmd_file = f"{cmd_dir}/last-command.txt"
                with open(cmd_file, "w") as f:
                    f.write(json.dumps(inp, ensure_ascii=False, indent=2))

                if AUTO_APPROVE:
                    tmux_sess = _get_tmux_session()
                    if tmux_sess:
                        _auto_approve(tmux_sess)
                        state["waiting_approval"] = False
                        preview = raw_cmd.split("\n")[0].strip()[:80]
                        push(f"[{SLOT_LABEL}] 自动批准: {name} — {preview}")
                        _registry_update(SLOT_ID, approvalsPending=False)
                else:
                    preview = raw_cmd.split("\n")[0].strip()[:120]
                    desc = inp.get("description", "")
                    notify_lines = [f"[{SLOT_LABEL}] 要执行 {name}，需要审批:"]
                    if desc:
                        notify_lines.append(f"说明: {desc}")
                    notify_lines.append(f"命令: {preview}")
                    notify_lines.append(f'回复"批 {SLOT_LABEL}"或"拒 {SLOT_LABEL}"')
                    notify_lines.append(f"完整命令: {cmd_file}")
                    push("\n".join(notify_lines))
                    _registry_update(SLOT_ID, approvalsPending=True)

            elif item_type == "text":
                text = item.get("text", "").strip()
                if text:
                    state["last_result"] = text[:300]
                    # Only notify completion when stop_reason is end_turn
                    if stop_reason == "end_turn" and not state.get("idle_notified"):
                        push(f"[{SLOT_LABEL}] 任务完成了，要看结果吗？", force=True)
                        state["idle_notified"] = True
                        _registry_update(SLOT_ID, status="idle")

    elif t == "user":
        msg = obj.get("message", {})
        content = msg.get("content", "")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "tool_result":
                    result_content = str(item.get("content", ""))
                    if "rejected" in result_content.lower():
                        state["waiting_approval"] = False
                        push(f"[{SLOT_LABEL}] 审批被拒绝，任务未执行")
                        _registry_update(SLOT_ID, approvalsPending=False)
                    else:
                        state["waiting_approval"] = False
                        state["idle_notified"] = False
                        _registry_update(SLOT_ID, approvalsPending=False)
        elif isinstance(content, str) and content.strip():
            # New user prompt — reset state
            state["waiting_approval"] = False
            state["last_result"] = None
            state["has_final_text"] = False
            state["idle_notified"] = False
            _registry_update(SLOT_ID, approvalsPending=False, status="running")

    elif t == "system":
        if state.get("has_final_text") and not state.get("idle_notified"):
            push(f"[{SLOT_LABEL}] 任务完成了，要看结果吗？", force=True)
            state["idle_notified"] = True
            state["has_final_text"] = False
            _registry_update(SLOT_ID, status="idle")

    # Update last active time on any event
    _registry_update(SLOT_ID, lastActiveEpoch=time.time())


def find_project_dir(pattern: str) -> str:
    """Find the Claude Code project directory matching pattern.
    
    Claude Code project key rule: realpath -> replace / with - -> replace . with -
    e.g. /Users/foo/.openclaw/workspace -> -Users-foo--openclaw-workspace
    """
    base = os.path.expanduser("~/.claude/projects")
    if os.path.isdir(pattern):
        return pattern
    direct = os.path.join(base, pattern)
    if os.path.isdir(direct):
        return direct
    # Apply Claude Code's key rule: . -> - (not delete)
    dashed = pattern.replace(".", "-")
    if dashed != pattern:
        direct2 = os.path.join(base, dashed)
        if os.path.isdir(direct2):
            return direct2
    # Fuzzy match
    matches = glob.glob(os.path.join(base, f"*{pattern}*"))
    dirs = [m for m in matches if os.path.isdir(m)]
    if not dirs and dashed != pattern:
        matches = glob.glob(os.path.join(base, f"*{dashed}*"))
        dirs = [m for m in matches if os.path.isdir(m)]
    if dirs:
        return max(dirs, key=os.path.getmtime)
    return None


def tail_jsonl(target: str, poll_interval: float = 2.0):
    """Tail a jsonl file or find latest in a project dir. Processing new lines.
    target: either a direct .jsonl file path, or a project directory."""
    state = {
        "waiting_approval": False,
        "pending_tool": None,
        "last_result": None,
        "idle_notified": False,
    }

    # Determine if target is a file or directory
    pinned_file = target if target.endswith(".jsonl") and os.path.isfile(target) else None
    project_dir = None if pinned_file else target

    current_file = None
    current_pos = 0

    while True:
        if pinned_file:
            latest = pinned_file
        else:
            latest = find_latest_jsonl(project_dir)

        if not latest:
            time.sleep(poll_interval)
            continue

        if latest != current_file:
            current_file = latest
            current_pos = os.path.getsize(current_file)
            state["waiting_approval"] = False
            state["last_result"] = None
            state["has_final_text"] = False
            state["idle_notified"] = False

            # Update jsonl path in registry
            if SLOT_ID:
                _registry_update(SLOT_ID, jsonlPath=current_file)
            print(f"[{SLOT_LABEL}] Tailing: {current_file} (pos={current_pos})", file=sys.stderr)

        try:
            size = os.path.getsize(current_file)
            if size > current_pos:
                with open(current_file, "r") as f:
                    f.seek(current_pos)
                    new_data = f.read()
                    current_pos = f.tell()

                lines_count = 0
                for line in new_data.strip().split("\n"):
                    if line.strip():
                        process_line(line, state)
                        lines_count += 1
                if lines_count:
                    print(f"[{SLOT_LABEL}] Processed {lines_count} lines, pos={current_pos}", file=sys.stderr)

        except (FileNotFoundError, PermissionError):
            current_file = None

        time.sleep(poll_interval)


def main():
    if len(sys.argv) < 2:
        print("Usage: mc_watch.py <jsonl_file_or_project_dir> [poll_seconds]", file=sys.stderr)
        sys.exit(1)

    target = sys.argv[1]
    poll = float(sys.argv[2]) if len(sys.argv) > 2 else 2.0

    # If it's a .jsonl file, use directly; otherwise resolve as project dir
    if target.endswith(".jsonl") and os.path.isfile(target):
        watch_target = target
    else:
        watch_target = find_project_dir(target)
        if not watch_target:
            print(f"No project dir found matching: {target}", file=sys.stderr)
            sys.exit(1)

    print(f"[{SLOT_LABEL}] Watching: {watch_target}", file=sys.stderr)
    tail_jsonl(watch_target, poll)


if __name__ == "__main__":
    main()
