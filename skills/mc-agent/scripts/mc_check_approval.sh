#!/usr/bin/env bash
# mc_check_approval.sh — Check if any mc agent has a pending approval.
# Usage: mc_check_approval.sh [tmux_session]
#
# Three-layer detection:
#   1. Registry approvalsPending flag (fastest)
#   2. Signal file from watcher (fast)
#   3. Fallback: capture-pane pattern match (reliable)
#
# Reports which agent(s) need approval with aliases.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$SKILL_DIR/scripts"

APPROVAL_PATTERN='Esc to cancel|Do you want to proceed|Do you want to create|Enter to confirm|trust this folder|safety check|requires approval|want to allow|permission.*prompt|approve.*command|Yes, I trust|❯ 1\.|❯ 2\.|❯ 3\.'

check_session() {
    local session="$1"
    local slot_label="${2:-$session}"
    local slot_id="${3:-}"
    local found=0

    # Layer 1: signal file (by slot id)
    if [[ -n "$slot_id" && -f "/tmp/mc/slot-${slot_id}/approval" ]]; then
        echo "⚠️ [$slot_label] APPROVAL NEEDED (signal)"
        echo ""
        cat "/tmp/mc/slot-${slot_id}/approval"
        return 0
    fi

    # Layer 2: capture-pane fallback
    if tmux has-session -t "$session" 2>/dev/null; then
        local last_lines
        last_lines=$(tmux capture-pane -t "$session" -p -S -15 2>/dev/null || true)
        if [[ -n "$last_lines" ]] && echo "$last_lines" | grep -qiE "$APPROVAL_PATTERN"; then
            echo "⚠️ [$slot_label] APPROVAL NEEDED (pane)"
            echo ""
            echo "$last_lines" | tail -20
            return 0
        fi
    fi

    return 1
}

# If specific session given
if [[ -n "${1:-}" ]]; then
    if check_session "$1" "$1"; then
        exit 0
    else
        echo "No pending approval for session: $1"
        exit 1
    fi
fi

# Layer 0: Check registry first for quick answer
REGISTRY_PENDING=$(python3 -c "
import json
try:
    with open('$HOME/.openclaw/workspace/skills/mc-agent/slots.json') as f:
        data = json.load(f)
    found = False
    for sid, slot in data.items():
        if slot.get('approvalsPending'):
            alias = slot.get('alias', f'mc-{sid}')
            print(f'⚠️ [{alias}] APPROVAL NEEDED (registry)')
            print(f'  tmux: {slot.get(\"tmuxSession\", \"?\")}')
            found = True
    if not found:
        print('NO_REGISTRY_PENDING')
except Exception as e:
    print(f'REGISTRY_ERROR: {e}')
" 2>/dev/null || echo "REGISTRY_ERROR")

if echo "$REGISTRY_PENDING" | grep -q "APPROVAL NEEDED"; then
    echo "$REGISTRY_PENDING"
    echo ""
    echo "--- Verifying with tmux ---"
fi

# Check all running agents via registry
FOUND=0
SESSIONS_INFO=$(python3 -c "
import json
try:
    with open('$HOME/.openclaw/workspace/skills/mc-agent/slots.json') as f:
        data = json.load(f)
    for sid, slot in data.items():
        if slot.get('status') in ('running', 'idle'):
            alias = slot.get('alias', f'mc-{sid}')
            print(f'{slot.get(\"tmuxSession\", \"\")}|{alias}|{sid}')
except: pass
" 2>/dev/null || true)

if [ -n "$SESSIONS_INFO" ]; then
    while IFS='|' read -r session slot_label slot_id; do
        [ -z "$session" ] && continue
        if check_session "$session" "$slot_label" "$slot_id"; then
            echo ""
            echo "---"
            FOUND=1
        fi
    done <<< "$SESSIONS_INFO"
fi

# Also scan signal files for any we might have missed
for f in /tmp/mc/slot-*/approval; do
    [[ -f "$f" ]] || continue
    # Extract slot id from path: /tmp/mc/slot-N/approval → N
    slot_dir=$(basename "$(dirname "$f")")
    orphan_slot_id="${slot_dir#slot-}"
    # Skip if already checked via registry
    if [ -n "${SESSIONS_INFO:-}" ] && echo "$SESSIONS_INFO" | grep -q "|${orphan_slot_id}$"; then
        continue
    fi
    echo "⚠️ [mc-${orphan_slot_id}] APPROVAL NEEDED (orphan signal)"
    echo ""
    cat "$f"
    echo ""
    echo "---"
    FOUND=1
done

if [[ $FOUND -eq 0 ]]; then
    echo "No pending approvals across all mc agents."
    exit 1
fi
exit 0
