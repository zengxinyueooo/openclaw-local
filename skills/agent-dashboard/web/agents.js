class AgentManager {
  constructor() {
    this.agents = [];
    this.ws = null;
    this.callbacks = {};
    this.reconnectTimer = null;
    this.apiBase = window.location.origin;
    this.wsUrl = `ws://${window.location.host}/live`;
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  async init() {
    // Load initial data via HTTP
    await this.fetchAgents();

    // Connect WebSocket for real-time updates
    this.connectWebSocket();
  }

  async fetchAgents() {
    try {
      const response = await fetch(`${this.apiBase}/api/agents`);
      this.agents = await response.json();
      this.emit('agents.update', this.agents);
      return this.agents;
    } catch (err) {
      console.error('[AgentManager] Failed to fetch agents:', err);
      return [];
    }
  }

  async fetchHistory() {
    try {
      const response = await fetch(`${this.apiBase}/api/history`);
      return await response.json();
    } catch (err) {
      console.error('[AgentManager] Failed to fetch history:', err);
      return [];
    }
  }

  async fetchAgentOutput(agentId, type = 'tmux', lines = 50) {
    try {
      const response = await fetch(
        `${this.apiBase}/api/agents/${agentId}/output?type=${type}&lines=${lines}`
      );
      const data = await response.json();
      return data.output;
    } catch (err) {
      console.error('[AgentManager] Failed to fetch output:', err);
      return '';
    }
  }

  connectWebSocket() {
    this.emit('connection.status', 'connecting');

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[AgentManager] WebSocket connected');
        this.emit('connection.status', 'online');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (err) {
          console.error('[AgentManager] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[AgentManager] WebSocket disconnected');
        this.emit('connection.status', 'offline');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[AgentManager] WebSocket error:', err);
        this.emit('connection.status', 'offline');
      };

    } catch (err) {
      console.error('[AgentManager] Failed to connect WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  handleWebSocketMessage(message) {
    switch (message.event) {
      case 'agents.init':
      case 'agents.update':
        this.agents = message.data;
        this.emit('agents.update', this.agents);
        break;

      case 'agent.status':
        this.updateAgentStatus(message.agentId, message.status);
        break;

      case 'agent.output':
        this.emit('agent.output', {
          agentId: message.agentId,
          output: message.output,
          timestamp: message.timestamp
        });
        break;

      case 'agent.message':
        this.emit('agent.message', {
          agentId: message.agentId,
          message: message.message
        });
        break;

      case 'agent.activity':
        this.updateAgentActivity(message.agentId, message.activity);
        this.emit('agent.activity', {
          agentId: message.agentId,
          activity: message.activity,
          timestamp: message.timestamp
        });
        break;

      default:
        console.log('[AgentManager] Unknown event:', message.event);
    }
  }

  updateAgentStatus(agentId, status) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.status = status;
      this.emit('agents.update', this.agents);
    }
  }

  updateAgentActivity(agentId, activity) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.activity = activity;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, 5000);
  }

  getAgent(agentId) {
    return this.agents.find(a => a.id === agentId);
  }

  getAllAgents() {
    return this.agents;
  }

  getMCAgents() {
    return this.agents.filter(a => a.type === 'mc-agent');
  }

  getOpenClawAgent() {
    return this.agents.find(a => a.type === 'openclaw');
  }

  // Organize tasks for the task board
  getTaskBoardData() {
    const todo = [];
    const wip = [];
    const done = [];

    // Get running tasks from slots
    this.agents.forEach(agent => {
      if (agent.type === 'mc-agent' && agent.currentTask) {
        const task = {
          agentId: agent.id,
          agentName: agent.name || agent.id,
          task: agent.currentTask.task,
          startedAt: agent.currentTask.startedAt,
          ageMinutes: agent.currentTask.ageMinutes
        };

        if (agent.currentTask.approvalsPending) {
          todo.push({ ...task, status: 'pending' });
        } else {
          // 只要有任务就放进 DOING，不管状态是 running 还是 idle
          wip.push({ ...task, status: agent.status === 'running' ? 'running' : 'idle' });
        }
      }
    });

    return { todo, wip, done };
  }
}

// Global instance
const agentManager = new AgentManager();
