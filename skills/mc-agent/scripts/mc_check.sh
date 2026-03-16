#!/bin/bash
# mc_check.sh - Check status of all mc agents via registry
# Usage: mc_check.sh [--cleanup] [--history] [--stats]
# Output: JSON summary with aliases and enriched info

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$SKILL_DIR/scripts"

CMD="status"
if [[ "${1:-}" == "--cleanup" ]]; then
  CMD="cleanup"
elif [[ "${1:-}" == "--history" ]]; then
  CMD="history"
elif [[ "${1:-}" == "--stats" ]]; then
  CMD="stats"
fi

if [ "$CMD" = "cleanup" ]; then
  python3 "$SCRIPT_DIR/mc_registry.py" cleanup
  echo ""
  echo "Current status:"
fi

if [ "$CMD" = "history" ]; then
  SLOT="${2:-}"
  if [ -n "$SLOT" ]; then
    python3 "$SCRIPT_DIR/mc_registry.py" history "$SLOT"
  else
    python3 "$SCRIPT_DIR/mc_registry.py" history
  fi
  exit 0
fi

if [ "$CMD" = "stats" ]; then
  python3 "$SCRIPT_DIR/mc_registry.py" stats
  exit 0
fi

# Get status and enrich with live tmux output for running agents
STATUS=$(python3 "$SCRIPT_DIR/mc_registry.py" status)

# For each running agent, grab last few lines of tmux output
echo "$STATUS" | python3 -c "
import json, sys, subprocess

data = json.load(sys.stdin)
for agent in data.get('agents', []):
    if agent.get('status') == 'busy' and agent.get('tmuxSession'):
        try:
            r = subprocess.run(
                ['tmux', 'capture-pane', '-t', agent['tmuxSession'], '-p', '-S', '-10'],
                capture_output=True, text=True, timeout=5
            )
            if r.returncode == 0:
                last = r.stdout.strip()[-300:]
                agent['lastOutput'] = last
        except Exception:
            pass

print(json.dumps(data, indent=2, ensure_ascii=False))
"
