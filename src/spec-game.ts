import Matter from 'matter-js';
import {
  Fruit,
  loadFruitsConfig,
  getFruits,
  getGameSettings,
  type FruitsConfig,
  type FruitType,
  type FruitVariant,
  type ImageVariant,
} from './fruit';
import { SpecRenderer, type RenderableFruit } from './spec-renderer';

const { Engine, Runner, Bodies, Composite, Events, Vector } = Matter;

type FruitBody = Matter.Body & {
  fruitLevel?: number;
  isMerged?: boolean;
  stableTime?: number;
  variant?: FruitVariant;
  imageVariant?: ImageVariant | null;
  breathPhase?: number;
  gravityScale?: number;
};

interface ComboInfo {
  count: number;
  lastMergeTime: number;
  mergePositions: Matter.Vector[];
}

interface QQConfig {
  qqNumbers: string[];
}

export class SpecGame {
  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private renderer: SpecRenderer;
  private canvas: HTMLCanvasElement;
  private scoreElement: HTMLElement;
  private timerElement: HTMLElement;
  private nextFruitElement: HTMLElement;
  private gameOverElement: HTMLElement;
  private finalScoreElement: HTMLElement;
  private restartBtn: HTMLElement;

  private score: number = 0;
  private nextFruitLevel: number = 0;
  private currentFruitLevel: number = 0;
  private mouseX: number = 0;
  private isGameOver: boolean = false;
  private canDrop: boolean = true;
  private config: FruitsConfig | null = null;
  private fruits: FruitType[] = [];
  private currentVariant: FruitVariant = null;
  private nextVariant: FruitVariant = null;
  private currentImageVariant: ImageVariant | null = null;
  private nextImageVariant: ImageVariant | null = null;
  private animationFrameId: number = 0;
  private comboInfo: ComboInfo = { count: 0, lastMergeTime: 0, mergePositions: [] };
  private qqConfig: QQConfig | null = null;
  private gameStartTime: number = 0;
  private timerInterval: number = 0;

  // 演示模式特殊标记
  private hasSpawnedMaxElasticity: boolean = false;
  private hasSpawnedRainbow: boolean = false;
  private imageVariantCount: number = 0;
  private readonly MAX_IMAGE_VARIANTS = 5;

  private readonly GAME_WIDTH = 400;
  private readonly GAME_HEIGHT = 600;
  private readonly WALL_THICKNESS = 20;
  private readonly TOP_MARGIN = 100;
  private readonly FRUIT_SPAWN_Y = 80;
  private readonly COMBO_WINDOW = 700;
  private readonly COMBO_THRESHOLD = 3;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.scoreElement = document.getElementById('score') as HTMLElement;
    this.timerElement = document.getElementById('timer') as HTMLElement;
    this.nextFruitElement = document.getElementById('next-fruit') as HTMLElement;
    this.gameOverElement = document.getElementById('game-over') as HTMLElement;
    this.finalScoreElement = document.getElementById('final-score') as HTMLElement;
    this.restartBtn = document.getElementById('restart-btn') as HTMLElement;

    this.canvas.width = this.GAME_WIDTH;
    this.canvas.height = this.GAME_HEIGHT;

    this.engine = Engine.create();
    this.runner = Runner.create();
    this.renderer = new SpecRenderer(this.canvas, this.GAME_WIDTH, this.GAME_HEIGHT);
  }

  public async init(): Promise<void> {
    await this.renderer.init();

    this.config = await loadFruitsConfig();
    this.fruits = getFruits(this.config);
    const settings = getGameSettings(this.config);

    this.engine.gravity.y = settings.gravity;

    // 加载 QQ 配置
    await this.loadQQConfig();

    this.setupWorld();
    this.setupEvents();
    this.generateNextFruit();
    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.currentImageVariant = this.nextImageVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();
  }

  private async loadQQConfig(): Promise<void> {
    try {
      const response = await fetch('./qq-config.json');
      if (response.ok) {
        this.qqConfig = await response.json();
      }
    } catch {
      // 配置文件不存在，使用空数组
      this.qqConfig = { qqNumbers: [] };
    }
  }

  private setupWorld(): void {
    const ground = Bodies.rectangle(
      this.GAME_WIDTH / 2,
      this.GAME_HEIGHT + this.WALL_THICKNESS / 2 - 5,
      this.GAME_WIDTH,
      this.WALL_THICKNESS,
      { isStatic: true }
    );

    const leftWall = Bodies.rectangle(
      -this.WALL_THICKNESS / 2 + 5,
      this.GAME_HEIGHT / 2,
      this.WALL_THICKNESS,
      this.GAME_HEIGHT,
      { isStatic: true }
    );

    const rightWall = Bodies.rectangle(
      this.GAME_WIDTH + this.WALL_THICKNESS / 2 - 5,
      this.GAME_HEIGHT / 2,
      this.WALL_THICKNESS,
      this.GAME_HEIGHT,
      { isStatic: true }
    );

    Composite.add(this.engine.world, [ground, leftWall, rightWall]);
  }

  private setupEvents(): void {
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('click', this.handleClick.bind(this));
    this.restartBtn.addEventListener('click', this.restart.bind(this));

    Events.on(this.engine, 'collisionStart', this.handleCollision.bind(this));
    Events.on(this.engine, 'beforeUpdate', this.checkGameOver.bind(this));
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.isGameOver || !this.canDrop || !this.config) return;
    const rect = this.canvas.getBoundingClientRect();
    const currentFruit = this.fruits[this.currentFruitLevel];
    this.mouseX = Math.max(
      currentFruit.radius,
      Math.min(this.GAME_WIDTH - currentFruit.radius, e.clientX - rect.left)
    );
  }

  private handleClick(): void {
    if (this.isGameOver || !this.canDrop) return;
    this.dropFruit();
  }

  private dropFruit(): void {
    if (!this.config) return;

    this.canDrop = false;
    const fruit = this.fruits[this.currentFruitLevel];
    const settings = getGameSettings(this.config);
    const variant = this.currentVariant;
    const imageVariant = this.currentImageVariant;

    const restitution = Fruit.getEffectiveRestitution(0.3, variant);
    const density = Fruit.getEffectiveDensity(0.001, variant);
    const gravity = Fruit.getEffectiveGravity(this.engine.gravity.y, variant);

    const body = Bodies.circle(this.mouseX, this.FRUIT_SPAWN_Y, fruit.radius, {
      restitution: restitution,
      friction: 0.1,
      density: density,
      label: fruit.emoji,
    }) as FruitBody;

    body.gravityScale = gravity / this.engine.gravity.y;
    body.fruitLevel = this.currentFruitLevel;
    body.isMerged = false;
    body.variant = variant;
    body.imageVariant = imageVariant;
    body.breathPhase = 0;

    Composite.add(this.engine.world, body);

    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.currentImageVariant = this.nextImageVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();

    setTimeout(() => {
      this.canDrop = true;
    }, settings.dropCooldown);
  }

  private generateNextFruit(): void {
    if (!this.config) return;
    this.nextFruitLevel = Fruit.getRandomFruitLevel(this.config);

    // 演示模式：提升弹性水果和彩虹水果概率
    this.nextVariant = this.generateSpecVariant();

    // 演示模式：提升图像变体概率
    this.nextImageVariant = this.generateImageVariant();
  }

  private generateSpecVariant(): FruitVariant {
    if (!this.config) return null;

    const settings = this.config.variantSettings;

    // 检查是否还需要强制生成特殊变体
    const needMaxElasticity = !this.hasSpawnedMaxElasticity;
    const needRainbow = !this.hasSpawnedRainbow;

    if (needMaxElasticity || needRainbow) {
      // 70% 概率生成特殊变体
      if (Math.random() < 0.7) {
        if (needMaxElasticity && Math.random() < 0.5) {
          this.hasSpawnedMaxElasticity = true;
          // 生成最高级弹性水果
          const highElasticity = settings.elasticity.levels.find((l) => l.name === 'high');
          if (highElasticity) {
            return { type: 'elasticity', level: highElasticity };
          }
        } else if (needRainbow) {
          this.hasSpawnedRainbow = true;
          return { type: 'color', color: '#FF1493', variantType: 'rainbow' };
        }
      }
    }

    // 普通变体生成（提升概率）
    if (Math.random() > settings.triggerProbability * 1.3) {
      return null;
    }

    const variantTypes = ['weight', 'elasticity', 'color'] as const;
    const selectedType = variantTypes[Math.floor(Math.random() * variantTypes.length)];

    switch (selectedType) {
      case 'weight':
        return Fruit.generateWeightVariant(settings);
      case 'elasticity':
        return Fruit.generateElasticityVariant(settings);
      case 'color':
        return Fruit.generateColorVariant(settings);
      default:
        return null;
    }
  }

  private generateImageVariant(): ImageVariant | null {
    // 演示模式：必出5个图像变体
    if (this.imageVariantCount < this.MAX_IMAGE_VARIANTS) {
      this.imageVariantCount++;
      return Fruit.generateImageVariant(this.qqConfig?.qqNumbers || []);
    }
    return null;
  }

  private updateNextFruitPreview(): void {
    const fruit = this.fruits[this.nextFruitLevel];
    const variant = this.nextVariant;
    const imageVariant = this.nextImageVariant;
    const color = Fruit.getEffectiveColor(fruit, variant);

    // 如果有图像变体，显示头像
    if (imageVariant) {
      this.nextFruitElement.textContent = '';
      this.nextFruitElement.style.backgroundImage = `url(${imageVariant.avatarUrl})`;
      this.nextFruitElement.style.backgroundSize = 'cover';
      this.nextFruitElement.style.backgroundColor = color;
    } else {
      this.nextFruitElement.textContent = fruit.emoji;
      this.nextFruitElement.style.backgroundImage = '';
      this.nextFruitElement.style.fontSize = `${fruit.radius * 1.5}px`;
      this.nextFruitElement.style.backgroundColor = color;
    }

    // 重置边框样式
    this.nextFruitElement.style.border = 'none';
    this.nextFruitElement.style.boxShadow = 'none';

    // 图像变体：彩虹色边框
    if (imageVariant) {
      this.nextFruitElement.style.border = '4px solid transparent';
      this.nextFruitElement.style.backgroundImage = `linear-gradient(${color}, ${color}), linear-gradient(45deg, #FF1493, #FFD700, #00CED1, #FF1493)`;
      this.nextFruitElement.style.backgroundOrigin = 'border-box';
      this.nextFruitElement.style.backgroundClip = 'content-box, border-box';
    } else if (variant?.type === 'weight') {
      const weightVariant = variant;
      if (weightVariant.level.outlineWidth > 0) {
        this.nextFruitElement.style.border = `${weightVariant.level.outlineWidth}px solid ${weightVariant.level.outlineColor}`;
      }
    } else if (variant?.type === 'elasticity') {
      this.nextFruitElement.style.border = '3px solid #FFD700';
      this.nextFruitElement.style.boxShadow = '0 0 8px 2px rgba(255, 215, 0, 0.5)';
    } else if (variant?.type === 'color') {
      if (variant.variantType === 'rainbow') {
        this.nextFruitElement.style.border = '4px solid transparent';
        this.nextFruitElement.style.backgroundImage = `linear-gradient(${color}, ${color}), linear-gradient(45deg, #FF1493, #FFD700, #00CED1, #FF1493)`;
        this.nextFruitElement.style.backgroundOrigin = 'border-box';
        this.nextFruitElement.style.backgroundClip = 'content-box, border-box';
      } else if (variant.variantType === 'black') {
        this.nextFruitElement.style.border = '4px solid #333333';
      } else if (variant.variantType === 'white') {
        this.nextFruitElement.style.border = '4px solid #cccccc';
      }
    }
  }

  private handleCollision(event: Matter.IEventCollision<Matter.Engine>): void {
    if (!this.config) return;

    const pairs = event.pairs;

    for (const pair of pairs) {
      const bodyA = pair.bodyA as FruitBody;
      const bodyB = pair.bodyB as FruitBody;

      if (
        bodyA.fruitLevel !== undefined &&
        bodyB.fruitLevel !== undefined &&
        !bodyA.isMerged &&
        !bodyB.isMerged &&
        Fruit.canMerge(this.config, bodyA.fruitLevel, bodyB.fruitLevel)
      ) {
        this.mergeFruits(bodyA, bodyB);
      }
    }
  }

  private mergeFruits(bodyA: FruitBody, bodyB: FruitBody): void {
    if (!this.config) return;

    bodyA.isMerged = true;
    bodyB.isMerged = true;

    const newLevel = Fruit.getNextLevel(this.config, bodyA.fruitLevel!);
    const newFruit = this.fruits[newLevel];
    const newPos = Vector.add(bodyA.position, bodyB.position);
    newPos.x /= 2;
    newPos.y /= 2;

    Composite.remove(this.engine.world, [bodyA, bodyB]);

    // 合成后的水果随机产生变体
    const newVariant = this.generateSpecVariant();
    const newImageVariant = this.generateImageVariant();
    const restitution = Fruit.getEffectiveRestitution(0.3, newVariant);
    const density = Fruit.getEffectiveDensity(0.001, newVariant);
    const gravity = Fruit.getEffectiveGravity(this.engine.gravity.y, newVariant);

    const newBody = Bodies.circle(newPos.x, newPos.y, newFruit.radius, {
      restitution: restitution,
      friction: 0.1,
      density: density,
      label: newFruit.emoji,
    }) as FruitBody;

    newBody.fruitLevel = newLevel;
    newBody.isMerged = false;
    newBody.variant = newVariant;
    newBody.imageVariant = newImageVariant;
    newBody.breathPhase = 0;
    newBody.gravityScale = gravity / this.engine.gravity.y;

    Composite.add(this.engine.world, newBody);

    this.score += newFruit.score;
    this.updateScore();

    // 播放合成特效
    this.renderer.triggerMergeFirework(newPos.x, newPos.y);

    // 更新连击信息
    this.updateCombo(newPos);
  }

  private updateCombo(mergePosition: Matter.Vector): void {
    const now = Date.now();

    if (now - this.comboInfo.lastMergeTime > this.COMBO_WINDOW) {
      this.comboInfo.count = 1;
      this.comboInfo.mergePositions = [{ x: mergePosition.x, y: mergePosition.y }];
    } else {
      this.comboInfo.count++;
      this.comboInfo.mergePositions.push({ x: mergePosition.x, y: mergePosition.y });
    }

    this.comboInfo.lastMergeTime = now;

    if (this.comboInfo.count >= this.COMBO_THRESHOLD) {
      this.triggerComboEffect();
    }
  }

  private triggerComboEffect(): void {
    this.renderer.triggerComboFireworks(this.comboInfo.count);
  }

  private updateScore(): void {
    this.scoreElement.textContent = this.score.toString();
  }

  private updateTimer(): void {
    const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    this.timerElement.textContent = `${minutes}:${seconds}`;
  }

  private render(): void {
    if (!this.config) return;

    const bodies = Composite.allBodies(this.engine.world);
    const renderableFruits: RenderableFruit[] = [];

    for (const body of bodies) {
      const fruitBody = body as FruitBody;
      if (fruitBody.fruitLevel !== undefined && !body.isStatic) {
        renderableFruits.push({
          body,
          fruitType: this.fruits[fruitBody.fruitLevel],
          variant: fruitBody.variant || null,
          imageVariant: fruitBody.imageVariant || null,
          breathPhase: fruitBody.breathPhase || 0,
        });
      }
    }

    this.renderer.updateFruits(renderableFruits);

    if (!this.isGameOver && this.canDrop) {
      const currentFruit = this.fruits[this.currentFruitLevel];
      this.renderer.drawPreview(
        this.mouseX,
        this.FRUIT_SPAWN_Y,
        currentFruit,
        this.currentVariant,
        this.currentImageVariant,
        true,
        this.GAME_HEIGHT
      );
      this.renderer.drawGameOverLine(this.TOP_MARGIN, this.GAME_WIDTH);
    } else {
      this.renderer.clearPreview();
    }
  }

  private gameLoop = (): void => {
    this.render();
    this.renderer.updateFireworks();
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };

  private checkGameOver(): void {
    if (this.isGameOver || !this.config) return;

    const settings = getGameSettings(this.config);
    const bodies = Composite.allBodies(this.engine.world);

    for (const body of bodies) {
      const fruitBody = body as FruitBody;
      if (
        fruitBody.fruitLevel !== undefined &&
        !fruitBody.isStatic &&
        body.velocity.y < 0.1 &&
        body.velocity.y > -0.1 &&
        body.position.y < this.TOP_MARGIN
      ) {
        let stableTime = fruitBody.stableTime || 0;
        stableTime++;
        fruitBody.stableTime = stableTime;

        if (stableTime > settings.gameOverStableFrames) {
          this.endGame();
          return;
        }
      } else {
        fruitBody.stableTime = 0;
      }
    }
  }

  private endGame(): void {
    this.isGameOver = true;
    this.finalScoreElement.textContent = this.score.toString();
    this.gameOverElement.classList.remove('hidden');
    Runner.stop(this.runner);
    clearInterval(this.timerInterval);
  }

  private restart(): void {
    if (!this.config) return;

    this.isGameOver = false;
    this.score = 0;
    this.canDrop = true;
    this.currentVariant = null;
    this.nextVariant = null;
    this.currentImageVariant = null;
    this.nextImageVariant = null;
    this.hasSpawnedMaxElasticity = false;
    this.hasSpawnedRainbow = false;
    this.imageVariantCount = 0;
    this.comboInfo = { count: 0, lastMergeTime: 0, mergePositions: [] };
    this.updateScore();

    Composite.clear(this.engine.world, false);
    this.renderer.clearFruits();
    this.setupWorld();

    this.generateNextFruit();
    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.currentImageVariant = this.nextImageVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();

    this.gameOverElement.classList.add('hidden');
    Runner.run(this.runner, this.engine);

    this.gameStartTime = Date.now();
    this.timerInterval = window.setInterval(() => this.updateTimer(), 1000);
  }

  public start(): void {
    if (!this.config) return;

    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.currentImageVariant = this.nextImageVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();

    Runner.run(this.runner, this.engine);
    this.gameLoop();

    // 启动计时器
    this.gameStartTime = Date.now();
    this.timerInterval = window.setInterval(() => this.updateTimer(), 1000);
  }

  public destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    Runner.stop(this.runner);
    clearInterval(this.timerInterval);
    this.renderer.destroy();
  }
}
