class CharacterManager {
  constructor(scene) {
    this.scene = scene;
    this.characters = {};
    this.materials = this.createMaterials();
  }

  createMaterials() {
    return {
      // Skin tones
      skin: new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        roughness: 0.6,
        metalness: 0.0
      }),

      // Shirt colors
      shirtBlue: new THREE.MeshStandardMaterial({
        color: 0x4299e1,
        roughness: 0.8,
        metalness: 0.0
      }),

      shirtRed: new THREE.MeshStandardMaterial({
        color: 0xf56565,
        roughness: 0.8,
        metalness: 0.0
      }),

      shirtGreen: new THREE.MeshStandardMaterial({
        color: 0x48bb78,
        roughness: 0.8,
        metalness: 0.0
      }),

      // Pants
      pants: new THREE.MeshStandardMaterial({
        color: 0x2d3748,
        roughness: 0.9,
        metalness: 0.0
      }),

      // Hair
      hair: new THREE.MeshStandardMaterial({
        color: 0x1a202c,
        roughness: 0.9,
        metalness: 0.0
      }),

      // Shoes
      shoes: new THREE.MeshStandardMaterial({
        color: 0x744210,
        roughness: 0.6,
        metalness: 0.1
      }),

      // Bubble
      bubble: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        roughness: 0.2
      }),

      // Alert indicator
      alert: new THREE.MeshStandardMaterial({
        color: 0xf56565,
        emissive: 0xf56565,
        emissiveIntensity: 0.5
      })
    };
  }

  createCharacter(agentId, type, options = {}) {
    const character = new Character(this.scene, agentId, type, {
      ...options,
      materials: this.materials
    });

    this.characters[agentId] = character;
    return character;
  }

  updateCharacterName(agentId, name) {
    const character = this.characters[agentId];
    if (character && name) {
      character.updateName(name);
    }
  }

  getCharacter(agentId) {
    return this.characters[agentId];
  }

  updateCharacterStatus(agentId, status, taskData = null) {
    const character = this.characters[agentId];
    if (character) {
      character.setStatus(status, taskData);
    }
  }

  removeCharacter(agentId) {
    const character = this.characters[agentId];
    if (character) {
      character.destroy();
      delete this.characters[agentId];
    }
  }

  update(deltaTime) {
    Object.values(this.characters).forEach(char => char.update(deltaTime));
  }
}

class Character {
  constructor(scene, agentId, type, options) {
    this.scene = scene;
    this.agentId = agentId;
    this.type = type;
    this.options = options;
    this.materials = options.materials;
    this.displayName = agentId; // 默认使用 agentId，会被 updateName 更新

    this.status = 'idle';
    this.statusTimer = 0;
    this.group = new THREE.Group();
    this.parts = {};
    this.bubbles = [];

    this.buildCharacter();
    scene.add(this.group);
  }

  updateName(name) {
    if (name && name !== this.displayName) {
      this.displayName = name;
      // 重新创建衬衫材质
      this.updateShirtWithName();
      // 头顶标签已移除
    }
  }

  buildCharacter() {
    const isMain = this.type === 'openclaw';
    const shirtMat = isMain ? this.materials.shirtRed :
                      this.options.index === 0 ? this.materials.shirtBlue :
                      this.materials.shirtGreen;

    // 站立办公 - 脚底在 y=0
    const groundLevel = 0;

    // 创建带名字的衬衫材质
    const shirtWithNameMat = this.createShirtWithName(isMain, shirtMat.color);

    // Body (standing) - 躯干
    const bodyGeometry = new THREE.BoxGeometry(0.32, 0.45, 0.22);
    this.parts.body = new THREE.Mesh(bodyGeometry, shirtWithNameMat);
    this.parts.body.position.y = groundLevel + 0.65; // 1.05m 身高中心
    this.parts.body.castShadow = true;
    this.group.add(this.parts.body);

    // Head
    const headGeometry = new THREE.BoxGeometry(0.22, 0.26, 0.22);
    this.parts.head = new THREE.Mesh(headGeometry, this.materials.skin);
    this.parts.head.position.y = groundLevel + 0.65 + 0.35; // 1.38m
    this.parts.head.castShadow = true;
    this.group.add(this.parts.head);

    // Hair/Hat
    const hairGeometry = new THREE.BoxGeometry(0.24, 0.06, 0.24);
    this.parts.hair = new THREE.Mesh(hairGeometry, this.materials.hair);
    this.parts.hair.position.y = groundLevel + 0.65 + 0.48; // 1.51m
    this.group.add(this.parts.hair);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.022, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    this.parts.eyeL = new THREE.Mesh(eyeGeometry, eyeMat);
    this.parts.eyeL.position.set(-0.05, groundLevel + 0.65 + 0.35, 0.12);
    this.group.add(this.parts.eyeL);

    this.parts.eyeR = new THREE.Mesh(eyeGeometry, eyeMat);
    this.parts.eyeR.position.set(0.05, groundLevel + 0.65 + 0.35, 0.12);
    this.group.add(this.parts.eyeR);

    // Arms - 上臂
    const armGeometry = new THREE.BoxGeometry(0.09, 0.3, 0.09);

    this.parts.armL = new THREE.Mesh(armGeometry, shirtMat);
    this.parts.armL.position.set(-0.2, groundLevel + 0.82, 0);
    this.parts.armL.rotation.z = 0.1;
    this.parts.armL.castShadow = true;
    this.group.add(this.parts.armL);

    this.parts.armR = new THREE.Mesh(armGeometry, shirtMat);
    this.parts.armR.position.set(0.2, groundLevel + 0.82, 0);
    this.parts.armR.rotation.z = -0.1;
    this.parts.armR.castShadow = true;
    this.group.add(this.parts.armR);

    // Forearms - 前臂
    const forearmGeometry = new THREE.BoxGeometry(0.07, 0.28, 0.07);

    this.parts.forearmL = new THREE.Mesh(forearmGeometry, this.materials.skin);
    this.parts.forearmL.position.set(0, -0.25, 0.05);
    this.parts.forearmL.rotation.x = -0.3;
    this.parts.armL.add(this.parts.forearmL);

    this.parts.forearmR = new THREE.Mesh(forearmGeometry, this.materials.skin);
    this.parts.forearmR.position.set(0, -0.25, 0.05);
    this.parts.forearmR.rotation.x = -0.3;
    this.parts.armR.add(this.parts.forearmR);

    // Hands
    const handGeometry = new THREE.SphereGeometry(0.045, 8, 8);

    this.parts.handL = new THREE.Mesh(handGeometry, this.materials.skin);
    this.parts.handL.position.set(0, -0.16, 0);
    this.parts.forearmL.add(this.parts.handL);

    this.parts.handR = new THREE.Mesh(handGeometry, this.materials.skin);
    this.parts.handR.position.set(0, -0.16, 0);
    this.parts.forearmR.add(this.parts.handR);

    // Legs - 站姿
    // 大腿
    const thighGeometry = new THREE.BoxGeometry(0.12, 0.45, 0.12);

    this.parts.thighL = new THREE.Mesh(thighGeometry, this.materials.pants);
    this.parts.thighL.position.set(-0.11, groundLevel + 0.35, 0);
    this.parts.thighL.rotation.x = 0.05; // 轻微前倾
    this.group.add(this.parts.thighL);

    this.parts.thighR = new THREE.Mesh(thighGeometry, this.materials.pants);
    this.parts.thighR.position.set(0.11, groundLevel + 0.35, 0);
    this.parts.thighR.rotation.x = 0.05;
    this.group.add(this.parts.thighR);

    // 小腿
    const calfGeometry = new THREE.BoxGeometry(0.1, 0.45, 0.1);

    this.parts.calfL = new THREE.Mesh(calfGeometry, this.materials.pants);
    this.parts.calfL.position.set(0, -0.42, 0.02);
    this.parts.thighL.add(this.parts.calfL);

    this.parts.calfR = new THREE.Mesh(calfGeometry, this.materials.pants);
    this.parts.calfR.position.set(0, -0.42, 0.02);
    this.parts.thighR.add(this.parts.calfR);

    // 鞋子
    const shoeGeometry = new THREE.BoxGeometry(0.11, 0.08, 0.22);

    this.parts.shoeL = new THREE.Mesh(shoeGeometry, this.materials.shoes);
    this.parts.shoeL.position.set(0, -0.22, 0.05);
    this.parts.calfL.add(this.parts.shoeL);

    this.parts.shoeR = new THREE.Mesh(shoeGeometry, this.materials.shoes);
    this.parts.shoeR.position.set(0, -0.22, 0.05);
    this.parts.calfR.add(this.parts.shoeR);

    // Status bubble container
    this.parts.bubbleContainer = new THREE.Group();
    this.parts.bubbleContainer.position.set(0, 1.8, 0);
    this.group.add(this.parts.bubbleContainer);

    // Set initial pose
    this.setStatus('idle');
  }

  // 头顶名字标签已移除 - 相关方法保留为空实现
  createNameTag() {
    // 不创建头顶标签
  }

  updateNameTag() {
    // 不更新头顶标签
  }

  updateNameTagFacing(camera) {
    // 不更新头顶标签朝向
  }

  createShirtWithName(isMain, baseColor) {
    // 创建 Canvas 绘制带名字的衬衫 - 使用更大尺寸提高清晰度
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // 使用原始名字（从 agent 数据获取）
    const name = this.displayName || this.agentId || 'AGENT';

    if (isMain) {
      // Openclaw - 纯色红衬衫
      ctx.fillStyle = '#f56565';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // MC agents - 格子衫（程序员标配）
      const baseColor = this.options.index % 2 === 0 ? '#4299e1' : '#48bb78';
      const gridColor = baseColor === '#4299e1' ? '#3182ce' : '#38a169';

      // 底色
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制格子
      const gridSize = 64;
      ctx.fillStyle = gridColor;
      for (let y = 0; y < canvas.height; y += gridSize) {
        for (let x = 0; x < canvas.width; x += gridSize) {
          if ((x / gridSize + y / gridSize) % 2 === 0) {
            ctx.fillRect(x, y, gridSize, gridSize);
          }
        }
      }

      // 细格子线条
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      for (let i = 0; i < canvas.width; i += gridSize / 2) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += gridSize / 2) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }
    }

    // 绘制文字背景圆角矩形（增加对比度）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this.roundRect(ctx, 60, 180, 392, 152, 20);
    ctx.fill();

    // 文字描边（增加可读性）
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 8;
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(name, canvas.width / 2, canvas.height / 2);

    // 文字填充
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.0
    });
  }

  updateShirtWithName() {
    // 重新创建衬衫材质
    const isMain = this.type === 'openclaw';
    const newMaterial = this.createShirtWithName(isMain, null);
    if (this.parts.body) {
      this.parts.body.material = newMaterial;
    }
  }

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  setPosition(x, y, z, rotation = 0) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = rotation;
  }

  setStatus(status, taskData = null) {
    this.status = status;
    this.statusTimer = 0;

    // Clear existing bubbles
    this.clearBubbles();

    switch (status) {
      case 'running':
        this.setWorkingPose();
        this.showTaskBubble(taskData);
        break;

      case 'idle':
        this.setIdlePose();
        break;

      case 'pending':
      case 'approval':
        this.setApprovalPose();
        this.showAlertBubble();
        break;

      case 'offline':
        this.setOfflinePose();
        break;

      case 'error':
        this.setErrorPose();
        this.showErrorBubble();
        break;

      default:
        this.setIdlePose();
    }
  }

  setWorkingPose() {
    // 站立办公 - 身体前倾看显示器
    this.parts.body.rotation.x = 0.15;
    this.parts.head.rotation.x = 0.1;

    // OpenClaw 工作姿势：准备动作（手在键盘上方）
    if (this.type === 'openclaw') {
      this.parts.armL.rotation.x = -0.4;
      this.parts.armR.rotation.x = -0.4;
      this.parts.forearmL.rotation.x = 0.3;
      this.parts.forearmR.rotation.x = 0.3;
    } else {
      // MC agents：手臂垂直放在两侧
      this.parts.armL.rotation.x = 0;
      this.parts.armR.rotation.x = 0;
      this.parts.forearmL.rotation.x = 0;
      this.parts.forearmR.rotation.x = 0;
    }

    this.parts.armL.rotation.z = 0.1;
    this.parts.armR.rotation.z = -0.1;
  }

  setIdlePose() {
    // 站立放松
    this.parts.body.rotation.x = 0;
    this.parts.head.rotation.x = 0;

    // 手臂放松
    this.parts.armL.rotation.x = 0;
    this.parts.armL.rotation.z = 0.1;
    this.parts.armR.rotation.x = 0;
    this.parts.armR.rotation.z = -0.1;

    this.parts.forearmL.rotation.x = -0.3;
    this.parts.forearmR.rotation.x = -0.3;
  }

  setApprovalPose() {
    // 转头看主管
    this.parts.head.rotation.y = Math.PI / 3;

    // 一只手举起
    this.parts.armL.rotation.x = -1.0;
    this.parts.armR.rotation.x = -0.2;
  }

  setOfflinePose() {
    // offline 显示为灰色（不透明），但保留衬衫上的名字
    this.group.visible = true;
    // 只改变手臂颜色为灰色，不改变身体（身体上有名字）
    const grayMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
      metalness: 0.1
    });
    // 身体保持原有材质（带有名字）
    this.parts.head.material = this.materials.skin;
    this.parts.armL.material = grayMaterial;
    this.parts.armR.material = grayMaterial;
    // 手臂放松下垂
    this.parts.armL.rotation.x = 0;
    this.parts.armR.rotation.x = 0;
    this.parts.forearmL.rotation.x = -0.1;
    this.parts.forearmR.rotation.x = -0.1;
  }

  setErrorPose() {
    this.parts.body.rotation.x = -0.2;
    this.parts.head.rotation.x = -0.15;

    // 抱头
    this.parts.armL.rotation.x = -1.8;
    this.parts.armL.rotation.z = 0.4;
    this.parts.armR.rotation.x = -1.8;
    this.parts.armR.rotation.z = -0.4;
  }

  showTaskBubble(taskData) {
    if (!taskData) return;

    // Create simple floating text representation
    const bubble = this.createTextBubble('📝', 0xffaa00);
    this.parts.bubbleContainer.add(bubble);
    this.bubbles.push(bubble);
  }

  showAlertBubble() {
    const bubble = this.createTextBubble('❗', 0xff4444);
    bubble.material = this.materials.alert;
    this.parts.bubbleContainer.add(bubble);
    this.bubbles.push(bubble);
  }

  showErrorBubble() {
    const bubble = this.createTextBubble('❌', 0xff0000);
    this.parts.bubbleContainer.add(bubble);
    this.bubbles.push(bubble);
  }

  createTextBubble(text, color) {
    // Simple sphere bubble
    const geometry = new THREE.SphereGeometry(0.15, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      emissive: color,
      emissiveIntensity: 0.3
    });
    const bubble = new THREE.Mesh(geometry, material);
    return bubble;
  }

  clearBubbles() {
    this.bubbles.forEach(bubble => {
      this.parts.bubbleContainer.remove(bubble);
    });
    this.bubbles = [];
  }

  update(deltaTime) {
    if (!this.group.visible) return;

    this.statusTimer += deltaTime;

    // Animation based on status
    switch (this.status) {
      case 'running':
        // OpenClaw 根据 activity 状态显示不同动作
        if (this.type === 'openclaw') {
          const agent = agentManager.getAgent(this.agentId);
          const activity = agent?.activity;

          if (activity?.currentState === 'thinking') {
            // 思考：手托下巴
            this.parts.armL.rotation.x = -1.2;
            this.parts.armL.rotation.z = 0.3;
            this.parts.forearmL.rotation.x = -0.5;
            this.parts.head.rotation.x = 0.2;
            this.parts.head.rotation.y = Math.sin(this.statusTimer * 2) * 0.1;
          } else if (activity?.currentState === 'tool_call') {
            // 执行工具：快速敲键盘
            const typingSpeed = 20;
            const leftArm = Math.sin(this.statusTimer * typingSpeed);
            this.parts.armL.rotation.x = -0.5 + leftArm * 0.1;
            this.parts.forearmL.rotation.x = 0.3 + Math.abs(leftArm) * 0.2;
            this.parts.head.rotation.x = 0.15;
          } else {
            // 默认：手臂垂直两侧
            this.parts.armL.rotation.x = 0;
            this.parts.armR.rotation.x = 0;
            this.parts.forearmL.rotation.x = 0;
            this.parts.forearmR.rotation.x = 0;
            this.parts.head.rotation.x = 0.1;
          }
        } else {
          // MC agents：手臂垂直两侧
          this.parts.armL.rotation.x = 0;
          this.parts.armR.rotation.x = 0;
          this.parts.forearmL.rotation.x = 0;
          this.parts.forearmR.rotation.x = 0;
        }

        // 头部微动看屏幕
        this.parts.head.rotation.y = Math.sin(this.statusTimer * 0.3) * 0.05;

        // 身体微前倾
        this.parts.body.rotation.x = 0.15;
        break;

      case 'idle':
        // 呼吸效果（站立）
        this.parts.body.position.y = 0.65 + Math.sin(this.statusTimer * 1.5) * 0.003;
        this.parts.head.position.y = 1.0 + Math.sin(this.statusTimer * 1.5) * 0.003;

        // 手臂垂直放在两侧，不摆动
        this.parts.armL.rotation.x = 0;
        this.parts.armR.rotation.x = 0;
        this.parts.forearmL.rotation.x = 0;
        this.parts.forearmR.rotation.x = 0;
        this.parts.armL.rotation.z = 0.1;
        this.parts.armR.rotation.z = -0.1;

        // 偶尔抬头看屏幕
        this.parts.head.rotation.y = Math.sin(this.statusTimer * 0.5) * 0.1;
        this.parts.head.rotation.x = 0;

        // OpenClaw idle 时偶尔思考
        if (this.type === 'openclaw') {
          const agent = agentManager.getAgent(this.agentId);
          if (agent?.activity?.currentState === 'idle') {
            // 发呆：头低下一点
            this.parts.head.rotation.x = 0.1;
          }
        }
        break;

      case 'pending':
        // 警示闪烁
        if (this.bubbles.length > 0) {
          const scale = 1 + Math.sin(this.statusTimer * 4) * 0.15;
          this.bubbles[0].scale.setScalar(scale);
        }
        // 左右看
        this.parts.head.rotation.y = Math.sin(this.statusTimer * 2) * 0.3;
        break;
    }

    // 气泡浮动
    this.bubbles.forEach((bubble, i) => {
      bubble.position.y = Math.sin(this.statusTimer * 1.5 + i) * 0.04;
    });
  }

  destroy() {
    this.clearBubbles();
    this.scene.remove(this.group);
  }
}
