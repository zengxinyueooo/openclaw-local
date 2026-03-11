#!/usr/bin/env python3
"""Push a message to webchat via Gateway WebSocket chat.inject.

Usage: mc_push.py <message>
"""
import asyncio, json, uuid, sys, os

def get_token():
    config_path = os.path.expanduser("~/.openclaw/openclaw.json")
    with open(config_path) as f:
        return json.load(f)["gateway"]["auth"]["token"]

async def inject(message: str):
    import websockets
    token = get_token()
    uri = f"ws://127.0.0.1:18789/?token={token}"
    async with websockets.connect(uri) as ws:
        # 1. Challenge
        await asyncio.wait_for(ws.recv(), timeout=5)
        
        # 2. Connect
        cid = str(uuid.uuid4())
        await ws.send(json.dumps({
            "type": "req", "id": cid, "method": "connect",
            "params": {
                "minProtocol": 3, "maxProtocol": 3,
                "client": {"id": "cli", "version": "1.0.0", "platform": "macos", "mode": "cli"},
                "role": "operator",
                "scopes": ["operator.read", "operator.write", "operator.admin"],
                "caps": [], "commands": [], "permissions": {},
                "auth": {"token": token},
                "locale": "zh-CN", "userAgent": "mc-watcher"
            }
        }))
        for _ in range(20):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg.get("type") == "res" and msg.get("id") == cid:
                if not msg.get("ok"):
                    print(f"Connect failed: {msg}", file=sys.stderr)
                    sys.exit(1)
                break
        
        # 3. Inject
        iid = str(uuid.uuid4())
        await ws.send(json.dumps({
            "type": "req", "id": iid, "method": "chat.inject",
            "params": {"sessionKey": "agent:main:main", "message": message}
        }))
        for _ in range(20):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg.get("type") == "res" and msg.get("id") == iid:
                if msg.get("ok"):
                    print("OK")
                else:
                    print(f"Inject failed: {msg}", file=sys.stderr)
                    sys.exit(1)
                break

if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--file":
        # Read message from file to avoid shell quoting issues
        with open(sys.argv[2]) as f:
            msg = f.read().strip()
    elif len(sys.argv) >= 2:
        msg = " ".join(sys.argv[1:])
    else:
        print("Usage: mc_push.py <message> | mc_push.py --file <path>", file=sys.stderr)
        sys.exit(1)
    asyncio.run(inject(msg))
