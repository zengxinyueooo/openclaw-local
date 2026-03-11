const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const chokidar = require('chokidar');
const { EventEmitter } = require('events');

const execAsync = promisify(exec);

class DataCollector extends EventEmitter {
  constructor(workspaceRoot) {
    super();
    this.workspaceRoot = workspaceRoot;
    this.mcAgentDir = path.join(workspaceRoot, 'skills', 'mc-agent');
    this.openclawConfigPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json');

    // Cached data
    this.identityData = null;
    this.soulData = null;
    this.userData = null;
    this.openclawConfig = null;
    this.mcConfig = null;
    this.slotsData = {};
    this.historyData = [];

    // File watchers
    this.watchers = [];
  }

  async init() {
    console.log('[DataCollector] Initializing...');

    // Initial load of all data
    await this.loadIdentityData();
    await this.loadSoulData();
    await this.loadUserData();
    await this.loadOpenClawConfig();
    await this.loadMCConfig();
    await this.loadSlotsData();
    await this.loadHistoryData();

    // Setup file watchers
    this.setupWatchers();

    console.log('[DataCollector] Initialized');
  }

  // Setup file watchers for real-time updates
  setupWatchers() {
    // Watch IDENTITY.md
    const identityWatcher = chokidar.watch(
      path.join(this.workspaceRoot, 'IDENTITY.md'),
      { persistent: true }
    );
    identityWatcher.on('change', () => this.loadIdentityData());
    this.watchers.push(identityWatcher);

    // Watch SOUL.md
    const soulWatcher = chokidar.watch(
      path.join(this.workspaceRoot, 'SOUL.md'),
      { persistent: true }
    );
    soulWatcher.on('change', () => this.loadSoulData());
    this.watchers.push(soulWatcher);

    // Watch USER.md
    const userWatcher = chokidar.watch(
      path.join(this.workspaceRoot, 'USER.md'),
      { persistent: true }
    );
    userWatcher.on('change', () => this.loadUserData());
    this.watchers.push(userWatcher);

    // Watch openclaw.json
    const openclawWatcher = chokidar.watch(this.openclawConfigPath, { persistent: true });
    openclawWatcher.on('change', () => this.loadOpenClawConfig());
    this.watchers.push(openclawWatcher);

    // Watch MC agent files
    const mcConfigWatcher = chokidar.watch(
      path.join(this.mcAgentDir, 'config.json'),
      { persistent: true }
    );
    mcConfigWatcher.on('change', () => {
      this.loadMCConfig();
      this.emit('change', { type: 'mc-config' });
    });
    this.watchers.push(mcConfigWatcher);

    const slotsWatcher = chokidar.watch(
      path.join(this.mcAgentDir, 'slots.json'),
      { persistent: true }
    );
    slotsWatcher.on('change', () => {
      this.loadSlotsData();
      this.emit('change', { type: 'slots' });
    });
    this.watchers.push(slotsWatcher);

    const historyWatcher = chokidar.watch(
      path.join(this.mcAgentDir, 'history.json'),
      { persistent: true }
    );
    historyWatcher.on('change', () => {
      this.loadHistoryData();
      this.emit('change', { type: 'history' });
    });
    this.watchers.push(historyWatcher);
  }

  // Parse markdown file to extract key-value pairs
  parseMarkdown(content) {
    const data = {};
    const lines = content.split('\n');

    for (const line of lines) {
      // Match patterns like "- **Name:** Value" or "- Name: Value"
      // Clean up markdown bold markers
      const cleanLine = line.replace(/\*\*/g, '');
      const match = cleanLine.match(/^\s*[-*]\s*([^:]+)\s*[:：]\s*(.+)$/);
      if (match) {
        const key = match[1].trim().toLowerCase();
        const value = match[2].trim();
        data[key] = value;
      }
    }

    return data;
  }

  async loadIdentityData() {
    try {
      const content = await fs.readFile(
        path.join(this.workspaceRoot, 'IDENTITY.md'),
        'utf-8'
      );
      this.identityData = this.parseMarkdown(content);
      console.log('[DataCollector] Loaded IDENTITY.md');
      this.emit('change', { type: 'identity' });
    } catch (err) {
      console.warn('[DataCollector] Failed to load IDENTITY.md:', err.message);
    }
  }

  async loadSoulData() {
    try {
      const content = await fs.readFile(
        path.join(this.workspaceRoot, 'SOUL.md'),
        'utf-8'
      );
      // Extract vibe section
      const vibeMatch = content.match(/## Vibe\s*\n([^#]+)/);
      this.soulData = {
        vibe: vibeMatch ? vibeMatch[1].trim() : null
      };
      console.log('[DataCollector] Loaded SOUL.md');
      this.emit('change', { type: 'soul' });
    } catch (err) {
      console.warn('[DataCollector] Failed to load SOUL.md:', err.message);
    }
  }

  async loadUserData() {
    try {
      const content = await fs.readFile(
        path.join(this.workspaceRoot, 'USER.md'),
        'utf-8'
      );
      this.userData = this.parseMarkdown(content);
      console.log('[DataCollector] Loaded USER.md');
      this.emit('change', { type: 'user' });
    } catch (err) {
      console.warn('[DataCollector] Failed to load USER.md:', err.message);
    }
  }

  async loadOpenClawConfig() {
    try {
      const content = await fs.readFile(this.openclawConfigPath, 'utf-8');
      this.openclawConfig = JSON.parse(content);
      console.log('[DataCollector] Loaded openclaw.json');
      this.emit('change', { type: 'openclaw-config' });
    } catch (err) {
      console.warn('[DataCollector] Failed to load openclaw.json:', err.message);
    }
  }

  async loadMCConfig() {
    try {
      const content = await fs.readFile(
        path.join(this.mcAgentDir, 'config.json'),
        'utf-8'
      );
      this.mcConfig = JSON.parse(content);
      console.log('[DataCollector] Loaded MC config');
    } catch (err) {
      console.warn('[DataCollector] Failed to load MC config:', err.message);
    }
  }

  async loadSlotsData() {
    try {
      const content = await fs.readFile(
        path.join(this.mcAgentDir, 'slots.json'),
        'utf-8'
      );
      this.slotsData = JSON.parse(content);
      console.log('[DataCollector] Loaded slots data');
    } catch (err) {
      console.warn('[DataCollector] Failed to load slots data:', err.message);
    }
  }

  async loadHistoryData() {
    try {
      const content = await fs.readFile(
        path.join(this.mcAgentDir, 'history.json'),
        'utf-8'
      );
      this.historyData = JSON.parse(content);
      console.log('[DataCollector] Loaded history data');
    } catch (err) {
      console.warn('[DataCollector] Failed to load history data:', err.message);
    }
  }

  // Get OpenClaw agent data
  getOpenClawData() {
    const data = {
      id: 'openclaw',
      type: 'openclaw'
    };

    if (this.identityData) {
      if (this.identityData.name) data.name = this.identityData.name;
      if (this.identityData.emoji) data.emoji = this.identityData.emoji;
      if (this.identityData.vibe) data.vibe = this.identityData.vibe;
    }

    if (this.soulData?.vibe) {
      data.vibe = this.soulData.vibe;
    }

    if (this.openclawConfig?.models) {
      // Get the first model as current
      const providers = Object.keys(this.openclawConfig.models.providers || {});
      if (providers.length > 0) {
        const provider = this.openclawConfig.models.providers[providers[0]];
        if (provider.models && provider.models.length > 0) {
          data.model = `${providers[0]}/${provider.models[0].id}`;
        }
      }
    }

    // Check if avatar exists
    const avatarPath = path.join(__dirname, '..', 'avatars', 'openclaw.png');
    if (fsSync.existsSync(avatarPath)) {
      data.avatarUrl = '/api/avatars/openclaw';
    }

    return data;
  }

  // Get MC agents data
  getMCAgents() {
    const agents = [];

    if (!this.mcConfig?.agents) {
      return agents;
    }

    for (const agentConfig of this.mcConfig.agents) {
      const slotId = agentConfig.slotId;
      const slotData = this.slotsData[slotId.toString()];

      const agent = {
        id: `mc-${slotId}`,
        type: 'mc-agent',
        slotId: slotId
      };

      // From config
      if (agentConfig.alias) agent.name = agentConfig.alias;
      if (typeof agentConfig.autoApprove === 'boolean') {
        agent.autoApprove = agentConfig.autoApprove;
      }

      // From slot data
      if (slotData) {
        agent.status = slotData.status || 'offline';

        if (slotData.task) {
          agent.currentTask = {
            task: slotData.task,
            workdir: slotData.workdir,
            startedAt: slotData.startedAt,
            ageMinutes: slotData.startedEpoch
              ? Math.round((Date.now() / 1000 - slotData.startedEpoch) / 60 * 10) / 10
              : 0,
            approvalsPending: slotData.approvalsPending || false
          };
        }
      } else {
        agent.status = 'offline';
      }

      // Check if avatar exists
      const avatarPath = path.join(__dirname, '..', 'avatars', `mc-${slotId}.png`);
      if (fsSync.existsSync(avatarPath)) {
        agent.avatarUrl = `/api/avatars/mc-${slotId}`;
      }

      agents.push(agent);
    }

    return agents;
  }

  // Get slots data
  getSlotsData() {
    return this.slotsData;
  }

  // Get history data
  getHistory() {
    return this.historyData || [];
  }

  // Capture tmux output for a session
  async captureTmuxOutput(sessionName, lines = 50) {
    try {
      const { stdout } = await execAsync(
        `tmux capture-pane -t ${sessionName} -p -S -${lines}`,
        { timeout: 5000 }
      );
      return stdout;
    } catch (err) {
      throw new Error(`Failed to capture tmux output: ${err.message}`);
    }
  }

  // Get MC agent output
  async getMCAgentOutput(slotId, type = 'tmux', lines = 50) {
    const slot = this.slotsData[slotId.toString()];

    if (!slot) {
      throw new Error('Slot not found');
    }

    if (type === 'tmux' && slot.tmuxSession) {
      return await this.captureTmuxOutput(slot.tmuxSession, lines);
    }

    if (type === 'jsonl' && slot.jsonlPath) {
      return await this.readJsonlFile(slot.jsonlPath, lines);
    }

    return '';
  }

  // Read last N lines from jsonl file
  async readJsonlFile(filePath, lines = 50) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const allLines = content.trim().split('\n');
      const lastLines = allLines.slice(-lines);

      // Parse and format
      const events = lastLines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return events.map(e => `[${e.type}] ${JSON.stringify(e.payload || {})}`).join('\n');
    } catch (err) {
      return '';
    }
  }

  // Get OpenClaw output (if available)
  async getOpenClawOutput(lines = 50) {
    // OpenClaw doesn't have tmux, might implement log reading later
    return 'OpenClaw output not available yet';
  }

  // Cleanup
  async close() {
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    this.watchers = [];
  }
}

module.exports = DataCollector;
