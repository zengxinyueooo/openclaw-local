#!/usr/bin/env bash
# mc_approve.sh — Send approval key to mc tmux session.
# This script is the ONLY way the agent should ever send approval keys.
#
# Usage: mc_approve.sh <tmux_session> [choice] [--slot <slot_id>]
#   choice: 1, 2, or 3 (default: 1 = Yes)
#   Use "reject" or "esc" to send Escape
#
# RULE: The agent must NEVER call this script unless the user has
# EXPLICITLY said to approve (e.g. "批了", "行", "批", "ok", "yes").
# If unsure, DO NOT CALL. Ask the user first.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$SKILL_DIR/scripts"

SESSION="${1:?Usage: mc_approve.sh <tmux_session> [choice] [--slot <slot_id>]}"
CHOICE="${2:-1}"
SLOT_ID=""

# Parse --slot flag
for i in "$@"; do
  if [[ "$i" == "--slot" ]]; then
    shift_next=1
  elif [[ "${shift_next:-}" == "1" ]]; then
    SLOT_ID="$i"
    shift_next=0
  fi
done

# Try to find slot ID from registry if not provided
if [ -z "$SLOT_ID" ]; then
  SLOT_ID=$(python3 -c "
import json
try:
    with open('$HOME/.openclaw/workspace/skills/mc-agent/slots.json') as f:
        data = json.load(f)
    for sid, slot in data.items():
        if slot.get('tmuxSession') == '$SESSION':
            print(sid)
            break
except: pass
" 2>/dev/null || true)
fi

if [[ "$CHOICE" == "reject" || "$CHOICE" == "esc" || "$CHOICE" == "no" ]]; then
    tmux send-keys -t "$SESSION" Escape
    echo "REJECTED: Sent Escape to $SESSION"
    # Clean up signal file
    rm -f "/tmp/mc/slot-${SLOT_ID}/approval" 2>/dev/null; rm -f "/tmp/mc-approval-${SESSION}"
    # Update registry
    if [ -n "$SLOT_ID" ]; then
      python3 "$SCRIPT_DIR/mc_registry.py" update "$SLOT_ID" "approvalsPending=false" 2>/dev/null || true
    fi
    exit 0
fi

# Navigate to the right choice if not 1
if [[ "$CHOICE" == "2" ]]; then
    tmux send-keys -t "$SESSION" Down Enter
elif [[ "$CHOICE" == "3" ]]; then
    tmux send-keys -t "$SESSION" Down Down Enter
else
    tmux send-keys -t "$SESSION" Enter
fi

echo "APPROVED: Sent choice $CHOICE to $SESSION"
# Clean up signal file
rm -f "/tmp/mc/slot-${SLOT_ID}/approval" 2>/dev/null; rm -f "/tmp/mc-approval-${SESSION}"

# Update registry: clear pending, increment approval count
if [ -n "$SLOT_ID" ]; then
  python3 -c "
import sys
sys.path.insert(0, '$SCRIPT_DIR')
from mc_registry import Registry
reg = Registry()
reg.record_approval(int('$SLOT_ID'))
reg.update_slot(int('$SLOT_ID'), approvalsPending=False)
" 2>/dev/null || true
fi
