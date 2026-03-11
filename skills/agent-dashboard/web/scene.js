// Main 3D Scene Controller
class OfficeScene {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.officeBuilder = null;
    this.characterManager = null;
    this.taskBoard = null;
    this.agentPanel = null;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.interactableObjects = [];

    this.clock = new THREE.Clock();
    this.isRunning = false;

    // 动态位置配置
    this.openclawPosition = { x: 0, y: 0, z: -1.8, rotation: Math.PI };
    this.mcZPosition = 2.1;
    this.mcXSpacing = 3.5;
    this.mcRotation = Math.PI;

    // 存储动态生成的位置
    this.agentPositions = {};

    this.lastBoardUpdate = 0;
  }

  async init() {
    // Initialize Three.js scene
    this.setupScene();
    this.setupLights();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();

    // Build office
    this.officeBuilder = new OfficeBuilder(this.scene);
    this.officeObjects = this.officeBuilder.build();

    // Setup character manager
    this.characterManager = new CharacterManager(this.scene);

    // Setup UI components
    this.taskBoard = new TaskBoard();
    this.agentPanel = new AgentPanel();
    window.agentPanel = this.agentPanel;

    // Setup interaction
    this.setupInteraction();

    // Initialize agent manager
    agentManager.on('agents.update', (agents) => this.onAgentsUpdate(agents));
    agentManager.on('connection.status', (status) => this.onConnectionStatus(status));

    // 实时更新 3D 显示器纹理（响应服务端每 3 秒推送的 tmux 输出）
    agentManager.on('agent.output', (data) => {
      const { agentId, output } = data;
      if (agentId === 'openclaw') {
        if (this.officeObjects.mainDesk) {
          this.updateScreenTexture(this.officeObjects.mainDesk, output, 'running');
        }
      } else if (agentId.startsWith('mc-')) {
        const slotId = agentId.replace('mc-', '');
        const deskKey = `mcDesk${slotId}`;
        if (this.officeObjects[deskKey]) {
          const agent = agentManager.getAgent(agentId);
          const status = agent?.status || 'idle';
          this.updateScreenTexture(this.officeObjects[deskKey], output, status);
        }
      }
    });

    await agentManager.init();

    // Load history for task board
    const history = await agentManager.fetchHistory();
    this.taskBoard.setHistory(history);

    // Initial board content update - 使用 agentManager 获取实时数据
    const initialTaskData = agentManager.getTaskBoardData();
    initialTaskData.done = history;
    this.officeBuilder.updateBoardContent(initialTaskData);

    // Mark task board as interactable (still allow clicking to enlarge)
    if (this.officeObjects.taskBoard) {
      this.officeObjects.taskBoard.board.userData = {
        type: 'taskBoard',
        interactable: true
      };
      this.interactableObjects.push(this.officeObjects.taskBoard.board);
    }

    // Start render loop
    this.isRunning = true;
    this.animate();

    // Hide loading screen
    document.getElementById('loading').classList.add('hidden');

    console.log('[OfficeScene] Initialized');
  }

  setupScene() {
    this.scene = new THREE.Scene();
    // 明亮的天空蓝背景
    this.scene.background = new THREE.Color(0xe8f4f8);
    // 淡雾效果增加景深
    this.scene.fog = new THREE.Fog(0xe8f4f8, 15, 40);
  }

  setupLights() {
    // 全局光照 - 降低亮度
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambientLight);

    // 主光源 - 柔和自然光（降低亮度）
    const mainLight = new THREE.DirectionalLight(0xfffaf0, 0.45);
    mainLight.position.set(8, 10, 6);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -15;
    mainLight.shadow.camera.right = 15;
    mainLight.shadow.camera.top = 15;
    mainLight.shadow.camera.bottom = -15;
    mainLight.shadow.bias = -0.001;
    this.scene.add(mainLight);

    // 落地窗进来的自然光（冷色调）- 降低
    const windowLight = new THREE.DirectionalLight(0xd6eaff, 0.35);
    windowLight.position.set(-10, 5, 0);
    this.scene.add(windowLight);

    // 补光 - 降低
    const fillLight = new THREE.DirectionalLight(0xfff5e6, 0.15);
    fillLight.position.set(5, 4, 8);
    this.scene.add(fillLight);

    // 屏幕发光效果 - 保持微弱
    const screenLight1 = new THREE.PointLight(0x4a9eff, 0.12, 3);
    screenLight1.position.set(-3.5, 1.8, 1.5);
    this.scene.add(screenLight1);

    const screenLight2 = new THREE.PointLight(0x4a9eff, 0.12, 3);
    screenLight2.position.set(3.5, 1.8, 1.5);
    this.scene.add(screenLight2);

    const mainScreenLight = new THREE.PointLight(0x4a9eff, 0.15, 4);
    mainScreenLight.position.set(0, 1.9, -2);
    this.scene.add(mainScreenLight);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    // 初始视角 - 斜向俯瞰
    this.camera.position.set(8, 6, 8);
    this.camera.lookAt(0, 1, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 色调映射让画面更明亮
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  setupControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 25;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.target.set(0, 1.2, 0);

    // 启用右键平移（改变视角中心）
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };

    // 启用触摸屏支持
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };
  }

  setupInteraction() {
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onMouseMove(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Check for hover
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactableObjects);

    document.body.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
  }

  onClick(event) {
    // Ignore clicks on UI
    if (event.target.closest('#ui-layer')) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check character clicks
    const characterMeshes = Object.values(this.characterManager.characters).map(c => c.group);
    const charIntersects = this.raycaster.intersectObjects(characterMeshes, true);

    if (charIntersects.length > 0) {
      // Find which character was clicked
      const clickedGroup = charIntersects[0].object.parent?.parent;
      for (const [agentId, char] of Object.entries(this.characterManager.characters)) {
        if (char.group === clickedGroup || char.group === charIntersects[0].object.parent) {
          // MC agent 和 OpenClaw 都可点击显示面板
          const agent = agentManager.getAgent(agentId);
          if (agent) {
            this.agentPanel.show(agentId);
            this.focusOnAgent(agentId);
          }
          return;
        }
      }
    }

    // Check computer clicks (monitor and macbook)
    const computerMeshes = [];
    for (const obj of Object.values(this.officeObjects)) {
      if (obj.mainMonitor) {
        computerMeshes.push(obj.mainMonitor);
        obj.mainMonitor.children.forEach(child => computerMeshes.push(child));
      }
      if (obj.macbook) {
        computerMeshes.push(obj.macbook);
        obj.macbook.children.forEach(child => computerMeshes.push(child));
      }
    }
    const computerIntersects = this.raycaster.intersectObjects(computerMeshes, true);
    if (computerIntersects.length > 0) {
      // Find which desk was clicked
      let clickedObj = computerIntersects[0].object;
      while (clickedObj && clickedObj.parent && clickedObj.parent !== this.scene) {
        clickedObj = clickedObj.parent;
      }

      // Check OpenClaw's main desk (position x=0, z=-2.6)
      if (this.officeObjects.mainDesk && clickedObj === this.officeObjects.mainDesk.group) {
        const openclawAgent = agentManager.getOpenClawAgent();
        if (openclawAgent) {
          this.agentPanel.show(openclawAgent.id);
          this.focusOnAgent(openclawAgent.id);
          return;
        }
      }

      // Find MC agent by matching clicked desk group
      for (const [key, deskObj] of Object.entries(this.officeObjects)) {
        if (!key.startsWith('mcDesk')) continue;
        if (deskObj.group === clickedObj) {
          const slotId = key.replace('mcDesk', '');
          const agentId = `mc-${slotId}`;
          const agent = agentManager.getAgent(agentId);
          if (agent) {
            this.agentPanel.show(agentId);
            this.focusOnAgent(agentId);
            return;
          }
        }
      }
    }

    // Check other interactables (task board)
    const intersects = this.raycaster.intersectObjects(this.interactableObjects);
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (obj.userData.type === 'taskBoard') {
        this.taskBoard.toggle();
      }
    }
  }

  getAgentPosition(agent) {
    // 根据 agent 类型和 id 计算位置
    if (agent.type === 'openclaw') {
      return this.openclawPosition;
    }

    // MC agents - 动态计算位置
    // 从 slotId 或 id 中提取序号
    let slotNum = 1;
    if (agent.slotId) {
      slotNum = agent.slotId;
    } else if (agent.id && agent.id.startsWith('mc-')) {
      slotNum = parseInt(agent.id.replace('mc-', ''), 10) || 1;
    }

    // 计算位置：以中心为原点，向两侧分布
    // slot 1 -> x = -3.5, slot 2 -> x = 0, slot 3 -> x = 3.5, 等等
    const xOffset = (slotNum - 2) * this.mcXSpacing; // slot 1 = -3.5, slot 2 = 0, slot 3 = 3.5

    return {
      x: xOffset,
      y: 0,
      z: this.mcZPosition,
      rotation: this.mcRotation
    };
  }

  focusOnAgent(agentId) {
    const pos = this.agentPositions[agentId];
    if (!pos) return;

    // 平滑移动相机到 Agent 位置
    const targetPos = {
      x: pos.x + 2.5,
      y: 2.5,
      z: pos.z + 3
    };

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let progress = 0;

    const animateCamera = () => {
      progress += 0.05;
      if (progress >= 1) {
        this.camera.position.set(targetPos.x, targetPos.y, targetPos.z);
        this.controls.target.set(pos.x, 1, pos.z);
        return;
      }

      this.camera.position.lerpVectors(startPos, new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z), progress);
      this.controls.target.lerpVectors(startTarget, new THREE.Vector3(pos.x, 1, pos.z), progress);
      requestAnimationFrame(animateCamera);
    };

    animateCamera();
  }

  onAgentsUpdate(agents) {
    // 更新人物模型和状态
    agents.forEach((agent, index) => {
      let character = this.characterManager.getCharacter(agent.id);

      if (!character) {
        // 动态计算位置
        const pos = this.getAgentPosition(agent);
        this.agentPositions[agent.id] = pos;

        // Create new character at chair position
        character = this.characterManager.createCharacter(agent.id, agent.type, { index });
        // 设置位置 - 站立办公，脚底在 y=0
        character.setPosition(pos.x, 0, pos.z, pos.rotation);

        // 设置名字（使用 agent.name 或 agent.id）
        character.updateName(agent.name || agent.id);

        // Add to interactables
        this.interactableObjects.push(character.group);
      }

      // Update status
      this.characterManager.updateCharacterStatus(agent.id, agent.status, agent.currentTask);

      // Update name (in case it changed)
      this.characterManager.updateCharacterName(agent.id, agent.name || agent.id);

      // 确保 MC agent 有对应的工位
      if (agent.type === 'mc-agent' && agent.slotId) {
        const deskKey = `mcDesk${agent.slotId}`;
        if (!this.officeObjects[deskKey]) {
          // 动态创建工位 - 桌子离人物 0.8，深度1.4（和OpenClaw一致）
          const pos = this.getAgentPosition(agent);
          this.officeObjects[deskKey] = this.officeBuilder.buildProgrammerDesk(pos.x, 0, pos.z - 0.8, 2, 1.4);
        }
        // 更新屏幕内容为真实终端输出（包含状态颜色）
        const lastUpdate = this.officeObjects[deskKey].lastTerminalUpdate || 0;
        const now = Date.now();
        if (now - lastUpdate > 3000) { // 每3秒更新一次
          this.officeObjects[deskKey].lastTerminalUpdate = now;
          this.officeBuilder.updateDeskTerminal(this.officeObjects[deskKey], agent.id, agent.status);
        }
      } else if (agent.id === 'openclaw') {
        // OpenClaw 也显示终端内容（和 MC 一样）
        const lastUpdate = this.officeObjects.mainDesk.lastTerminalUpdate || 0;
        const now = Date.now();
        if (now - lastUpdate > 3000) { // 每3秒更新一次
          this.officeObjects.mainDesk.lastTerminalUpdate = now;
          this.officeBuilder.updateDeskTerminal(this.officeObjects.mainDesk, agent.id, agent.status);
        }
      }
    });

    // Remove characters for agents that no longer exist
    const agentIds = new Set(agents.map(a => a.id));
    for (const agentId of Object.keys(this.characterManager.characters)) {
      if (!agentIds.has(agentId)) {
        this.characterManager.removeCharacter(agentId);
      }
    }

    // 使用 agentManager.getTaskBoardData() 获取任务数据（与弹出框一致）
    const taskData = agentManager.getTaskBoardData();
    taskData.done = this.taskBoard.history || [];

    // Update 3D board content (throttled)
    const now = Date.now();
    if (now - this.lastBoardUpdate > 3000) { // 每3秒更新一次
      this.lastBoardUpdate = now;
      if (this.officeBuilder) {
        this.officeBuilder.updateBoardContent(taskData);
      }
    }

    // Update task board UI if visible
    if (this.taskBoard.isVisible) {
      this.taskBoard.update();
    }
  }

  onConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');

    dot.className = 'status-dot ' + status;

    const statusText = {
      'online': '已连接',
      'offline': '未连接',
      'connecting': '连接中...'
    };
    text.textContent = statusText[status] || status;
  }

  animate() {
    if (!this.isRunning) return;

    requestAnimationFrame(() => this.animate());

    const deltaTime = this.clock.getDelta();

    // Update controls
    this.controls.update();

    // Update characters
    this.characterManager.update(deltaTime);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  // 直接用 WS 推送的 output 文本刷新 3D 显示器纹理（无需额外 HTTP 请求）
  updateScreenTexture(desk, output, status) {
    if (!desk || !desk.mainMonitor) return;

    const screen = desk.mainMonitor.userData?.screen;
    if (!screen || !screen.userData) return;

    const { canvas, ctx, texture } = screen.userData;

    const bgColors = {
      running: '#0d1f0d',
      idle: '#0d1117',
      offline: '#1a1a1a',
      error: '#1f0d0d'
    };
    const statusColors = {
      running: '#48bb78',
      idle: '#3182ce',
      offline: '#718096',
      error: '#f56565'
    };

    const bgColor = bgColors[status] || bgColors.idle;

    // 清空画布
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 状态指示条
    ctx.fillStyle = statusColors[status] || '#3182ce';
    ctx.fillRect(0, 0, canvas.width, 4);

    // 绘制终端内容
    ctx.font = '12px Monaco, monospace';
    const lines = (output || '').split('\n').slice(-15);
    let y = 24;
    lines.forEach(line => {
      if (line.includes('Error') || line.includes('error')) {
        ctx.fillStyle = '#f85149';
      } else if (line.includes('✓') || line.includes('success') || line.includes('Done')) {
        ctx.fillStyle = '#3fb950';
      } else if (line.includes('$') || line.includes('>') || line.includes('╭') || line.includes('╰')) {
        ctx.fillStyle = '#58a6ff';
      } else if (line.includes('│')) {
        ctx.fillStyle = '#8b949e';
      } else {
        ctx.fillStyle = '#c9d1d9';
      }
      ctx.fillText(line.substring(0, 60), 10, y);
      y += 15;
    });

    texture.needsUpdate = true;
  }

  destroy() {
    this.isRunning = false;
    if (this.controls) this.controls.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.officeScene = new OfficeScene();
  window.officeScene.init().catch(console.error);
});

// Global panel instance for button callbacks
window.agentPanel = null;
