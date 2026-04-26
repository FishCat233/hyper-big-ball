import Matter from 'matter-js';
import {
  Fruit,
  loadFruitsConfig,
  getFruits,
  getGameSettings,
  type FruitsConfig,
  type FruitType,
  type FruitVariant,
} from './fruit';
import { PixiRenderer, type RenderableFruit } from './renderer';

const { Engine, Runner, Bodies, Composite, Events, Vector } = Matter;

type FruitBody = Matter.Body & {
  fruitLevel?: number;
  isMerged?: boolean;
  stableTime?: number;
  variant?: FruitVariant;
  breathPhase?: number;
  gravityScale?: number;
};

interface ComboInfo {
  count: number;
  lastMergeTime: number;
  mergePositions: Matter.Vector[];
}

export class Game {
  private engine: Matter.Engine;
  private runner: Matter.Runner;
  private renderer: PixiRenderer;
  private canvas: HTMLCanvasElement;
  private scoreElement: HTMLElement;
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
  private animationFrameId: number = 0;
  private comboInfo: ComboInfo = { count: 0, lastMergeTime: 0, mergePositions: [] };

  private readonly BASE_GAME_WIDTH = 400;
  private readonly BASE_GAME_HEIGHT = 600;
  private readonly WALL_THICKNESS = 20;
  private readonly TOP_MARGIN = 100;
  private readonly FRUIT_SPAWN_Y = 80;
  private readonly COMBO_WINDOW = 700;
  private readonly COMBO_THRESHOLD = 3;

  private gameWidth: number = this.BASE_GAME_WIDTH;
  private gameHeight: number = this.BASE_GAME_HEIGHT;
  private scaleRatio: number = 1;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.scoreElement = document.getElementById('score') as HTMLElement;
    this.nextFruitElement = document.getElementById('next-fruit') as HTMLElement;
    this.gameOverElement = document.getElementById('game-over') as HTMLElement;
    this.finalScoreElement = document.getElementById('final-score') as HTMLElement;
    this.restartBtn = document.getElementById('restart-btn') as HTMLElement;

    this.calculateDimensions();

    this.canvas.width = this.gameWidth;
    this.canvas.height = this.gameHeight;

    this.engine = Engine.create();
    this.runner = Runner.create();
    this.renderer = new PixiRenderer(this.canvas, this.gameWidth, this.gameHeight);
  }

  private calculateDimensions(): void {
    const screenWidth = window.innerWidth;
    const isMobile = screenWidth < 600;

    if (isMobile) {
      // 移动端：宽度为屏幕宽度的 90%，最大不超过 400px
      this.gameWidth = Math.min(screenWidth * 0.9, this.BASE_GAME_WIDTH);
      // 保持宽高比
      this.scaleRatio = this.gameWidth / this.BASE_GAME_WIDTH;
      this.gameHeight = this.BASE_GAME_HEIGHT * this.scaleRatio;
    } else {
      // 桌面端：固定尺寸
      this.gameWidth = this.BASE_GAME_WIDTH;
      this.gameHeight = this.BASE_GAME_HEIGHT;
      this.scaleRatio = 1;
    }
  }

  private getScaledValue(value: number): number {
    return value * this.scaleRatio;
  }

  public async init(): Promise<void> {
    await this.renderer.init();

    this.config = await loadFruitsConfig();
    this.fruits = getFruits(this.config);
    const settings = getGameSettings(this.config);

    this.engine.gravity.y = settings.gravity;

    this.setupWorld();
    this.setupEvents();
    this.generateNextFruit();
    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();
  }

  private setupWorld(): void {
    const ground = Bodies.rectangle(
      this.gameWidth / 2,
      this.gameHeight + this.WALL_THICKNESS / 2 - 5,
      this.gameWidth,
      this.WALL_THICKNESS,
      { isStatic: true }
    );

    const leftWall = Bodies.rectangle(
      -this.WALL_THICKNESS / 2 + 5,
      this.gameHeight / 2,
      this.WALL_THICKNESS,
      this.gameHeight,
      { isStatic: true }
    );

    const rightWall = Bodies.rectangle(
      this.gameWidth + this.WALL_THICKNESS / 2 - 5,
      this.gameHeight / 2,
      this.WALL_THICKNESS,
      this.gameHeight,
      { isStatic: true }
    );

    Composite.add(this.engine.world, [ground, leftWall, rightWall]);
  }

  private setupEvents(): void {
    // 鼠标事件
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('click', this.handleClick.bind(this));

    // 触摸事件
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), {
      passive: false,
    });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

    // 阻止画布上的默认触摸行为（防止滚动和缩放）
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    this.restartBtn.addEventListener('click', this.restart.bind(this));

    Events.on(this.engine, 'collisionStart', this.handleCollision.bind(this));
    Events.on(this.engine, 'beforeUpdate', this.checkGameOver.bind(this));

    // 监听窗口大小变化
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private handleResize(): void {
    // 窗口大小变化时重新计算尺寸（仅在非游戏进行中时）
    if (this.isGameOver) {
      this.calculateDimensions();
      this.canvas.width = this.gameWidth;
      this.canvas.height = this.gameHeight;
      this.renderer.resize(this.gameWidth, this.gameHeight);
    }
  }

  private getCanvasCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.isGameOver || !this.canDrop || !this.config) return;
    const coords = this.getCanvasCoordinates(e.clientX, e.clientY);
    const currentFruit = this.fruits[this.currentFruitLevel];
    const scaledRadius = currentFruit.radius * this.scaleRatio;
    this.mouseX = Math.max(scaledRadius, Math.min(this.gameWidth - scaledRadius, coords.x));
  }

  private handleClick(): void {
    if (this.isGameOver || !this.canDrop) return;
    this.dropFruit();
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.isGameOver || !this.canDrop || !this.config) return;
    const touch = e.touches[0];
    this.handleMouseMove(touch as unknown as MouseEvent);
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (this.isGameOver || !this.canDrop || !this.config) return;
    const touch = e.touches[0];
    this.handleMouseMove(touch as unknown as MouseEvent);
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    this.handleClick();
  }

  private dropFruit(): void {
    if (!this.config) return;

    this.canDrop = false;
    const fruit = this.fruits[this.currentFruitLevel];
    const settings = getGameSettings(this.config);
    const variant = this.currentVariant;

    const restitution = Fruit.getEffectiveRestitution(0.3, variant);
    const density = Fruit.getEffectiveDensity(0.001, variant);
    const gravity = Fruit.getEffectiveGravity(this.engine.gravity.y, variant);

    const scaledSpawnY = this.getScaledValue(this.FRUIT_SPAWN_Y);
    const scaledRadius = fruit.radius * this.scaleRatio;

    const body = Bodies.circle(this.mouseX, scaledSpawnY, scaledRadius, {
      restitution: restitution,
      friction: 0.1,
      density: density,
      label: fruit.emoji,
    }) as FruitBody;

    // 应用重力倍率
    body.gravityScale = gravity / this.engine.gravity.y;

    body.fruitLevel = this.currentFruitLevel;
    body.isMerged = false;
    body.variant = variant;
    body.breathPhase = 0;

    Composite.add(this.engine.world, body);

    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();

    setTimeout(() => {
      this.canDrop = true;
    }, settings.dropCooldown);
  }

  private generateNextFruit(): void {
    if (!this.config) return;
    this.nextFruitLevel = Fruit.getRandomFruitLevel(this.config);
    this.nextVariant = Fruit.generateVariant(this.config);
  }

  private updateNextFruitPreview(): void {
    const fruit = this.fruits[this.nextFruitLevel];
    const variant = this.nextVariant;
    const color = Fruit.getEffectiveColor(fruit, variant);

    this.nextFruitElement.textContent = fruit.emoji;
    this.nextFruitElement.style.fontSize = `${fruit.radius * 1.5}px`;
    this.nextFruitElement.style.backgroundColor = color;

    // 重置边框样式
    this.nextFruitElement.style.border = 'none';
    this.nextFruitElement.style.boxShadow = 'none';

    if (variant?.type === 'weight') {
      const weightVariant = variant;
      if (weightVariant.level.outlineWidth > 0) {
        this.nextFruitElement.style.border = `${weightVariant.level.outlineWidth}px solid ${weightVariant.level.outlineColor}`;
      }
    } else if (variant?.type === 'elasticity') {
      // 金色边框 + 金色阴影模拟光环效果
      this.nextFruitElement.style.border = '3px solid #FFD700';
      this.nextFruitElement.style.boxShadow = '0 0 8px 2px rgba(255, 215, 0, 0.5)';
    } else if (variant?.type === 'color') {
      if (variant.variantType === 'rainbow') {
        // 彩虹渐变边框
        this.nextFruitElement.style.border = '4px solid transparent';
        this.nextFruitElement.style.backgroundImage = `linear-gradient(${color}, ${color}), linear-gradient(45deg, #FF1493, #FFD700, #00CED1, #FF1493)`;
        this.nextFruitElement.style.backgroundOrigin = 'border-box';
        this.nextFruitElement.style.backgroundClip = 'content-box, border-box';
      } else if (variant.variantType === 'black') {
        // 黑色变体：深灰色边框
        this.nextFruitElement.style.border = '4px solid #333333';
      } else if (variant.variantType === 'white') {
        // 白色变体：浅灰色边框
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
    const newVariant = Fruit.generateVariant(this.config);
    const restitution = Fruit.getEffectiveRestitution(0.3, newVariant);
    const density = Fruit.getEffectiveDensity(0.001, newVariant);
    const gravity = Fruit.getEffectiveGravity(this.engine.gravity.y, newVariant);

    const scaledNewRadius = newFruit.radius * this.scaleRatio;
    const newBody = Bodies.circle(newPos.x, newPos.y, scaledNewRadius, {
      restitution: restitution,
      friction: 0.1,
      density: density,
      label: newFruit.emoji,
    }) as FruitBody;

    newBody.fruitLevel = newLevel;
    newBody.isMerged = false;
    newBody.variant = newVariant;
    newBody.breathPhase = 0;

    // 应用重力倍率
    newBody.gravityScale = gravity / this.engine.gravity.y;

    Composite.add(this.engine.world, newBody);

    this.score += newFruit.score;
    this.updateScore();

    // 播放合成特效（小型烟花在合成位置）
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
    // 播放连击特效（大型烟花在页面周围随机位置）
    this.renderer.triggerComboFireworks(this.comboInfo.count);
  }

  private updateScore(): void {
    this.scoreElement.textContent = this.score.toString();
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
          breathPhase: fruitBody.breathPhase || 0,
          scaleRatio: this.scaleRatio,
        });
      }
    }

    this.renderer.updateFruits(renderableFruits);

    if (!this.isGameOver && this.canDrop) {
      const currentFruit = this.fruits[this.currentFruitLevel];
      const scaledSpawnY = this.getScaledValue(this.FRUIT_SPAWN_Y);
      const scaledTopMargin = this.getScaledValue(this.TOP_MARGIN);
      this.renderer.drawPreview(
        this.mouseX,
        scaledSpawnY,
        currentFruit,
        this.currentVariant,
        this.scaleRatio,
        true,
        this.gameHeight
      );
      this.renderer.drawGameOverLine(scaledTopMargin, this.gameWidth);
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
        body.position.y < this.getScaledValue(this.TOP_MARGIN)
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
  }

  private restart(): void {
    if (!this.config) return;

    this.isGameOver = false;
    this.score = 0;
    this.canDrop = true;
    this.currentVariant = null;
    this.nextVariant = null;
    this.updateScore();

    Composite.clear(this.engine.world, false);
    this.renderer.clearFruits();
    this.setupWorld();

    this.generateNextFruit();
    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();

    this.gameOverElement.classList.add('hidden');
    Runner.run(this.runner, this.engine);
  }

  public start(): void {
    if (!this.config) return;

    this.currentFruitLevel = this.nextFruitLevel;
    this.currentVariant = this.nextVariant;
    this.generateNextFruit();
    this.updateNextFruitPreview();

    Runner.run(this.runner, this.engine);
    this.gameLoop();
  }

  public destroy(): void {
    cancelAnimationFrame(this.animationFrameId);
    Runner.stop(this.runner);
    this.renderer.destroy();
  }
}
