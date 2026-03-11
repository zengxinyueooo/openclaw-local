#!/bin/bash
# mc_code_run.sh - Run Claude Code via mc --code inside a tmux session
# Usage: mc_code_run.sh [--slot <id>] <workdir> <prompt>
#
# MULTI-AGENT: Uses mc_registry.py for unified slot management.
# Each agent gets a slot (1, 2, 3, ...) and a unique tmux session name.
# If all slots are taken, exits with error.
# --slot <id>: prefer this slot (if free)

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$SKILL_DIR/scripts"

# Parse --slot flag
PREFERRED_SLOT=0
if [[ "${1:-}" == "--slot" ]]; then
  PREFERRED_SLOT="${2:-0}"
  shift 2
fi

WORKDIR="${1:-.}"
shift
PROMPT="$*"

if [ -z "$PROMPT" ]; then
  echo "ERROR: No prompt provided"
  echo "Usage: mc_code_run.sh [--slot <id>] <workdir> <prompt words>"
  exit 1
fi

# Allocate slot via registry
ALLOC_OUTPUT=$(python3 "$SCRIPT_DIR/mc_registry.py" allocate "$PROMPT" "$WORKDIR" "$PREFERRED_SLOT" 2>&1)
ALLOC_RC=$?

if [ $ALLOC_RC -ne 0 ]; then
  echo "ERROR: All mc agents are busy!"
  echo "$ALLOC_OUTPUT" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for b in data.get('busy', []):
        alias = b.get('alias', 'mc-?')
        task = b.get('task', '')
        print(f'  - {alias}: {task}')
except: pass
"
  exit 2
fi

# Parse allocated slot info
SLOT_ID=$(echo "$ALLOC_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['slotId'])")
ALIAS=$(echo "$ALLOC_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('alias', f'mc-{d[\"slotId\"]}'))")

echo "MODE=new"
echo "SLOT=$SLOT_ID ($ALIAS)"

# Ensure workdir exists and is a git repo (claude requires it)
mkdir -p "$WORKDIR"
if [ ! -d "$WORKDIR/.git" ]; then
  echo "INFO: Initializing git repo in $WORKDIR"
  git -C "$WORKDIR" init -q
fi

# Generate tmux session name with slot ID
TMUX_SESSION="mc-${SLOT_ID}-$(date +%s)"

# Start tmux session with mc --code (no prompt arg — avoids space-splitting bug)
tmux new-session -d -s "$TMUX_SESSION" -c "$WORKDIR" "mc --code"

# Wait for mc interactive UI to be ready (look for the ❯ prompt)
# Also handle Claude Code's "trust this folder" confirmation on first open
TRUST_HANDLED=0
for i in $(seq 1 20); do
  sleep 1
  PANE_OUT=$(tmux capture-pane -t "$TMUX_SESSION" -p 2>/dev/null || true)

  # Check for "trust this folder" confirmation dialog
  if echo "$PANE_OUT" | grep -q "Yes, I trust this folder"; then
    if [ $TRUST_HANDLED -eq 0 ]; then
      echo "INFO: Auto-confirming 'trust this folder' for $ALIAS"
      tmux send-keys -t "$TMUX_SESSION" Enter
      TRUST_HANDLED=1
      # Continue waiting for the actual ❯ prompt after confirmation
      continue
    fi
  fi

  if echo "$PANE_OUT" | grep -q '❯'; then
    break
  fi
done

# Send the original prompt with spaces intact
tmux send-keys -t "$TMUX_SESSION" "$PROMPT" Enter

# Get the PID of the mc process inside tmux
MC_PID=$(tmux list-panes -t "$TMUX_SESSION" -F '#{pane_pid}' 2>/dev/null | head -1)

# Update registry with tmux session and PID
python3 "$SCRIPT_DIR/mc_registry.py" update "$SLOT_ID" \
  "tmuxSession=$TMUX_SESSION" \
  "pid=${MC_PID:-0}"

# Try to find Claude Code session info
MC_CWD=$(tmux display-message -t "$TMUX_SESSION" -p '#{pane_current_path}' 2>/dev/null || echo "$WORKDIR")
if [ -n "$MC_CWD" ]; then
  # Claude Code project key rule: realpath -> replace / with - -> replace . with -
  RESOLVED_CWD=$(python3 -c "import os; print(os.path.realpath('$MC_CWD'))")
  PROJECT_KEY=$(echo "$RESOLVED_CWD" | sed 's|/|-|g' | sed 's|\.|-|g')

  # Wait for Claude Code to create its jsonl (up to 10s)
  JSONL_FOUND=""
  for i in $(seq 1 10); do
    sleep 1
    JSONL_FOUND=$(python3 -c "
import os, glob
base = os.path.expanduser('~/.claude/projects/$PROJECT_KEY')
if os.path.isdir(base):
    files = sorted(glob.glob(os.path.join(base, '*.jsonl')), key=os.path.getmtime, reverse=True)
    if files: print(files[0])
" 2>/dev/null || true)
    if [ -n "$JSONL_FOUND" ]; then break; fi
  done

  python3 -c "
import sys
sys.path.insert(0, '$SCRIPT_DIR')
from mc_registry import Registry
reg = Registry()
reg.set_claude_info($SLOT_ID, session_id='$PROJECT_KEY')
jsonl = '$JSONL_FOUND'
if jsonl:
    reg.set_claude_info($SLOT_ID, jsonl_path=jsonl)
" 2>/dev/null || true
fi

echo "TMUX_SESSION=$TMUX_SESSION"
echo "MC_PID=${MC_PID:-unknown}"
echo "SLOT_ID=$SLOT_ID"
echo "ALIAS=$ALIAS"
echo "INFO: $ALIAS (mc-$SLOT_ID) started in tmux session '$TMUX_SESSION'"
echo "INFO: Reconnect with: tmux attach -t $TMUX_SESSION"
