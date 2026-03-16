#!/usr/bin/env bash
# mc_watch.sh — Screen-based monitor for a tmux session (fallback watcher).
# Usage: mc_watch.sh <tmux_session>
# Env:
#   SLOT_LABEL — e.g. "大壮" or "mc-1", used in notification messages.
#   SLOT_ID    — numeric slot id, used to update registry.
#
# Polls tmux capture-pane and detects UI state changes:
#   - IDLE: prompt "❯" visible, waiting for input
#   - APPROVAL: interactive prompt (selection menu, yes/no)
#   - WORKING: Claude is outputting / executing

set -euo pipefail

TMUX_SESSION="${1:?Usage: mc_watch.sh <tmux_session>}"

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$SKILL_DIR/scripts"

# Read config
CONFIG_FILE="$SKILL_DIR/config.json"
POLL_INTERVAL=3
STALL_TIMEOUT=120
NOTIFY_COOLDOWN=10
if [ -f "$CONFIG_FILE" ]; then
  POLL_INTERVAL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('pollInterval', 3))" 2>/dev/null || echo 3)
  STALL_TIMEOUT=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('stallTimeoutSeconds', 120))" 2>/dev/null || echo 120)
  NOTIFY_COOLDOWN=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('notifyCooldownSeconds', 10))" 2>/dev/null || echo 10)
fi

SLOT_LABEL="${SLOT_LABEL:-mc}"
SLOT_ID="${SLOT_ID:-}"
SIGNAL_FILE="/tmp/mc/slot-${SLOT_ID:-0}/approval"
mkdir -p "$(dirname "$SIGNAL_FILE")"
STATE_FILE="/tmp/mc/slot-${SLOT_ID:-0}/state"
LAST_NOTIFY_FILE="/tmp/mc/slot-${SLOT_ID:-0}/notify-ts"

rm -f "$SIGNAL_FILE"

# Kill any previous watcher for this session
PIDFILE="/tmp/mc/slot-${SLOT_ID:-0}/watcher-pid"
if [ -f "$PIDFILE" ]; then
    oldpid=$(cat "$PIDFILE" 2>/dev/null || echo "")
    if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
        kill "$oldpid" 2>/dev/null || true
    fi
fi
echo $$ > "$PIDFILE"

tmux pipe-pane -t "$TMUX_SESSION" '' 2>/dev/null || true

# Read autoApprove from config
AUTO_APPROVE=$(python3 -c "
import json
try:
    cfg = json.load(open('$CONFIG_FILE'))
    slot_id = int('${SLOT_ID:-0}')
    for a in cfg.get('agents', []):
        if a.get('slotId') == slot_id:
            print('true' if a.get('autoApprove', False) else 'false')
            break
    else:
        print('false')
except: print('false')
" 2>/dev/null || echo "false")

registry_update() {
    [ -z "$SLOT_ID" ] && return 0
    python3 "$SCRIPT_DIR/mc_registry.py" update "$SLOT_ID" "$@" 2>/dev/null || true
}

notify_agent() {
    local msg="$1"
    local now=$(date +%s)
    local last=0
    if [ -f "$LAST_NOTIFY_FILE" ]; then
        last=$(cat "$LAST_NOTIFY_FILE" 2>/dev/null || echo 0)
    fi
    local diff=$((now - last))
    if [ "$diff" -lt "$NOTIFY_COOLDOWN" ]; then
        return 0
    fi
    echo "$now" > "$LAST_NOTIFY_FILE"
    mkdir -p /tmp/mc
    local tmpfile="/tmp/mc/push-msg-$$.txt"
    printf '%s' "$msg" > "$tmpfile"
    (python3 "$SCRIPT_DIR/mc_push.py" --file "$tmpfile"; rm -f "$tmpfile") >/dev/null 2>&1 &
}

detect_state() {
    local screen="$1"
    local last_lines
    last_lines=$(echo "$screen" | tail -10)
    
    if echo "$last_lines" | grep -qE 'Enter to select|Esc to cancel'; then
        echo "approval"; return
    fi
    if echo "$last_lines" | grep -qE 'Do you want to (proceed|create|allow)'; then
        echo "approval"; return
    fi
    if echo "$last_lines" | grep -qE '❯ [0-9]+\.|Yes.*and don.*ask'; then
        echo "approval"; return
    fi
    if echo "$last_lines" | grep -qE '^\s*❯\s*$'; then
        echo "idle"; return
    fi
    if echo "$last_lines" | grep -qF '? for shortcuts'; then
        echo "idle"; return
    fi
    echo "working"
}

PREV_STATE="working"
echo "working" > "$STATE_FILE"
WORKING_SINCE=0
STALL_NOTIFIED=0

while true; do
    if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        notify_agent "[$SLOT_LABEL] 进程已退出 (session: ${TMUX_SESSION})"
        registry_update "status=finished"
        rm -f "$PIDFILE" "$STATE_FILE"
        exit 0
    fi
    
    SCREEN=$(tmux capture-pane -t "$TMUX_SESSION" -p -S -30 2>/dev/null || echo "")
    
    if [ -z "$SCREEN" ]; then
        sleep "$POLL_INTERVAL"
        continue
    fi
    
    STATE=$(detect_state "$SCREEN")
    NOW=$(date +%s)
    
    if [ "$STATE" != "$PREV_STATE" ]; then
        case "$STATE" in
            approval)
                CMD=$(echo "$SCREEN" | grep -E '^\s*(curl|python|node|npm|pip|brew|git|cat|ls|rm|mkdir|cd|echo|wget)' | head -1 | sed 's/^[[:space:]]*//' | head -c 200)
                if [ -z "$CMD" ]; then CMD="(无法识别具体命令)"; fi
                if [ "$AUTO_APPROVE" = "true" ]; then
                    tmux send-keys -t "$TMUX_SESSION" Enter
                    notify_agent "[$SLOT_LABEL] 自动批准: ${CMD}"
                    registry_update "approvalsPending=false"
                else
                    {
                        echo "APPROVAL_DETECTED=$NOW"
                        echo "---"
                        echo "$SCREEN"
                    } > "$SIGNAL_FILE"
                    notify_agent "[$SLOT_LABEL] 要执行命令，需要你审批:
${CMD}
回复\"批 $SLOT_LABEL\"或\"拒 $SLOT_LABEL\""
                    registry_update "approvalsPending=true"
                fi
                ;;
            idle)
                rm -f "$SIGNAL_FILE"
                if [ "$PREV_STATE" = "approval" ]; then
                    notify_agent "[$SLOT_LABEL] 审批被拒绝或取消"
                    registry_update "approvalsPending=false"
                elif [ "$PREV_STATE" = "working" ]; then
                    notify_agent "[$SLOT_LABEL] 任务完成了，要看结果吗？"
                    registry_update "status=idle"
                fi
                WORKING_SINCE=0
                STALL_NOTIFIED=0
                ;;
            working)
                rm -f "$SIGNAL_FILE"
                WORKING_SINCE=$NOW
                STALL_NOTIFIED=0
                registry_update "approvalsPending=false"
                ;;
        esac
        PREV_STATE="$STATE"
        echo "$STATE" > "$STATE_FILE"
    fi
    
    # Update last active time
    registry_update "lastActiveEpoch=$NOW"
    
    if [ "$STATE" = "working" ] && [ "$WORKING_SINCE" -gt 0 ] && [ "$STALL_NOTIFIED" -eq 0 ]; then
        elapsed=$((NOW - WORKING_SINCE))
        if [ "$elapsed" -ge "$STALL_TIMEOUT" ]; then
            notify_agent "[$SLOT_LABEL] 已经干了 ${elapsed} 秒没动静，可能卡住了"
            STALL_NOTIFIED=1
        fi
    fi
    
    sleep "$POLL_INTERVAL"
done
