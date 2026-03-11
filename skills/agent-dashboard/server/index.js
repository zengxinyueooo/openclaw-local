const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const http = require('http');

const DataCollector = require('./data-collector');
const OpenClawClient = require('./openclaw-client');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

const PORT = process.env.PORT || 3210;
const AVATARS_DIR = path.resolve(__dirname, '../avatars');

// Resolve workspace root: env var > openclaw.json > fallback to ../..
function resolveWorkspaceRoot() {
  if (process.env.OPENCLAW_WORKSPACE) {
    return path.resolve(process.env.OPENCLAW_WORKSPACE);
  }
  try {
    const configPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.agents?.defaults?.workspace) {
      return path.resolve(config.agents.defaults.workspace);
    }
  } catch {}
  return path.resolve(__dirname, '../..');
}
const WORKSPACE_ROOT = resolveWorkspaceRoot();

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../web')));

// Ensure avatars directory exists
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

// Initialize data collector
const dataCollector = new DataCollector(WORKSPACE_ROOT);
const openclawClient = new OpenClawClient(WORKSPACE_ROOT);

// Store connected WebSocket clients
const clients = new Set();

// Broadcast to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[WS] Client connected, total:', clients.size);

  // Send initial state
  const allAgents = getAllAgents();
  ws.send(JSON.stringify({ event: 'agents.init', data: allAgents }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[WS] Client disconnected, total:', clients.size);
  });
});

// Get all agents data
function getAllAgents() {
  const agents = [];

  // OpenClaw main agent
  const openclawData = dataCollector.getOpenClawData();
  if (openclawData) {
    const activity = openclawClient.getActivity();
    agents.push({
      id: 'openclaw',
      type: 'openclaw',
      status: openclawClient.getStatus(),
      ...openclawData,
      activity: {
        currentState: activity.currentState,
        currentTool: activity.currentTool,
        currentMessage: activity.currentMessage,
        turnStartedAt: activity.turnStartedAt,
        recentEvents: activity.recentEvents,
        lastMessages: activity.lastMessages,
      }
    });
  }

  // MC Agents
  const mcAgents = dataCollector.getMCAgents();
  agents.push(...mcAgents);

  return agents;
}

// API Routes

// Get all agents
app.get('/api/agents', (req, res) => {
  res.json(getAllAgents());
});

// Get single agent
app.get('/api/agents/:id', (req, res) => {
  const { id } = req.params;
  const agents = getAllAgents();
  const agent = agents.find(a => a.id === id);

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json(agent);
});

// Get agent output (tmux capture or jsonl)
app.get('/api/agents/:id/output', async (req, res) => {
  const { id } = req.params;
  const { type = 'tmux', lines = 50 } = req.query;

  try {
    let output;
    if (id === 'openclaw') {
      output = openclawClient.getLogOutput(parseInt(lines));
    } else {
      const slotId = id.replace('mc-', '');
      output = await dataCollector.getMCAgentOutput(slotId, type, parseInt(lines));
    }
    res.json({ output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get MC agent history
app.get('/api/history', (req, res) => {
  const history = dataCollector.getHistory();
  res.json(history);
});

// Get OpenClaw agent activity (real-time work status)
app.get('/api/agents/openclaw/activity', (req, res) => {
  res.json(openclawClient.getActivity());
});

// Get cron job run history (for OpenClaw history panel)
app.get('/api/cron/runs', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const result = await openclawClient._gatewayRequest('cron.runs', { limit });
    res.json(result);
  } catch (err) {
    res.json({ entries: [], error: err.message });
  }
});

// Get cron jobs list
app.get('/api/cron/jobs', async (req, res) => {
  try {
    const result = await openclawClient._gatewayRequest('cron.list', { includeDisabled: true });
    res.json(result);
  } catch (err) {
    res.json({ jobs: [], error: err.message });
  }
});

// Get avatar image
app.get('/api/avatars/:id', (req, res) => {
  const { id } = req.params;
  const avatarPath = path.join(AVATARS_DIR, `${id}.png`);

  if (fs.existsSync(avatarPath)) {
    res.sendFile(avatarPath);
  } else {
    // Return default avatar
    res.redirect('/assets/default-avatar.png');
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});

// Initialize data collector and start watching
async function init() {
  await dataCollector.init();
  await openclawClient.init();

  // Set up data change listeners
  dataCollector.on('change', (data) => {
    broadcast({ event: 'agents.update', data: getAllAgents() });
  });

  openclawClient.on('status', (status) => {
    broadcast({ event: 'agent.status', agentId: 'openclaw', status });
  });

  openclawClient.on('log', (logOutput) => {
    broadcast({
      event: 'agent.output',
      agentId: 'openclaw',
      output: logOutput,
    });
  });

  openclawClient.on('activity-change', (activity) => {
    broadcast({
      event: 'agent.activity',
      agentId: 'openclaw',
      activity: {
        currentState: activity.currentState,
        currentTool: activity.currentTool,
        currentMessage: activity.currentMessage,
        turnStartedAt: activity.turnStartedAt,
        recentEvents: activity.recentEvents,
      }
    });
  });

  // Start tmux capture polling (every 3 seconds)
  setInterval(async () => {
    const slots = dataCollector.getSlotsData();
    for (const [slotId, slot] of Object.entries(slots)) {
      if (slot.tmuxSession) {
        try {
          const output = await dataCollector.captureTmuxOutput(slot.tmuxSession, 20);
          broadcast({
            event: 'agent.output',
            agentId: `mc-${slotId}`,
            output,
            timestamp: Date.now()
          });
        } catch (err) {
          // Tmux session might not exist, ignore
        }
      }
    }
  }, 3000);
}

init().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  await openclawClient.close();
  server.close(() => {
    process.exit(0);
  });
});
