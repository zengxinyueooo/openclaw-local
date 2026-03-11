#!/usr/bin/env python3
"""mc_registry.py - Unified registry for mc-agent pool.

Single source of truth for all mc agent state: slots, tasks, watchers,
Claude Code sessions, history, and statistics.

Usage as module:
    from mc_registry import Registry
    reg = Registry()
    slot = reg.allocate_slot("task description", "/path/to/project")
    reg.update_slot(1, status="finished")
    info = reg.get_all()

Usage as CLI:
    python3 mc_registry.py status          # JSON summary of all slots
    python3 mc_registry.py allocate "task"  # Find free slot
    python3 mc_registry.py update 1 key=val # Update slot fields
    python3 mc_registry.py history [slot]   # Task history
    python3 mc_registry.py cleanup          # Prune old entries
"""

import json
import os
import time
import subprocess
import sys
import fcntl
from pathlib import Path
from typing import Optional, Dict, List, Any

SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent
CONFIG_FILE = SKILL_DIR / "config.json"
SLOTS_FILE = SKILL_DIR / "slots.json"
HISTORY_FILE = SKILL_DIR / "history.json"
LEGACY_REGISTRY = SKILL_DIR / "registry.json"


def _load_config() -> dict:
    """Load config.json with defaults. maxAgents derived from agents array length."""
    defaults = {
        "agents": [],
        "pollInterval": 3,
        "stallTimeoutSeconds": 120,
        "notifyCooldownSeconds": 10,
        "historyRetentionDays": 30,
        "maxHistoryPerSlot": 50,
    }
    try:
        with open(CONFIG_FILE) as f:
            cfg = json.load(f)
        defaults.update(cfg)
    except Exception:
        pass
    # Single source of truth: agent count = len(agents)
    agents = defaults.get("agents", [])
    if not agents:
        # Fallback: at least 1 default agent
        agents = [{"slotId": 1, "alias": "mc-1", "specialty": ""}]
        defaults["agents"] = agents
    defaults["maxAgents"] = len(agents)
    return defaults


def _get_alias(config: dict, slot_id: int) -> str:
    """Get alias for a slot from config, fallback to mc-N."""
    for agent in config.get("agents", []):
        if agent.get("slotId") == slot_id:
            return agent.get("alias", f"mc-{slot_id}")
    return f"mc-{slot_id}"


def _get_specialty(config: dict, slot_id: int) -> str:
    """Get specialty for a slot from config."""
    for agent in config.get("agents", []):
        if agent.get("slotId") == slot_id:
            return agent.get("specialty", "")
    return ""


class Registry:
    """Thread-safe registry for mc agent pool."""

    def __init__(self):
        self.config = _load_config()
        self.max_agents = self.config["maxAgents"]
        self._migrate_legacy()

    def _legacy_to_history(self, task: dict) -> dict:
        """Convert legacy mc-tasks.json entry to history format."""
        return {
            "slotId": task.get("slotId", 0),
            "alias": _get_alias(self.config, task.get("slotId", 0)),
            "task": task.get("task", ""),
            "workdir": task.get("workdir", ""),
            "tmuxSession": task.get("tmuxSession", ""),
            "pid": task.get("pid", 0),
            "status": task.get("status", "finished"),
            "startedAt": task.get("startedAt", ""),
            "startedEpoch": task.get("startedEpoch", 0),
            "finishedEpoch": 0,
            "durationSeconds": 0,
            "approvalCount": 0,
            "outcome": "unknown",
        }

    def _migrate_legacy(self):
        """One-time migration from old registry.json to split files."""
        if LEGACY_REGISTRY.exists() and not HISTORY_FILE.exists():
            try:
                with open(LEGACY_REGISTRY) as f:
                    old = json.load(f)
                # Write history
                self._save_history(old.get("history", []))
                # Write active slots
                self._save_slots(old.get("slots", {}))
                # Remove old file
                LEGACY_REGISTRY.unlink()
            except Exception:
                pass

    @staticmethod
    def _load_json(path: Path, default):
        try:
            with open(path, "r") as f:
                fcntl.flock(f, fcntl.LOCK_SH)
                data = json.load(f)
                fcntl.flock(f, fcntl.LOCK_UN)
                return data
        except (FileNotFoundError, json.JSONDecodeError):
            return default

    @staticmethod
    def _save_json(path: Path, data):
        with open(path, "w") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            json.dump(data, f, indent=2, ensure_ascii=False)
            fcntl.flock(f, fcntl.LOCK_UN)

    def _load_slots(self) -> dict:
        return self._load_json(SLOTS_FILE, {})

    def _save_slots(self, slots: dict):
        self._save_json(SLOTS_FILE, slots)

    def _load_history(self) -> list:
        return self._load_json(HISTORY_FILE, [])

    def _save_history(self, history: list):
        self._save_json(HISTORY_FILE, history)

    def _is_tmux_alive(self, session: str) -> bool:
        """Check if tmux session exists."""
        if not session:
            return False
        try:
            r = subprocess.run(
                ["tmux", "has-session", "-t", session],
                capture_output=True, timeout=3,
            )
            return r.returncode == 0
        except Exception:
            return False

    def _is_pid_alive(self, pid: int) -> bool:
        """Check if PID is running."""
        if not pid:
            return False
        try:
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False

    def _find_claude_session(self, workdir: str) -> Optional[str]:
        """Find Claude Code session ID from project directory."""
        if not workdir:
            return None
        project_key = workdir.replace("/", "-")
        base = Path.home() / ".claude" / "projects"
        # Try exact match first
        candidate = base / project_key
        if candidate.is_dir():
            return project_key
        # Glob match
        import glob
        matches = glob.glob(str(base / f"*{project_key}*"))
        dirs = [m for m in matches if os.path.isdir(m)]
        if dirs:
            return Path(max(dirs, key=os.path.getmtime)).name
        return None

    def _find_jsonl_path(self, claude_session: str) -> Optional[str]:
        """Find the latest jsonl file for a Claude Code session."""
        if not claude_session:
            return None
        base = Path.home() / ".claude" / "projects" / claude_session
        if not base.is_dir():
            return None
        import glob
        files = glob.glob(str(base / "*.jsonl"))
        if not files:
            return None
        return max(files, key=os.path.getmtime)

    def allocate_slot(self, task: str, workdir: str, pid: int = 0,
                      tmux_session: str = "", preferred_slot: int = 0) -> Optional[Dict]:
        """Allocate a free slot for a new task. Returns slot info or None if full.
        If preferred_slot is set and that slot is free, use it."""
        slots = self._load_slots()

        # Clean up dead slots first
        for sid_str, slot in list(slots.items()):
            if slot.get("status") == "running":
                alive = (self._is_tmux_alive(slot.get("tmuxSession", "")) or
                         self._is_pid_alive(slot.get("pid", 0)))
                if not alive:
                    self._finish_slot_split(slots, int(sid_str), "finished", "exited")

        # Find free slots
        occupied = {int(s) for s, sl in slots.items() if sl.get("status") == "running"}
        free_slots = [s for s in range(1, self.max_agents + 1) if s not in occupied]
        if not free_slots:
            self._save_slots(slots)
            return None

        # Prefer requested slot if free
        if preferred_slot and preferred_slot in free_slots:
            free_slot = preferred_slot
        else:
            free_slot = free_slots[0]
        now = time.time()
        alias = _get_alias(self.config, free_slot)
        specialty = _get_specialty(self.config, free_slot)
        claude_session = self._find_claude_session(workdir) if workdir else None

        slot_data = {
            "slotId": free_slot,
            "alias": alias,
            "specialty": specialty,
            "task": task,
            "workdir": workdir,
            "tmuxSession": tmux_session,
            "pid": pid,
            "claudeSessionId": claude_session,
            "jsonlPath": self._find_jsonl_path(claude_session) if claude_session else None,
            "watcherPid": None,
            "status": "running",
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "startedEpoch": now,
            "lastActiveEpoch": now,
            "approvalCount": 0,
            "approvalsPending": False,
        }

        slots[str(free_slot)] = slot_data
        self._save_slots(slots)
        return slot_data

    def _finish_slot_split(self, slots: dict, slot_id: int,
                           status: str = "finished", outcome: str = "completed"):
        """Move a slot from slots dict to history file and remove it."""
        sid_str = str(slot_id)
        slot = slots.get(sid_str)
        if not slot:
            return

        now = time.time()
        started = slot.get("startedEpoch", now)

        history_entry = {
            "slotId": slot_id,
            "alias": slot.get("alias", f"mc-{slot_id}"),
            "task": slot.get("task", ""),
            "workdir": slot.get("workdir", ""),
            "tmuxSession": slot.get("tmuxSession", ""),
            "pid": slot.get("pid", 0),
            "claudeSessionId": slot.get("claudeSessionId"),
            "jsonlPath": slot.get("jsonlPath"),
            "status": status,
            "outcome": outcome,
            "startedAt": slot.get("startedAt", ""),
            "startedEpoch": started,
            "finishedEpoch": now,
            "finishedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "durationSeconds": round(now - started),
            "approvalCount": slot.get("approvalCount", 0),
        }

        # Append to history file
        history = self._load_history()
        history.append(history_entry)

        # Prune
        max_history = self.config.get("maxHistoryPerSlot", 50) * self.max_agents
        retention_days = self.config.get("historyRetentionDays", 30)
        cutoff = now - retention_days * 86400
        history = [h for h in history if h.get("startedEpoch", 0) > cutoff][-max_history:]
        self._save_history(history)

        # Remove from slots
        del slots[sid_str]

    def update_slot(self, slot_id: int, **kwargs) -> bool:
        """Update fields on an active slot."""
        slots = self._load_slots()
        sid_str = str(slot_id)
        if sid_str not in slots:
            return False

        for key, val in kwargs.items():
            slots[sid_str][key] = val
        slots[sid_str]["lastActiveEpoch"] = time.time()
        self._save_slots(slots)
        return True

    def finish_slot(self, slot_id: int, outcome: str = "completed") -> bool:
        """Mark a slot as finished and move to history."""
        slots = self._load_slots()
        sid_str = str(slot_id)
        if sid_str not in slots:
            return False

        self._finish_slot_split(slots, slot_id, "finished", outcome)
        self._save_slots(slots)
        return True

    def record_approval(self, slot_id: int):
        """Increment approval count for a slot."""
        slots = self._load_slots()
        sid_str = str(slot_id)
        if sid_str in slots:
            slots[sid_str]["approvalCount"] = slots[sid_str].get("approvalCount", 0) + 1
            slots[sid_str]["lastActiveEpoch"] = time.time()
            self._save_slots(slots)

    def set_watcher(self, slot_id: int, watcher_pid: int):
        """Record watcher PID for a slot."""
        self.update_slot(slot_id, watcherPid=watcher_pid)

    def set_claude_info(self, slot_id: int, session_id: str = None,
                        jsonl_path: str = None):
        """Record Claude Code session info."""
        updates = {}
        if session_id is not None:
            updates["claudeSessionId"] = session_id
        if jsonl_path is not None:
            updates["jsonlPath"] = jsonl_path
        if updates:
            self.update_slot(slot_id, **updates)

    def get_slot(self, slot_id: int) -> Optional[Dict]:
        """Get info for a specific active slot."""
        slots = self._load_slots()
        return slots.get(str(slot_id))

    def get_all(self) -> Dict:
        """Get full status: active slots + summary."""
        slots = self._load_slots()

        # Refresh liveness for active slots
        for sid_str, slot in list(slots.items()):
            if slot.get("status") == "running":
                tmux_alive = self._is_tmux_alive(slot.get("tmuxSession", ""))
                pid_alive = self._is_pid_alive(slot.get("pid", 0))
                if not tmux_alive and not pid_alive:
                    self._finish_slot_split(slots, int(sid_str), "finished", "exited")

        self._save_slots(slots)

        # Build summary
        active = slots
        running_ids = sorted([int(s) for s in active])
        free_ids = [s for s in range(1, self.max_agents + 1) if s not in running_ids]

        agents_info = []
        for sid in range(1, self.max_agents + 1):
            sid_str = str(sid)
            alias = _get_alias(self.config, sid)
            specialty = _get_specialty(self.config, sid)
            if sid_str in active:
                slot = active[sid_str]
                age_min = round((time.time() - slot.get("startedEpoch", time.time())) / 60, 1)
                agents_info.append({
                    "slotId": sid,
                    "label": f"mc-{sid}",
                    "alias": alias,
                    "specialty": specialty,
                    "status": "busy",
                    "task": slot.get("task", ""),
                    "workdir": slot.get("workdir", ""),
                    "ageMinutes": age_min,
                    "approvalsPending": slot.get("approvalsPending", False),
                    "approvalCount": slot.get("approvalCount", 0),
                    "tmuxSession": slot.get("tmuxSession", ""),
                    "watcherPid": slot.get("watcherPid"),
                    "claudeSessionId": slot.get("claudeSessionId"),
                })
            else:
                agents_info.append({
                    "slotId": sid,
                    "label": f"mc-{sid}",
                    "alias": alias,
                    "specialty": specialty,
                    "status": "free",
                })

        return {
            "maxAgents": self.max_agents,
            "running": len(running_ids),
            "free": len(free_ids),
            "summary": f"{len(running_ids)} busy, {len(free_ids)} free (max {self.max_agents})",
            "agents": agents_info,
        }

    def get_busy_info(self) -> List[Dict]:
        """Get info about occupied slots (for 'all full' error message)."""
        slots = self._load_slots()
        busy = []
        for sid_str, slot in slots.items():
            if slot.get("status") == "running":
                alias = slot.get("alias", f"mc-{slot.get('slotId', '?')}")
                busy.append({
                    "slotId": slot.get("slotId"),
                    "alias": alias,
                    "task": slot.get("task", "")[:60],
                })
        return sorted(busy, key=lambda x: x.get("slotId", 0))

    def get_history(self, slot_id: int = None, limit: int = 20) -> List[Dict]:
        """Get task history, optionally filtered by slot."""
        history = self._load_history()
        if slot_id is not None:
            history = [h for h in history if h.get("slotId") == slot_id]
        return history[-limit:]

    def get_stats(self) -> Dict:
        """Get aggregate statistics."""
        history = self._load_history()

        total = len(history)
        completed = sum(1 for h in history if h.get("outcome") == "completed")
        failed = sum(1 for h in history if h.get("outcome") in ("failed", "exited"))
        total_approvals = sum(h.get("approvalCount", 0) for h in history)
        durations = [h.get("durationSeconds", 0) for h in history if h.get("durationSeconds", 0) > 0]
        avg_duration = round(sum(durations) / len(durations)) if durations else 0

        # Per-slot stats
        slot_stats = {}
        for h in history:
            sid = h.get("slotId", 0)
            if sid not in slot_stats:
                slot_stats[sid] = {"tasks": 0, "approvals": 0, "totalSeconds": 0}
            slot_stats[sid]["tasks"] += 1
            slot_stats[sid]["approvals"] += h.get("approvalCount", 0)
            slot_stats[sid]["totalSeconds"] += h.get("durationSeconds", 0)

        return {
            "totalTasks": total,
            "completed": completed,
            "failed": failed,
            "unknown": total - completed - failed,
            "totalApprovals": total_approvals,
            "avgDurationSeconds": avg_duration,
            "perSlot": slot_stats,
        }

    def cleanup(self, days: int = None) -> int:
        """Remove history entries older than retention period. Returns count removed."""
        if days is None:
            days = self.config.get("historyRetentionDays", 30)
        history = self._load_history()
        cutoff = time.time() - days * 86400
        before = len(history)
        history = [h for h in history if h.get("startedEpoch", 0) > cutoff]
        self._save_history(history)
        return before - len(history)


# ── CLI interface ──

def main():
    if len(sys.argv) < 2:
        print("Usage: mc_registry.py <command> [args]")
        print("Commands: status, allocate, update, finish, history, stats, cleanup")
        sys.exit(1)

    cmd = sys.argv[1]
    reg = Registry()

    if cmd == "status":
        print(json.dumps(reg.get_all(), indent=2, ensure_ascii=False))

    elif cmd == "allocate":
        task = sys.argv[2] if len(sys.argv) > 2 else "unnamed task"
        workdir = sys.argv[3] if len(sys.argv) > 3 else "."
        preferred = int(sys.argv[4]) if len(sys.argv) > 4 else 0
        result = reg.allocate_slot(task, workdir, preferred_slot=preferred)
        if result:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            busy = reg.get_busy_info()
            print(json.dumps({"error": "all_full", "busy": busy}, indent=2, ensure_ascii=False))
            sys.exit(2)

    elif cmd == "update":
        slot_id = int(sys.argv[2])
        updates = {}
        for arg in sys.argv[3:]:
            if "=" in arg:
                k, v = arg.split("=", 1)
                # Try to parse as JSON value
                try:
                    v = json.loads(v)
                except (json.JSONDecodeError, ValueError):
                    pass
                updates[k] = v
        ok = reg.update_slot(slot_id, **updates)
        print("OK" if ok else "NOT_FOUND")

    elif cmd == "finish":
        slot_id = int(sys.argv[2])
        outcome = sys.argv[3] if len(sys.argv) > 3 else "completed"
        ok = reg.finish_slot(slot_id, outcome)
        print("OK" if ok else "NOT_FOUND")

    elif cmd == "history":
        slot_id = int(sys.argv[2]) if len(sys.argv) > 2 else None
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 20
        history = reg.get_history(slot_id, limit)
        print(json.dumps(history, indent=2, ensure_ascii=False))

    elif cmd == "stats":
        print(json.dumps(reg.get_stats(), indent=2, ensure_ascii=False))

    elif cmd == "cleanup":
        days = int(sys.argv[2]) if len(sys.argv) > 2 else None
        removed = reg.cleanup(days)
        print(f"Removed {removed} old entries")

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
