#!/bin/bash
# mc_dispatch.sh - 多 agent 派活：分配 slot + 启动 mc + 挂 watcher + 即时查审批
# 用法: mc_dispatch.sh [--slot <id>] <workdir> <prompt>
# 
# 几秒内返回，绝不 sleep 等待（除了初始启动的必要等待）。
# 返回: 派活结果 + slot 编号 + 别名 + 审批状态
# --slot <id>: prefer this slot (if free)

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$SKILL_DIR/scripts"

# Parse --slot flag
SLOT_FLAG=""
if [[ "${1:-}" == "--slot" ]]; then
  SLOT_FLAG="--slot ${2:-0}"
  shift 2
fi

WORKDIR="${1:-.}"
shift
PROMPT="$*"

if [ -z "$PROMPT" ]; then
  echo "ERROR: No prompt provided"
  exit 1
fi

echo "=== STEP 0: 清理无效 slot / 重启死掉的 watcher ==="
python3 -c "
import sys, os, subprocess, time
sys.path.insert(0, '$SCRIPT_DIR')
from mc_registry import Registry
reg = Registry()
slots = reg.get_all().get('slots', {})
cleaned = 0
restarted = 0
for slot_id_str, slot in list(slots.items()):
    slot_id = int(slot_id_str)
    tmux = slot.get('tmuxSession', '')
    if not tmux:
        continue
    # Check tmux session
    rc = subprocess.run(['tmux', 'has-session', '-t', tmux], capture_output=True).returncode
    if rc != 0:
        reg.finish_slot(slot_id, outcome='stale_cleanup')
        cleaned += 1
        print(f'  清理 slot {slot_id}: tmux session {tmux} 不存在')
        continue
    # tmux alive, check watcher
    watcher_pid = slot.get('watcherPid', 0)
    watcher_alive = False
    if watcher_pid:
        try:
            os.kill(int(watcher_pid), 0)
            watcher_alive = True
        except (OSError, ValueError):
            pass
    if not watcher_alive:
        # Restart watcher
        alias = slot.get('alias', f'mc-{slot_id}')
        jsonl = slot.get('jsonlPath', '')
        watch_target = jsonl if jsonl and os.path.isfile(jsonl) else slot.get('claudeSessionId', '')
        if watch_target:
            log_path = f'/tmp/mc/slot-{slot_id}/watcher-debug.log'
            os.makedirs(f'/tmp/mc/slot-{slot_id}', exist_ok=True)
            env = os.environ.copy()
            env['SLOT_LABEL'] = alias
            env['SLOT_ID'] = str(slot_id)
            proc = subprocess.Popen(
                [sys.executable, '$SCRIPT_DIR/mc_watch.py', watch_target, '2'],
                stdout=open(log_path, 'w'), stderr=subprocess.STDOUT,
                env=env, start_new_session=True,
            )
            reg.set_watcher(slot_id, proc.pid)
            with open(f'/tmp/mc/slot-{slot_id}/watcher-pid', 'w') as f:
                f.write(str(proc.pid))
            restarted += 1
            print(f'  重启 watcher slot {slot_id} ({alias}): pid {proc.pid}')
        else:
            print(f'  slot {slot_id} ({alias}): watcher 挂了但找不到 jsonl，无法重启')

if cleaned == 0 and restarted == 0:
    print('  所有 slot 状态正常')
" 2>/dev/null || true

echo ""
echo "=== STEP 1: 分配 slot + 派活 ==="
RUN_OUTPUT=$(bash "$SCRIPT_DIR/mc_code_run.sh" $SLOT_FLAG "$WORKDIR" "$PROMPT" 2>&1)
echo "$RUN_OUTPUT"

# Check if all slots are full
if echo "$RUN_OUTPUT" | grep -q "^ERROR: All"; then
  echo ""
  echo "=== DONE (FULL) ==="
  echo "所有 mc agent 都在忙，告诉用户等一个干完再派。"
  exit 0
fi

# Extract session name, slot ID, and alias from output
TMUX_SESSION=$(echo "$RUN_OUTPUT" | grep "^TMUX_SESSION=" | cut -d= -f2)
SLOT_ID=$(echo "$RUN_OUTPUT" | grep "^SLOT_ID=" | cut -d= -f2)
ALIAS=$(echo "$RUN_OUTPUT" | grep "^ALIAS=" | cut -d= -f2)

if [ -z "$TMUX_SESSION" ]; then
  echo ""
  echo "=== ERROR ==="
  echo "无法获取 tmux session 名，派活可能失败了"
  exit 1
fi

SLOT_LABEL="${ALIAS:-mc-${SLOT_ID}}"

echo ""
echo "=== STEP 2: 挂 watcher ($SLOT_LABEL / mc-$SLOT_ID) ==="

# Kill any old watcher for THIS slot specifically
mkdir -p "/tmp/mc/slot-${SLOT_ID}"
OLD_WATCHER_PID=$(cat "/tmp/mc/slot-${SLOT_ID}/watcher-pid" 2>/dev/null || true)
if [ -n "$OLD_WATCHER_PID" ] && kill -0 "$OLD_WATCHER_PID" 2>/dev/null; then
  kill "$OLD_WATCHER_PID" 2>/dev/null || true
  sleep 0.3
fi

# Find the specific jsonl file for this mc session from registry
JSONL_PATH=$(python3 -c "
import sys
sys.path.insert(0, '$SCRIPT_DIR')
from mc_registry import Registry
reg = Registry()
slot = reg.get_slot($SLOT_ID)
if slot and slot.get('jsonlPath'):
    print(slot['jsonlPath'])
else:
    # Fallback: find latest jsonl by session id
    sid = slot.get('claudeSessionId', '') if slot else ''
    if sid:
        jp = reg._find_jsonl_path(sid)
        if jp: print(jp)
" 2>/dev/null || true)

if [ -n "$JSONL_PATH" ] && [ -f "$JSONL_PATH" ]; then
  # Pin watcher to this specific jsonl file
  SLOT_LABEL="$SLOT_LABEL" SLOT_ID="$SLOT_ID" nohup python3 "$SCRIPT_DIR/mc_watch.py" "$JSONL_PATH" 2 > "/tmp/mc/slot-${SLOT_ID}/watcher-debug.log" 2>&1 &
  WATCHER_PID=$!
  echo "$WATCHER_PID" > "/tmp/mc/slot-${SLOT_ID}/watcher-pid"
  echo "Watcher started for $SLOT_LABEL (pid: $WATCHER_PID, file: $JSONL_PATH)"
  python3 "$SCRIPT_DIR/mc_registry.py" update "$SLOT_ID" "watcherPid=$WATCHER_PID" 2>/dev/null || true
else
  # Fallback: try project dir, then screen-based watcher
  MC_CWD=$(tmux display-message -t "$TMUX_SESSION" -p '#{pane_current_path}' 2>/dev/null || echo "")
  if [ -n "$MC_CWD" ]; then
    PROJECT_KEY=$(python3 -c "import os; print(os.path.realpath('$MC_CWD').replace('/', '-').replace('.', '-'))")
    SLOT_LABEL="$SLOT_LABEL" SLOT_ID="$SLOT_ID" nohup python3 "$SCRIPT_DIR/mc_watch.py" "$PROJECT_KEY" 2 > "/tmp/mc/slot-${SLOT_ID}/watcher-debug.log" 2>&1 &
    WATCHER_PID=$!
    echo "$WATCHER_PID" > "/tmp/mc/slot-${SLOT_ID}/watcher-pid"
    echo "Watcher started for $SLOT_LABEL (pid: $WATCHER_PID, project: $PROJECT_KEY)"
    python3 "$SCRIPT_DIR/mc_registry.py" update "$SLOT_ID" "watcherPid=$WATCHER_PID" 2>/dev/null || true
  else
    echo "WARNING: Could not determine jsonl path, using screen watcher"
    SLOT_LABEL="$SLOT_LABEL" SLOT_ID="$SLOT_ID" nohup bash "$SCRIPT_DIR/mc_watch.sh" "$TMUX_SESSION" > "/tmp/mc/slot-${SLOT_ID}/watcher-debug.log" 2>&1 &
    WATCHER_PID=$!
    echo "$WATCHER_PID" > "/tmp/mc/slot-${SLOT_ID}/watcher-pid"
    echo "Screen watcher started for $SLOT_LABEL (pid: $WATCHER_PID)"
    python3 "$SCRIPT_DIR/mc_registry.py" update "$SLOT_ID" "watcherPid=$WATCHER_PID" 2>/dev/null || true
  fi
fi

echo ""
echo "=== STEP 3: 确认 watcher 存活 ==="
sleep 1
if kill -0 "$WATCHER_PID" 2>/dev/null; then
  echo "WATCHER_OK=true (pid: $WATCHER_PID)"
else
  echo "WATCHER_DEAD=true (pid: $WATCHER_PID exited)"
  echo "检查日志: cat /tmp/mc/slot-${SLOT_ID}/watcher-debug.log"
  cat "/tmp/mc/slot-${SLOT_ID}/watcher-debug.log" 2>/dev/null | tail -5
fi

echo ""
echo "=== DONE ==="
echo "SLOT_ID=$SLOT_ID"
echo "ALIAS=$ALIAS"
echo "SLOT_LABEL=$SLOT_LABEL"
echo "TMUX_SESSION=$TMUX_SESSION"
echo "以上是全部信息，立刻回复用户。"
