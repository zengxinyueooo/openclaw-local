class TaskBoard {
  constructor() {
    this.overlay = document.getElementById('task-board-overlay');
    this.closeBtn = document.getElementById('close-task-board');
    this.wipList = document.getElementById('wip-list');
    this.doneList = document.getElementById('done-list');

    this.isVisible = false;
    this.history = [];

    this.bindEvents();
  }

  bindEvents() {
    this.closeBtn.addEventListener('click', () => this.hide());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  show() {
    this.overlay.classList.remove('hidden');
    this.isVisible = true;
    this.update();
  }

  hide() {
    this.overlay.classList.add('hidden');
    this.isVisible = false;
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  setHistory(history) {
    this.history = history;
    if (this.isVisible) {
      this.update();
    }
  }

  update() {
    const taskData = agentManager.getTaskBoardData();

    // Update DOING
    this.wipList.innerHTML = taskData.wip.length > 0
      ? taskData.wip.map(task => this.renderTaskItem(task, 'running')).join('')
      : '<div class="empty-state">暂无进行中的任务</div>';

    // Update DONE (from history)
    const recentDone = this.history.slice(0, 5);
    this.doneList.innerHTML = recentDone.length > 0
      ? recentDone.map(task => this.renderHistoryItem(task)).join('')
      : '<div class="empty-state">暂无已完成任务</div>';
  }

  renderTaskItem(task, status) {
    let timeText;
    if (status === 'running') {
      timeText = `⏱ ${task.ageMinutes}m 🔄`;
    } else if (status === 'idle') {
      timeText = `⏱ ${task.ageMinutes}m ⏸️`;
    } else {
      timeText = '⏳ 等待审批';
    }

    return `
      <div class="task-item ${status}">
        <div class="agent-name">${task.agentName}</div>
        <div class="task-desc">${this.truncateText(task.task, 50)}</div>
        <div class="task-meta">${timeText}</div>
      </div>
    `;
  }

  renderHistoryItem(task) {
    const duration = task.durationSeconds
      ? `${Math.floor(task.durationSeconds / 60)}m ${task.durationSeconds % 60}s`
      : 'unknown';

    return `
      <div class="task-item completed">
        <div class="agent-name">${task.alias || `MC-${task.slotId}`}</div>
        <div class="task-desc">${this.truncateText(task.task, 50)}</div>
        <div class="task-meta">✓ ${duration} | ${task.approvalCount || 0} 次审批</div>
      </div>
    `;
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}
