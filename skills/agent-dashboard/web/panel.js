class AgentPanel {
  constructor() {
    this.panel = document.getElementById('agent-panel');
    this.closeBtn = document.getElementById('close-panel');

    this.currentAgent = null;
    this.terminalInterval = null;
    this.historyData = [];

    this.bindEvents();
  }

  bindEvents() {
    this.closeBtn.addEventListener('click', () => this.hide());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });

    // 点击背景关闭
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) {
        this.hide();
      }
    });

    // Listen for agent updates
    agentManager.on('agent.output', (data) => {
      if (this.currentAgent && this.currentAgent.id === data.agentId) {
        this.updateTerminal(data.output);
      }
    });

    // Listen for OpenClaw activity updates
    agentManager.on('agent.activity', (data) => {
      if (this.currentAgent && this.currentAgent.id === data.agentId) {
        this.updateActivity(data.activity);
      }
    });
  }

  async show(agentId) {
    const agent = agentManager.getAgent(agentId);
    if (!agent) return;

    this.currentAgent = agent;
    this.panel.classList.remove('hidden');

    // 加载历史任务
    await this.loadHistory();

    // 渲染内容
    await this.render(agent);

    // 开始轮询终端
    this.startTerminalPolling();
  }

  hide() {
    this.panel.classList.add('hidden');
    this.currentAgent = null;
    this.stopTerminalPolling();
  }

  async loadHistory() {
    try {
      this.historyData = await agentManager.fetchHistory();
    } catch (err) {
      console.error('[AgentPanel] Failed to load history:', err);
      this.historyData = [];
    }
  }

  async render(agent) {
    // 更新头部信息
    const avatarEl = document.getElementById('panel-avatar');
    const nameEl = document.getElementById('panel-name');
    const statusDotEl = document.getElementById('panel-status-dot');
    const statusEl = document.getElementById('panel-status');

    avatarEl.textContent = agent.emoji || '🤖';
    nameEl.textContent = agent.name || agent.id;

    const statusClass = agent.status || 'offline';
    statusDotEl.className = `status-dot ${statusClass}`;

    // OpenClaw 显示 activity 状态
    if (agent.type === 'openclaw' && agent.activity) {
      statusEl.textContent = this.getActivityStateText(agent.activity.currentState);
    } else {
      statusEl.textContent = this.getStatusText(agent.status);
    }

    // 更新当前任务
    const taskBox = document.getElementById('current-task-box');
    const taskText = document.getElementById('current-task-text');

    if (agent.type === 'openclaw' && agent.activity) {
      // OpenClaw 显示当前活动
      if (agent.activity.currentMessage) {
        taskBox.style.display = 'block';
        taskText.textContent = agent.activity.currentMessage;
      } else if (agent.activity.currentTool) {
        taskBox.style.display = 'block';
        taskText.textContent = `使用工具: ${agent.activity.currentTool}`;
      } else {
        taskBox.style.display = 'none';
      }
    } else if (agent.currentTask) {
      taskBox.style.display = 'block';
      taskText.textContent = agent.currentTask.task;
    } else {
      taskBox.style.display = 'none';
    }

    // 渲染历史任务侧边栏
    this.renderHistory(agent);

    // 加载初始终端输出
    const output = await agentManager.fetchAgentOutput(agent.id, 'tmux', 50);
    this.updateTerminal(output);
  }

  renderHistory(agent) {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    // OpenClaw 显示 cron 任务执行记录
    const isOpenClaw = agent.id === 'openclaw' || agent.type === 'openclaw';
    if (isOpenClaw) {
      this.renderCronHistory(historyList);
      return;
    }

    // MC agents 显示历史任务
    const agentHistory = this.historyData.filter(h => h.slotId === agent.slotId);

    if (agentHistory.length === 0) {
      historyList.innerHTML = '<div class="history-empty">暂无历史任务</div>';
      return;
    }

    historyList.innerHTML = agentHistory.slice(0, 20).map(task => {
      const statusIcon = task.outcome === 'completed' ? '✅' :
                        task.outcome === 'error' ? '❌' : '⏹️';
      const statusClass = task.outcome || 'unknown';
      const duration = task.durationSeconds ?
        `${Math.floor(task.durationSeconds / 60)}分${task.durationSeconds % 60}秒` : '';

      return `
        <div class="history-item ${statusClass}">
          <div class="history-header">
            <span class="history-status">${statusIcon}</span>
            <span class="history-time">${new Date(task.startedAt).toLocaleDateString()}</span>
          </div>
          <div class="history-task">${task.task}</div>
          ${duration ? `<div class="history-duration">⏱️ ${duration}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  async renderCronHistory(container) {
    container.innerHTML = '<div class="history-empty">加载中...</div>';
    try {
      const res = await fetch(`${window.agentManager?.apiBase || ''}/api/cron/runs?limit=10`);
      const data = await res.json();
      const entries = data.entries || [];

      // 去重：同一个 job 只保留最近一次执行
      const seen = new Set();
      const deduped = entries.filter(e => {
        const key = e.jobId || e.jobName;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (deduped.length === 0) {
        container.innerHTML = '<div class="history-empty">暂无定时任务记录</div>';
        return;
      }
      const entries_ = deduped;

      container.innerHTML = entries_.map(entry => {
        const statusIcon = entry.status === 'ok' ? '✅' : entry.status === 'error' ? '❌' : '⏳';
        const statusClass = entry.status || 'unknown';
        const time = entry.runAtMs ? new Date(entry.runAtMs).toLocaleString('zh-CN', {
          month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '--';
        const duration = entry.durationMs ? `${(entry.durationMs / 1000).toFixed(1)}s` : '';
        const tokens = entry.usage?.total_tokens ? `${Math.round(entry.usage.total_tokens / 1000)}k tok` : '';
        const summary = (entry.summary || '').split('\n')[0].slice(0, 60);
        const jobName = entry.jobName || 'unnamed';

        return `
          <div class="history-item ${statusClass}">
            <div class="history-header">
              <span class="history-status">${statusIcon}</span>
              <span class="history-time">${time}</span>
            </div>
            <div class="history-task">${jobName}</div>
            <div class="history-summary">${summary}</div>
            ${duration || tokens ? `<div class="history-duration">⏱️ ${duration} ${tokens ? '· ' + tokens : ''}</div>` : ''}
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<div class="history-empty">加载失败: ${err.message}</div>`;
    }
  }

  getEventIcon(type) {
    const icons = {
      'turn_start': '🤔',
      'thinking': '🤔',
      'tool_call': '🔧',
      'tool_done': '✅',
      'tool_result': '✅',
      'turn_end': '💬',
      'chat_response': '💬',
      'message': '💬',
      'idle': '😴',
      'error': '❌'
    };
    return icons[type] || '📝';
  }

  updateActivity(activity) {
    // 更新 OpenClaw 的活动状态显示
    const statusEl = document.getElementById('panel-status');
    if (statusEl && activity.currentState) {
      const stateText = this.getActivityStateText(activity.currentState);
      statusEl.textContent = stateText;
    }

    // 更新当前任务/消息显示
    const taskBox = document.getElementById('current-task-box');
    const taskText = document.getElementById('current-task-text');
    if (taskBox && taskText) {
      if (activity.currentMessage) {
        taskBox.style.display = 'block';
        taskText.textContent = activity.currentMessage;
      } else if (activity.currentTool) {
        taskBox.style.display = 'block';
        taskText.textContent = `使用工具: ${activity.currentTool}`;
      } else {
        taskBox.style.display = 'none';
      }
    }

    // 更新历史事件列表（如果当前是 OpenClaw）
    if (this.currentAgent && this.currentAgent.id === 'openclaw') {
      this.currentAgent.activity = activity;
      if (activity.recentEvents) {
        this.renderHistory(this.currentAgent);
      }
    }
  }

  getActivityStateText(state) {
    const stateMap = {
      'idle': '空闲中',
      'thinking': '思考中',
      'tool_call': '执行工具',
      'processing': '处理中'
    };
    return stateMap[state] || state;
  }

  getStatusText(status) {
    const statusMap = {
      'running': '工作中',
      'idle': '空闲',
      'pending': '等待审批',
      'offline': '离线',
      'error': '错误'
    };
    return statusMap[status] || status || '未知';
  }

  updateTerminal(output) {
    const terminal = document.getElementById('terminal-content');
    if (terminal) {
      // 检查用户是否在底部附近，如果是才自动滚动
      const isNearBottom = terminal.scrollTop + terminal.clientHeight >= terminal.scrollHeight - 50;
      terminal.textContent = output || '暂无输出';
      // 只有当用户已经在底部时才自动滚动
      if (isNearBottom) {
        terminal.scrollTop = terminal.scrollHeight;
      }
    }
  }

  startTerminalPolling() {
    this.stopTerminalPolling();

    // Poll every 2 seconds
    this.terminalInterval = setInterval(async () => {
      if (!this.currentAgent) return;

      const output = await agentManager.fetchAgentOutput(
        this.currentAgent.id,
        'tmux',
        50
      );
      this.updateTerminal(output);
    }, 2000);
  }

  stopTerminalPolling() {
    if (this.terminalInterval) {
      clearInterval(this.terminalInterval);
      this.terminalInterval = null;
    }
  }
}
