class OfficeBuilder {
  constructor(scene) {
    this.scene = scene;
    this.objects = {};
    this.materials = this.createMaterials();
  }

  createMaterials() {
    return {
      // 明亮木地板
      floor: new THREE.MeshStandardMaterial({
        color: 0xe8ddd4,
        roughness: 0.6,
        metalness: 0.05
      }),

      // 白墙 - 明亮
      wall: new THREE.MeshStandardMaterial({
        color: 0xf7fafc,
        roughness: 0.9,
        metalness: 0.0
      }),

      // 浅色木桌面
      wood: new THREE.MeshStandardMaterial({
        color: 0xd4a574,
        roughness: 0.5,
        metalness: 0.1
      }),

      // 白色桌面
      whiteDesk: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.1
      }),

      // 金属
      metal: new THREE.MeshStandardMaterial({
        color: 0xa0aec0,
        roughness: 0.3,
        metalness: 0.8
      }),

      // 屏幕待机 - 使用 BasicMaterial 确保发光
      screen: new THREE.MeshBasicMaterial({
        color: 0x1a202c
      }),

      // 屏幕工作 - 亮蓝色发光
      screenActive: new THREE.MeshBasicMaterial({
        color: 0x3182ce
      }),

      // 屏幕代码 - 亮绿色发光
      screenCode: new THREE.MeshBasicMaterial({
        color: 0x48bb78
      }),

      // MacBook 银色
      macbook: new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        roughness: 0.2,
        metalness: 0.9
      }),

      // 黑板
      blackboard: new THREE.MeshStandardMaterial({
        color: 0x2d3748,
        roughness: 0.9,
        metalness: 0.0
      }),

      // 黑板边框 - 现代白色
      blackboardFrame: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.1
      }),

      // 植物
      plant: new THREE.MeshStandardMaterial({
        color: 0x48bb78,
        roughness: 0.7,
        metalness: 0.0
      }),

      // 花盆
      pot: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.0
      }),

      // 咖啡机
      coffee: new THREE.MeshStandardMaterial({
        color: 0x2d3748,
        roughness: 0.2,
        metalness: 0.8
      }),

      // 文件柜
      cabinet: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.5,
        metalness: 0.3
      }),

      // 落地窗玻璃
      glass: new THREE.MeshStandardMaterial({
        color: 0xe6f7ff,
        transparent: true,
        opacity: 0.2,
        roughness: 0.0,
        metalness: 0.95
      }),

      // 人体工学椅 - 黑色网布
      chairFabric: new THREE.MeshStandardMaterial({
        color: 0x1a202c,
        roughness: 0.9,
        metalness: 0.0
      }),

      // 显示器支架
      monitorArm: new THREE.MeshStandardMaterial({
        color: 0x2d3748,
        roughness: 0.4,
        metalness: 0.7
      }),

      // 天空
      sky: new THREE.MeshBasicMaterial({
        color: 0x87ceeb
      })
    };
  }

  build() {
    this.buildFloor();
    this.buildWalls();
    this.buildWindows();
    this.buildShanghaiSkyline();

    // 主工位 - 主管（靠窗位置），距离人物 0.8
    this.objects.mainDesk = this.buildProgrammerDesk(0, 0, -2.6, 2.2, 1.4, true);

    // MC agent 工位 - 动态创建，先不创建具体工位
    // 工位将在 scene.js 中根据实际的 MC agents 动态创建

    // 任务黑板（墙上）
    this.objects.taskBoard = this.buildModernTaskBoard(0, 2.5, -4.95);

    // 装饰
    this.buildModernPlant(-4.5, 0, 3.5);
    this.buildModernPlant(4.5, 0, 3.5);
    this.buildModernPlant(-2, 0, -3.5);
    this.buildModernCoffeeMachine(4.5, 0, -2);
    this.buildModernCabinet(-4.5, 0, -2);

    return this.objects;
  }

  buildFloor() {
    // 大底板
    const floorGeometry = new THREE.PlaneGeometry(30, 30);
    const floor = new THREE.Mesh(floorGeometry, this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 地毯区域
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 10),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 1,
        metalness: 0
      })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = 0.01;
    carpet.position.z = 0;
    carpet.receiveShadow = true;
    this.scene.add(carpet);
  }

  buildWalls() {
    const wallThickness = 0.15;

    // 左侧墙（落地窗）- 只需要边框
    const leftWallTop = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, 2, 15),
      this.materials.wall
    );
    leftWallTop.position.set(-8, 5, 0);
    this.scene.add(leftWallTop);

    const leftWallBottom = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, 1, 15),
      this.materials.wall
    );
    leftWallBottom.position.set(-8, 0.5, 0);
    this.scene.add(leftWallBottom);

    // 右侧墙
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, 7, 15),
      this.materials.wall
    );
    rightWall.position.set(8, 3.5, 0);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    // 后墙（黑板所在墙）
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(16, 7, wallThickness),
      this.materials.wall
    );
    backWall.position.set(0, 3.5, -5);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // 天花板
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 15),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8
      })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 7;
    this.scene.add(ceiling);
  }

  buildWindows() {
    // 左侧落地窗（面向城市景观）
    const windowGroup = new THREE.Group();

    // 玻璃
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 6),
      this.materials.glass
    );
    glass.rotation.z = Math.PI / 2;
    glass.position.set(-7.9, 3, 0);
    windowGroup.add(glass);

    // 窗框
    const frames = [
      { pos: [-7.95, 3, 0], rot: [0, 0, 0], size: [0.1, 6, 0.15] },  // 竖框
      { pos: [-7.95, 6, 0], rot: [0, 0, 0], size: [0.1, 0.15, 15] }, // 上框
      { pos: [-7.95, 0, 0], rot: [0, 0, 0], size: [0.1, 0.15, 15] }, // 下框
    ];

    frames.forEach(f => {
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(...f.size),
        new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.3, metalness: 0.8 })
      );
      frame.position.set(...f.pos);
      windowGroup.add(frame);
    });

    // 窗格
    for (let i = -7; i <= 7; i += 3.5) {
      const vBar = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 6, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x4a5568 })
      );
      vBar.position.set(-7.95, 3, i);
      windowGroup.add(vBar);
    }

    this.scene.add(windowGroup);
  }

  buildShanghaiSkyline() {
    const skylineGroup = new THREE.Group();

    // 天空渐变背景 - 放在窗外左侧
    const skyGeo = new THREE.PlaneGeometry(30, 25);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87ceeb
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(-15, 8, 0);
    sky.rotation.y = Math.PI / 2;
    skylineGroup.add(sky);

    // 魔都三件套 - 放在窗户正对面（左侧），让室内能看到
    // 窗户在 x=-8，把建筑物放在 x=-12 左右，z 方向分散
    const xPos = -12; // 建筑物位置，在窗外

    // 上海中心（最高，螺旋上升）
    const shanghaiTower = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const tier = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.8 - i * 0.025,
          0.8 - (i - 1) * 0.025,
          0.7,
          8
        ),
        new THREE.MeshStandardMaterial({
          color: 0x5a9eb4,
          roughness: 0.2,
          metalness: 0.8
        })
      );
      tier.position.y = i * 0.55;
      tier.rotation.y = i * 0.15;
      shanghaiTower.add(tier);
    }
    shanghaiTower.position.set(xPos, 0, -6);
    skylineGroup.add(shanghaiTower);

    // 环球金融中心（开瓶器）
    const wfc = new THREE.Group();
    const wfcBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 9, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0x97c4e8,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95
      })
    );
    wfcBody.position.y = 4.5;
    wfc.add(wfcBody);
    const wfcTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.7, 1.2, 4),
      new THREE.MeshStandardMaterial({
        color: 0x6aadd4,
        roughness: 0.2,
        metalness: 0.8
      })
    );
    wfcTop.position.y = 9.2;
    wfcTop.rotation.y = Math.PI / 4;
    wfc.add(wfcTop);
    wfc.position.set(xPos, 0, 0);
    skylineGroup.add(wfc);

    // 金茂大厦（塔尖）
    const jinmao = new THREE.Group();
    for (let i = 0; i < 15; i++) {
      const tier = new THREE.Mesh(
        new THREE.BoxGeometry(
          1 - i * 0.045,
          0.6,
          1 - i * 0.045
        ),
        new THREE.MeshStandardMaterial({
          color: 0x9b8b6b,
          roughness: 0.3,
          metalness: 0.6
        })
      );
      tier.position.y = i * 0.55;
      jinmao.add(tier);
    }
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 2.2, 8),
      new THREE.MeshStandardMaterial({
        color: 0xb0a080,
        roughness: 0.3,
        metalness: 0.7
      })
    );
    spire.position.y = 8;
    jinmao.add(spire);
    jinmao.position.set(xPos, 0, 6);
    skylineGroup.add(jinmao);

    // 东方明珠（球体塔）
    const dongfang = new THREE.Group();
    const lowerBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xe8d5b7,
        roughness: 0.3,
        metalness: 0.5
      })
    );
    lowerBall.position.y = 2.5;
    dongfang.add(lowerBall);
    const upperBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xe8d5b7,
        roughness: 0.3,
        metalness: 0.5
      })
    );
    upperBall.position.y = 6;
    dongfang.add(upperBall);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 6, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.8
      })
    );
    pillar.position.y = 3.5;
    dongfang.add(pillar);
    dongfang.position.set(xPos, 0, 12);
    skylineGroup.add(dongfang);

    // 其他背景建筑
    const buildingColors = [0x718096, 0x4a5568, 0x2d3748, 0xa0aec0];
    for (let z = -15; z < 20; z += 4) {
      // 跳过三件套位置
      if (Math.abs(z - (-6)) < 3 || Math.abs(z - 0) < 3 || Math.abs(z - 6) < 3 || Math.abs(z - 12) < 3) continue;

      const height = 3 + Math.random() * 5;
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, height, 1.2),
        new THREE.MeshStandardMaterial({
          color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
          roughness: 0.5,
          metalness: 0.4
        })
      );
      building.position.set(xPos, height / 2, z);
      skylineGroup.add(building);
    }

    this.scene.add(skylineGroup);
  }

  // 程序员风格工位 - 多显示器配置
  buildProgrammerDesk(x, y, z, width = 2, depth = 1.2, isMain = false) {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(x, y, z);

    const deskHeight = isMain ? 0.75 : 0.72;

    // 白色桌面（现代风格）
    const desktop = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.04, depth),
      this.materials.whiteDesk
    );
    desktop.position.y = deskHeight;
    desktop.castShadow = true;
    desktop.receiveShadow = true;
    deskGroup.add(desktop);

    // 桌腿 - 现代金属腿
    const legPositions = [
      [-width/2 + 0.15, deskHeight/2, -depth/2 + 0.15],
      [width/2 - 0.15, deskHeight/2, -depth/2 + 0.15],
      [-width/2 + 0.15, deskHeight/2, depth/2 - 0.15],
      [width/2 - 0.15, deskHeight/2, depth/2 - 0.15]
    ];

    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.02, deskHeight, 8),
        this.materials.metal
      );
      leg.position.set(...pos);
      leg.castShadow = true;
      deskGroup.add(leg);
    });

    // 单显示器 - 放在桌子后方，面向人物（人物在 +z 方向）
    const mainMonitor = this.buildWideMonitor(isMain);
    // 屏幕中心高度 = 桌面高度 + 支架高度 + 屏幕半高，确保底座接触桌面
    const armHeight = 0.2;
    const screenHeight = isMain ? 0.5 : 0.42;
    const screenCenterHeight = deskHeight + armHeight + screenHeight/2;
    mainMonitor.position.set(0, screenCenterHeight, -depth/2 + 0.55);
    deskGroup.add(mainMonitor);

    // MacBook - 放在显示器左侧
    const macbook = this.buildMacBook();
    macbook.position.set(isMain ? -0.6 : -0.5, deskHeight + 0.02, -depth/2 + 0.5);
    deskGroup.add(macbook);

    // 机械键盘 - 放在桌子前方边缘（靠近人物）
    const keyboard = this.buildMechanicalKeyboard();
    keyboard.position.set(0, deskHeight + 0.025, depth/2 - 0.15);
    deskGroup.add(keyboard);

    // 鼠标
    const mouse = this.buildMouse();
    mouse.position.set(0.3, deskHeight + 0.02, depth/2 - 0.15);
    deskGroup.add(mouse);

    // 站立办公 - 移除椅子

    this.scene.add(deskGroup);

    return {
      group: deskGroup,
      mainMonitor: mainMonitor,
      macbook: macbook,
      position: new THREE.Vector3(x, y, z)
    };
  }

  // 宽屏显示器 - 屏幕面向 +z（人物方向）
  buildWideMonitor(isMain = false) {
    const group = new THREE.Group();

    const width = isMain ? 0.9 : 0.75;
    const height = isMain ? 0.5 : 0.42;

    // 屏幕背面（深色）- 面向 -z
    const screenBack = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1a202c })
    );
    screenBack.position.y = 0;
    screenBack.position.z = -0.01;
    group.add(screenBack);

    // 屏幕正面 - 使用 Canvas 纹理显示终端内容
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 512;
    screenCanvas.height = 256;
    const ctx = screenCanvas.getContext('2d');

    // 绘制终端背景
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);

    // 绘制终端内容
    ctx.font = '14px Monaco, monospace';
    ctx.fillStyle = '#58a6ff';
    ctx.fillText('~/workspace/agent-dashboard $ npm start', 10, 25);
    ctx.fillStyle = '#7ee787';
    ctx.fillText('> Starting development server...', 10, 45);
    ctx.fillStyle = '#e3b341';
    ctx.fillText('> Loading agents... OK', 10, 65);
    ctx.fillStyle = '#a371f7';
    ctx.fillText('> WebSocket connected', 10, 85);
    ctx.fillStyle = '#79c0ff';
    ctx.fillText('> Agent openclaw: running', 10, 105);
    ctx.fillStyle = '#56d364';
    ctx.fillText('> Agent mc-1: idle', 10, 125);
    ctx.fillStyle = '#56d364';
    ctx.fillText('> Agent mc-2: running', 10, 145);
    ctx.fillStyle = '#8b949e';
    ctx.fillText('>_ ', 10, 175);

    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.minFilter = THREE.LinearFilter;

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: screenTexture })
    );
    screen.position.y = 0;
    screen.position.z = 0.01;
    screen.userData = { canvas: screenCanvas, ctx: ctx, texture: screenTexture };
    group.add(screen);
    group.userData.screen = screen;

    // 窄边框效果
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.01, height + 0.01, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.3 })
    );
    bezel.position.z = -0.005;
    group.add(bezel);

    // 显示器支架臂
    const armHeight = 0.2;
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, armHeight, 0.06),
      this.materials.monitorArm
    );
    arm.position.y = -height/2 - armHeight/2;
    group.add(arm);

    // 支架底座（更大更显眼，稍微抬高避免闪烁）
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.05, 16),
      this.materials.monitorArm
    );
    base.position.y = -height/2 - armHeight + 0.025;
    group.add(base);

    return group;
  }

  // 竖屏显示器（程序员看代码用）
  buildVerticalMonitor() {
    const group = new THREE.Group();

    const width = 0.35;
    const height = 0.55;

    // 屏幕背面
    const screenBack = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x1a202c })
    );
    screenBack.position.y = 0;
    screenBack.position.z = -0.01;
    group.add(screenBack);

    // 屏幕正面（发光面）
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      this.materials.screenCode
    );
    screen.position.y = 0;
    screen.position.z = 0.01;
    group.add(screen);

    // 边框
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.01, height + 0.01, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.3 })
    );
    bezel.position.z = -0.005;
    group.add(bezel);

    // 支架
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.2, 0.06),
      this.materials.monitorArm
    );
    arm.position.y = -0.18;
    group.add(arm);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.02, 16),
      this.materials.monitorArm
    );
    base.position.y = -0.29;
    group.add(base);

    return group;
  }

  // MacBook
  buildMacBook() {
    const group = new THREE.Group();

    // 底座
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.015, 0.24),
      this.materials.macbook
    );
    base.position.y = 0;
    group.add(base);

    // 屏幕（打开状态）- 面向 +z（人物方向）
    const screenLid = new THREE.Group();
    screenLid.position.set(0, 0.007, -0.12); // 屏幕在底座后方

    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.22, 0.008),
      this.materials.macbook
    );
    lid.position.y = 0.11;
    screenLid.add(lid);

    // MacBook 屏幕显示终端内容
    const macCanvas = document.createElement('canvas');
    macCanvas.width = 256;
    macCanvas.height = 160;
    const macCtx = macCanvas.getContext('2d');

    // 终端背景
    macCtx.fillStyle = '#1e1e1e';
    macCtx.fillRect(0, 0, macCanvas.width, macCanvas.height);

    // 终端标题栏
    macCtx.fillStyle = '#323232';
    macCtx.fillRect(0, 0, macCanvas.width, 20);
    macCtx.fillStyle = '#ff5f56';
    macCtx.beginPath();
    macCtx.arc(12, 10, 5, 0, Math.PI * 2);
    macCtx.fill();
    macCtx.fillStyle = '#ffbd2e';
    macCtx.beginPath();
    macCtx.arc(28, 10, 5, 0, Math.PI * 2);
    macCtx.fill();
    macCtx.fillStyle = '#27c93f';
    macCtx.beginPath();
    macCtx.arc(44, 10, 5, 0, Math.PI * 2);
    macCtx.fill();

    // 终端内容
    macCtx.font = '10px Monaco, monospace';
    macCtx.fillStyle = '#4fc1ff';
    macCtx.fillText('$ npm run dev', 10, 40);
    macCtx.fillStyle = '#6cc644';
    macCtx.fillText('[INFO] Server ready', 10, 60);
    macCtx.fillStyle = '#e2c08d';
    macCtx.fillText('[WARN] 3 tasks pending', 10, 80);
    macCtx.fillStyle = '#cccccc';
    macCtx.fillText('Listening on :3210', 10, 100);
    macCtx.fillStyle = '#4fc1ff';
    macCtx.fillText('>_ ', 10, 130);

    const macTexture = new THREE.CanvasTexture(macCanvas);
    macTexture.minFilter = THREE.LinearFilter;

    // 屏幕显示区域 - 面向 +z 方向
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.19),
      new THREE.MeshBasicMaterial({ map: macTexture })
    );
    screen.position.set(0, 0.11, 0.005);
    screen.userData = { canvas: macCanvas, ctx: macCtx, texture: macTexture };
    screenLid.add(screen);
    group.userData.screen = screen;

    screenLid.rotation.x = 0.25; // 打开角度（向前打开，面向人物）
    group.add(screenLid);

    return group;
  }

  // 机械键盘
  buildMechanicalKeyboard() {
    const group = new THREE.Group();

    // 键盘底座
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.02, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.4 })
    );
    group.add(base);

    // 键帽（简化表示）
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 10; col++) {
        const key = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.015, 0.035),
          new THREE.MeshStandardMaterial({
            color: row === 0 ? 0x4a5568 : 0x718096,
            roughness: 0.6
          })
        );
        key.position.set(
          -0.18 + col * 0.04,
          0.015,
          -0.06 + row * 0.04
        );
        group.add(key);
      }
    }

    return group;
  }

  // 鼠标（使用圆柱+球体组合，兼容 r128）
  buildMouse() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.3,
      metalness: 0.2
    });

    // 主体 - 扁圆柱
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12),
      mat
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);

    // 顶部弧度 - 半球
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      mat
    );
    top.position.y = 0.04;
    top.rotation.x = Math.PI / 2;
    group.add(top);

    // 底部弧度
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      mat
    );
    bottom.position.y = -0.04;
    bottom.rotation.x = Math.PI / 2;
    group.add(bottom);

    return group;
  }

  // 人体工学椅
  buildErgonomicChair(isMain = false) {
    const group = new THREE.Group();

    const seatHeight = 0.48;
    const seatWidth = 0.5;
    const seatDepth = 0.5;

    // 座垫（弧形）
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(seatWidth, 0.06, seatDepth),
      this.materials.chairFabric
    );
    seat.position.y = seatHeight;
    seat.castShadow = true;
    group.add(seat);

    // 靠背（高背网布）
    const backrest = new THREE.Mesh(
      new THREE.BoxGeometry(seatWidth, 0.6, 0.05),
      this.materials.chairFabric
    );
    backrest.position.set(0, seatHeight + 0.35, -seatDepth/2 + 0.02);
    backrest.castShadow = true;
    group.add(backrest);

    // 头枕
    const headrest = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.08, 0.04),
      this.materials.chairFabric
    );
    headrest.position.set(0, seatHeight + 0.7, -seatDepth/2 + 0.03);
    group.add(headrest);

    // 腰靠
    const lumbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.12, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x2d3748 })
    );
    lumbar.position.set(0, seatHeight + 0.25, -seatDepth/2 + 0.05);
    group.add(lumbar);

    // 扶手
    const armRestGeo = new THREE.BoxGeometry(0.04, 0.02, 0.15);
    const armRestMat = new THREE.MeshStandardMaterial({ color: 0x2d3748 });

    const leftArm = new THREE.Mesh(armRestGeo, armRestMat);
    leftArm.position.set(-seatWidth/2 - 0.02, seatHeight + 0.2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armRestGeo, armRestMat);
    rightArm.position.set(seatWidth/2 + 0.02, seatHeight + 0.2, 0);
    group.add(rightArm);

    // 扶手支架
    const leftArmSupport = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.2, 0.03),
      this.materials.metal
    );
    leftArmSupport.position.set(-seatWidth/2 - 0.02, seatHeight + 0.1, 0);
    group.add(leftArmSupport);

    const rightArmSupport = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.2, 0.03),
      this.materials.metal
    );
    rightArmSupport.position.set(seatWidth/2 + 0.02, seatHeight + 0.1, 0);
    group.add(rightArmSupport);

    // 气压杆
    const gasLift = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, seatHeight - 0.1, 12),
      this.materials.metal
    );
    gasLift.position.y = (seatHeight - 0.1) / 2;
    group.add(gasLift);

    // 五星脚底座
    const baseGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.02, 0.3),
        this.materials.metal
      );
      leg.position.set(
        Math.sin(angle) * 0.15,
        0.05,
        Math.cos(angle) * 0.15
      );
      leg.rotation.y = angle;
      baseGroup.add(leg);

      // 轮子
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a202c })
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(
        Math.sin(angle) * 0.28,
        0.03,
        Math.cos(angle) * 0.28
      );
      baseGroup.add(wheel);
    }
    group.add(baseGroup);

    return group;
  }

  // 现代风格黑板 - 带直接展示的内容
  buildModernTaskBoard(x, y, z) {
    const boardGroup = new THREE.Group();
    boardGroup.position.set(x, y, z);

    const boardWidth = 5;
    const boardHeight = 2.2;

    // 白色边框
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth + 0.15, boardHeight + 0.15, 0.08),
      this.materials.blackboardFrame
    );
    frame.castShadow = true;
    boardGroup.add(frame);

    // 深色板面 - 使用 PlaneGeometry 来正确显示纹理
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(boardWidth, boardHeight),
      this.materials.blackboard
    );
    board.position.z = 0.05;
    boardGroup.add(board);

    // 创建纹理画布来显示内容
    this.createBoardContent(board, boardWidth, boardHeight);

    // 底部托盘
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(boardWidth, 0.06, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
    );
    tray.position.set(0, -boardHeight/2 - 0.08, 0.05);
    boardGroup.add(tray);

    this.scene.add(boardGroup);

    return {
      group: boardGroup,
      board: board,
      position: new THREE.Vector3(x, y, z)
    };
  }

  // 创建黑板内容纹理
  createBoardContent(boardMesh, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 标题
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📋 TASK BOARD', canvas.width / 2, 50);

    // 分隔线
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 70);
    ctx.lineTo(canvas.width - 50, 70);
    ctx.stroke();

    // 两列布局（DOING 和 DONE）
    const colWidth = (canvas.width - 100) / 2;
    const colX = [60, 60 + colWidth + 20];

    // 列标题
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillStyle = '#a0aec0';

    const titles = ['⚡ DOING', '✅ DONE'];
    const colors = ['#68d391', '#9f7aea'];

    titles.forEach((title, i) => {
      ctx.fillStyle = colors[i];
      ctx.textAlign = 'left';
      ctx.fillText(title, colX[i], 110);

      // 列分隔线
      if (i < 1) {
        ctx.strokeStyle = '#4a5568';
        ctx.beginPath();
        ctx.moveTo(colX[i] + colWidth - 10, 90);
        ctx.lineTo(colX[i] + colWidth - 10, canvas.height - 30);
        ctx.stroke();
      }
    });

    // 保存 canvas 引用以便更新
    this.boardCanvas = canvas;
    this.boardCtx = ctx;
    this.boardColX = colX;
    this.boardColWidth = colWidth;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    // 创建新材质并应用纹理
    const contentMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.1
    });

    // 应用到黑板，只显示在前面（+z 面）
    boardMesh.material = contentMaterial;

    this.boardTexture = texture;
  }

  // 更新黑板内容
  updateBoardContent(taskData) {
    if (!this.boardCtx || !this.boardTexture) return;

    const ctx = this.boardCtx;
    const canvas = this.boardCanvas;

    // 清空并重新绘制背景
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 标题
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📋 TASK BOARD', canvas.width / 2, 50);

    // 分隔线
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 70);
    ctx.lineTo(canvas.width - 50, 70);
    ctx.stroke();

    // 两列（DOING 和 DONE）
    const colX = this.boardColX;
    const colWidth = this.boardColWidth;
    const colors = ['#68d391', '#9f7aea'];
    const titles = ['⚡ DOING', '✅ DONE'];

    titles.forEach((title, i) => {
      ctx.fillStyle = colors[i];
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(title, colX[i], 110);

      // 列分隔线
      if (i < 1) {
        ctx.strokeStyle = '#4a5568';
        ctx.beginPath();
        ctx.moveTo(colX[i] + colWidth - 10, 90);
        ctx.lineTo(colX[i] + colWidth - 10, canvas.height - 30);
        ctx.stroke();
      }
    });

    // 绘制任务
    const drawTasks = (tasks, colIndex, color) => {
      let y = 150;
      ctx.fillStyle = color;
      ctx.font = '18px Arial, sans-serif';

      tasks.slice(0, 4).forEach(task => {
        // 任务卡片背景
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(colX[colIndex], y - 20, colWidth - 20, 50);

        // Agent 名
        ctx.fillStyle = '#a0aec0';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillText(task.agentName || task.alias || 'Unknown', colX[colIndex] + 10, y);

        // 任务描述
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial, sans-serif';
        const desc = task.task ? task.task.substring(0, 25) + '...' : 'No task';
        ctx.fillText(desc, colX[colIndex] + 10, y + 22);

        y += 60;
      });
    };

    drawTasks(taskData.wip || [], 0, '#68d391');
    drawTasks(taskData.done || [], 1, '#9f7aea');

    this.boardTexture.needsUpdate = true;
  }

  // 现代绿植
  buildModernPlant(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // 白色简约花盆
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.15, 0.35, 12),
      this.materials.pot
    );
    pot.position.y = 0.175;
    pot.castShadow = true;
    group.add(pot);

    // 龟背竹风格叶子
    const leafGeo = new THREE.CircleGeometry(0.15, 8);
    const leafMat = this.materials.plant;

    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const angle = (i / 6) * Math.PI * 2;
      leaf.position.set(
        Math.cos(angle) * 0.1,
        0.4 + Math.random() * 0.2,
        Math.sin(angle) * 0.1
      );
      leaf.rotation.x = -0.3;
      leaf.rotation.y = angle;
      leaf.rotation.z = Math.random() * 0.3;
      group.add(leaf);
    }

    this.scene.add(group);
  }

  // 现代咖啡机
  buildModernCoffeeMachine(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // 机身
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.55, 0.4),
      this.materials.coffee
    );
    body.position.y = 0.35;
    body.castShadow = true;
    group.add(body);

    // 显示屏
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x4a9eff })
    );
    screen.position.set(0, 0.5, 0.21);
    group.add(screen);

    // 咖啡出口
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.02, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1a202c })
    );
    spout.position.set(0, 0.25, 0.15);
    group.add(spout);

    // 杯子
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.035, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    cup.position.set(0.1, 0.04, 0.15);
    group.add(cup);

    this.scene.add(group);
  }

  // 现代文件柜
  buildModernCabinet(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.45),
      this.materials.cabinet
    );
    cabinet.position.y = 0.6;
    cabinet.castShadow = true;
    group.add(cabinet);

    // 抽屉线条
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.01, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xc0c0c0 })
      );
      line.position.set(0, 0.3 + i * 0.35, 0.23);
      group.add(line);

      // 把手
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.02, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x718096 })
      );
      handle.position.set(0, 0.45 + i * 0.35, 0.24);
      group.add(handle);
    }

    this.scene.add(group);
  }

  // 更新桌面状态
  updateDeskStatus(desk, status) {
    if (!desk) return;

    const materials = {
      running: this.materials.screenActive,
      idle: this.materials.screen,
      offline: new THREE.MeshStandardMaterial({ color: 0x1a202c }),
      code: this.materials.screenCode
    };

    const mat = materials[status] || materials.idle;

    // 更新主显示器（children[1] 是正面发光屏幕）
    if (desk.mainMonitor) {
      const screen = desk.mainMonitor.children[1];
      if (screen) screen.material = mat;
    }

    // MacBook
    if (desk.macbook) {
      const lid = desk.macbook.children[1];
      if (lid) {
        const screen = lid.children[1];
        if (screen) screen.material = mat;
      }
    }
  }

  // 更新显示器为真实终端内容（包含状态指示）
  async updateDeskTerminal(desk, agentId, status = 'idle') {
    if (!desk || !desk.mainMonitor) return;

    const screen = desk.mainMonitor.userData?.screen;
    if (!screen || !screen.userData) return;

    const { canvas, ctx, texture } = screen.userData;

    // 根据状态设置背景色
    const bgColors = {
      running: '#0d1f0d',  // 深绿色背景
      idle: '#0d1117',     // 深色背景
      offline: '#1a1a1a',  // 近黑色
      error: '#1f0d0d'     // 深红色背景
    };
    const bgColor = bgColors[status] || bgColors.idle;

    try {
      // 获取终端输出
      const response = await fetch(`/api/agents/${agentId}/output?type=tmux&lines=20`);
      const data = await response.json();
      const output = data.output || '';

      // 清空画布（使用状态背景色）
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制状态指示条（顶部）
      const statusColors = {
        running: '#48bb78',
        idle: '#3182ce',
        offline: '#718096',
        error: '#f56565'
      };
      ctx.fillStyle = statusColors[status] || '#3182ce';
      ctx.fillRect(0, 0, canvas.width, 4);

      // 绘制终端内容
      ctx.font = '12px Monaco, monospace';
      const lines = output.split('\n').slice(-15); // 显示最后15行
      let y = 24;
      lines.forEach(line => {
        // 根据内容设置颜色
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

      // 更新纹理
      texture.needsUpdate = true;
    } catch (err) {
      // 如果获取失败，显示默认内容
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = statusColors[status] || '#3182ce';
      ctx.fillRect(0, 0, canvas.width, 4);
      ctx.fillStyle = '#8b949e';
      ctx.font = '14px Monaco, monospace';
      ctx.fillText('Terminal output not available', 10, 30);
      texture.needsUpdate = true;
    }
  }
}
