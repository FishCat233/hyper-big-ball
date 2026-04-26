import { Application, Graphics, Container, Text } from 'pixi.js';
import Matter from 'matter-js';
import type { FruitType, FruitVariant, ElasticityVariant } from './fruit';

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  size: number;
}

interface Firework {
  particles: FireworkParticle[];
  active: boolean;
}

export interface RenderableFruit {
  body: Matter.Body;
  fruitType: FruitType;
  variant: FruitVariant;
  breathPhase: number;
  scaleRatio?: number;
}

interface FruitBody extends Matter.Body {
  fruitLevel?: number;
  isMerged?: boolean;
  stableTime?: number;
  variant?: FruitVariant;
  breathPhase?: number;
}

const RAINBOW_COLORS = ['#FF1493', '#FFD700', '#00CED1'];
const COLOR_CYCLE_DURATION = 2000;

export class PixiRenderer {
  private app!: Application;
  private fruitContainer!: Container;
  private previewContainer!: Container;
  private effectContainer!: Container;
  private fruitGraphics: Map<number, Graphics>;
  private fruitTexts: Map<number, Text>;
  private canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private fireworks: Firework[] = [];
  private effectGraphics: Graphics | null = null;

  private readonly FIREWORK_COLORS = [
    0xff1493, 0xffd700, 0x00ced1, 0xff4757, 0x7bed9f, 0xffa502, 0x2ed573,
  ];

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.fruitGraphics = new Map();
    this.fruitTexts = new Map();
  }

  public async init(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      backgroundColor: 0xf5f5dc,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.fruitContainer = new Container();
    this.previewContainer = new Container();
    this.effectContainer = new Container();
    this.app.stage.addChild(this.fruitContainer);
    this.app.stage.addChild(this.previewContainer);
    this.app.stage.addChild(this.effectContainer);

    this.effectGraphics = new Graphics();
    this.effectContainer.addChild(this.effectGraphics);
  }

  public getApp(): Application {
    return this.app;
  }

  public clearFruits(): void {
    this.fruitGraphics.forEach((graphic) => {
      this.fruitContainer.removeChild(graphic);
      graphic.destroy();
    });
    this.fruitTexts.forEach((text) => {
      this.fruitContainer.removeChild(text);
      text.destroy();
    });
    this.fruitGraphics.clear();
    this.fruitTexts.clear();
  }

  public updateFruits(fruits: RenderableFruit[]): void {
    const currentBodyIds = new Set(fruits.map((f) => f.body.id));

    // 移除不存在的水果
    this.fruitGraphics.forEach((graphic, id) => {
      if (!currentBodyIds.has(id)) {
        this.fruitContainer.removeChild(graphic);
        graphic.destroy();
        this.fruitGraphics.delete(id);

        const text = this.fruitTexts.get(id);
        if (text) {
          this.fruitContainer.removeChild(text);
          text.destroy();
          this.fruitTexts.delete(id);
        }
      }
    });

    // 更新或创建水果
    fruits.forEach((fruit) => {
      this.updateOrCreateFruit(fruit);
    });
  }

  private updateOrCreateFruit(fruit: RenderableFruit): void {
    const { body, fruitType, variant } = fruit;
    const id = body.id;
    const scaleRatio = fruit.scaleRatio || 1;

    let graphic = this.fruitGraphics.get(id);
    let text = this.fruitTexts.get(id);

    // 更新呼吸相位 - 直接更新 body 上的 breathPhase 以持久化
    if (variant?.type === 'elasticity') {
      const elasticVariant = variant as ElasticityVariant;
      const fruitBody = body as FruitBody;
      fruitBody.breathPhase = (fruitBody.breathPhase || 0) + elasticVariant.level.breathSpeed;
      fruit.breathPhase = fruitBody.breathPhase;
    }

    if (!graphic) {
      graphic = new Graphics();
      this.fruitGraphics.set(id, graphic);
      this.fruitContainer.addChild(graphic);
    }

    const scaledRadius = fruitType.radius * scaleRatio;
    if (!text) {
      text = new Text({
        text: fruitType.emoji,
        style: {
          fontFamily: 'Arial',
          fontSize: scaledRadius * 1.2,
          fill: 0x000000,
          align: 'center',
        },
      });
      text.anchor.set(0.5);
      this.fruitTexts.set(id, text);
      this.fruitContainer.addChild(text);
    } else {
      // 更新字体大小以适应缩放
      text.style.fontSize = scaledRadius * 1.2;
    }

    // 绘制水果
    this.drawFruit(graphic, fruit, scaleRatio);

    // 更新位置
    graphic.x = body.position.x;
    graphic.y = body.position.y;
    text.x = body.position.x;
    text.y = body.position.y;
    text.rotation = body.angle;
  }

  private drawFruit(graphic: Graphics, fruit: RenderableFruit, scaleRatio: number = 1): void {
    const { fruitType, variant } = fruit;

    graphic.clear();

    // 获取有效颜色
    const color = this.getEffectiveColor(fruitType.color, variant);

    // 计算半径（考虑缩放和呼吸效果）
    let radius = fruitType.radius * scaleRatio;
    let breathValue = 0;
    if (variant?.type === 'elasticity') {
      const elasticVariant = variant as ElasticityVariant;
      breathValue = Math.sin(fruit.breathPhase);
      const breathOffset = breathValue * elasticVariant.level.breathAmplitude;
      radius = fruitType.radius * scaleRatio * (1 + breathOffset);
    }

    // 根据变体类型绘制
    if (variant?.type === 'weight') {
      const weightVariant = variant;
      // 绘制水果主体
      graphic.circle(0, 0, radius);
      graphic.fill({ color: this.parseColor(color) });
      // 绘制重量变体描边 - 使用与水果本色相近的颜色
      if (weightVariant.level.outlineWidth > 0) {
        const outlineColor =
          weightVariant.level.name === 'light'
            ? this.adjustBrightness(color, 40)
            : this.adjustBrightness(color, -40);
        graphic.stroke({
          color: this.parseColor(outlineColor),
          width: weightVariant.level.outlineWidth,
        });
      }
    } else if (variant?.type === 'elasticity') {
      // 计算呼吸动画参数
      const glowRadius = radius * (1.2 + breathValue * 0.1);
      const outlineWidth = 2 + (breathValue + 1) * 1.5; // 2px ~ 5px
      const glowOpacity = 0.3 + (breathValue + 1) * 0.25; // 0.3 ~ 0.8

      // 使用与水果本色相近的颜色作为描边色
      const outlineColor = this.adjustBrightness(color, -30);

      // 绘制外层脉动光环
      graphic.circle(0, 0, glowRadius);
      graphic.fill({ color: this.parseColor(outlineColor), alpha: glowOpacity * 0.3 });

      // 绘制水果主体
      graphic.circle(0, 0, radius);
      graphic.fill({ color: this.parseColor(color) });
      graphic.stroke({
        color: this.parseColor(outlineColor),
        width: outlineWidth,
      });
    } else if (variant?.type === 'color') {
      // 根据颜色变体类型绘制
      if (variant.variantType === 'rainbow') {
        // 彩虹变体：球体显示动态彩虹色
        const rainbowColor = this.getRainbowColor();
        graphic.circle(0, 0, radius);
        graphic.fill({ color: this.parseColor(rainbowColor) });
        graphic.stroke({
          color: this.parseColor(rainbowColor),
          width: 4,
        });
      } else if (variant.variantType === 'black') {
        // 黑色变体：球体填充黑色，深灰色描边
        graphic.circle(0, 0, radius);
        graphic.fill({ color: this.parseColor(color) });
        graphic.stroke({
          color: 0x333333,
          width: 4,
        });
      } else if (variant.variantType === 'white') {
        // 白色变体：球体填充白色，浅灰色描边
        graphic.circle(0, 0, radius);
        graphic.fill({ color: this.parseColor(color) });
        graphic.stroke({
          color: 0xcccccc,
          width: 4,
        });
      }
    } else {
      // 普通水果
      graphic.circle(0, 0, radius);
      graphic.fill({ color: this.parseColor(color) });
    }
  }

  private getRainbowColor(): string {
    const now = Date.now();
    const progress = (now % COLOR_CYCLE_DURATION) / COLOR_CYCLE_DURATION;
    const segmentSize = 1 / (RAINBOW_COLORS.length - 1);
    const segmentIndex = Math.floor(progress / segmentSize);
    const segmentProgress = (progress % segmentSize) / segmentSize;

    const color1 = RAINBOW_COLORS[Math.min(segmentIndex, RAINBOW_COLORS.length - 1)];
    const color2 = RAINBOW_COLORS[Math.min(segmentIndex + 1, RAINBOW_COLORS.length - 1)];

    return this.interpolateColor(color1, color2, segmentProgress);
  }

  private interpolateColor(color1: string, color2: string, factor: number): string {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  public drawPreview(
    x: number,
    y: number,
    fruitType: FruitType,
    variant: FruitVariant,
    scaleRatio: number,
    showGuideline: boolean,
    gameHeight: number
  ): void {
    this.previewContainer.removeChildren();

    const color = this.getEffectiveColor(fruitType.color, variant);
    const scaledRadius = fruitType.radius * scaleRatio;

    // 绘制预览水果
    const previewGraphic = new Graphics();

    // 根据变体类型设置描边
    if (variant?.type === 'weight') {
      const weightVariant = variant;
      // 绘制水果主体
      previewGraphic.circle(x, y, scaledRadius);
      previewGraphic.fill({ color: this.parseColor(color), alpha: 0.5 });
      // 绘制重量变体描边 - 使用与水果本色相近的颜色
      if (weightVariant.level.outlineWidth > 0) {
        const outlineColor =
          weightVariant.level.name === 'light'
            ? this.adjustBrightness(color, 40)
            : this.adjustBrightness(color, -40);
        previewGraphic.stroke({
          color: this.parseColor(outlineColor),
          width: weightVariant.level.outlineWidth,
        });
      }
    } else if (variant?.type === 'elasticity') {
      // 使用与水果本色相近的颜色作为描边色
      const outlineColor = this.adjustBrightness(color, -30);
      // 计算呼吸动画参数（预览也播放动画）
      const breathValue = Math.sin(Date.now() / 200);
      const glowRadius = scaledRadius * (1.2 + breathValue * 0.1);
      const outlineWidth = 2 + (breathValue + 1) * 1.5;
      const glowOpacity = 0.15 + (breathValue + 1) * 0.1;
      // 绘制动态光环
      previewGraphic.circle(x, y, glowRadius);
      previewGraphic.fill({ color: this.parseColor(outlineColor), alpha: glowOpacity });
      // 绘制水果主体
      previewGraphic.circle(x, y, scaledRadius);
      previewGraphic.fill({ color: this.parseColor(color), alpha: 0.5 });
      previewGraphic.stroke({
        color: this.parseColor(outlineColor),
        width: outlineWidth,
      });
    } else if (variant?.type === 'color') {
      // 绘制水果主体
      previewGraphic.circle(x, y, scaledRadius);
      // 根据颜色变体类型绘制
      if (variant.variantType === 'rainbow') {
        // 彩虹变体：球体显示动态彩虹色
        const rainbowColor = this.getRainbowColor();
        previewGraphic.circle(x, y, scaledRadius);
        previewGraphic.fill({ color: this.parseColor(rainbowColor), alpha: 0.5 });
        previewGraphic.stroke({
          color: this.parseColor(rainbowColor),
          width: 4,
        });
      } else if (variant.variantType === 'black') {
        // 黑色变体：球体填充黑色，深灰色描边
        previewGraphic.circle(x, y, scaledRadius);
        previewGraphic.fill({ color: this.parseColor(color), alpha: 0.5 });
        previewGraphic.stroke({
          color: 0x333333,
          width: 4,
        });
      } else if (variant.variantType === 'white') {
        // 白色变体：球体填充白色，浅灰色描边
        previewGraphic.circle(x, y, scaledRadius);
        previewGraphic.fill({ color: this.parseColor(color), alpha: 0.5 });
        previewGraphic.stroke({
          color: 0xcccccc,
          width: 4,
        });
      }
    } else {
      previewGraphic.circle(x, y, scaledRadius);
      previewGraphic.fill({ color: this.parseColor(color), alpha: 0.5 });
      previewGraphic.stroke({
        color: this.parseColor(color),
        width: 2,
      });
    }

    this.previewContainer.addChild(previewGraphic);

    // 绘制 emoji
    const text = new Text({
      text: fruitType.emoji,
      style: {
        fontFamily: 'Arial',
        fontSize: scaledRadius,
        fill: 0x000000,
        align: 'center',
      },
    });
    text.anchor.set(0.5);
    text.x = x;
    text.y = y;
    this.previewContainer.addChild(text);

    // 绘制引导线
    if (showGuideline) {
      const guideline = new Graphics();
      guideline.moveTo(x, y + scaledRadius + 5);
      guideline.lineTo(x, gameHeight);
      guideline.stroke({
        color: 0xffffff,
        width: 2,
        alpha: 0.3,
      });
      this.previewContainer.addChild(guideline);
    }
  }

  public clearPreview(): void {
    this.previewContainer.removeChildren();
  }

  public drawGameOverLine(y: number, width: number): void {
    const line = new Graphics();
    line.moveTo(0, y);
    line.lineTo(width, y);
    line.stroke({
      color: 0xff0000,
      width: 2,
      alpha: 0.5,
    });
    this.previewContainer.addChild(line);
  }

  private getEffectiveColor(defaultColor: string, variant: FruitVariant): string {
    if (variant?.type === 'color') {
      return variant.color;
    }
    return defaultColor;
  }

  private parseColor(color: string): number {
    if (color.startsWith('#')) {
      return parseInt(color.slice(1), 16);
    }
    return 0xffffff;
  }

  private adjustBrightness(color: string, amount: number): string {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  public triggerMergeFirework(x: number, y: number): void {
    const particleCount = 12;
    this.createFireworkBurst(x, y, particleCount, 'small');
  }

  public triggerComboFireworks(comboCount: number): void {
    const particleCount = Math.min(30 + comboCount * 15, 100);
    const burstCount = Math.min(2 + Math.floor(comboCount / 2), 5);

    for (let b = 0; b < burstCount; b++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height * 0.8;
      this.createFireworkBurst(x, y, particleCount, 'large');
    }
  }

  private createFireworkBurst(
    x: number,
    y: number,
    particleCount: number,
    size: 'small' | 'large'
  ): void {
    const particles: FireworkParticle[] = [];
    const baseColor = this.FIREWORK_COLORS[Math.floor(Math.random() * this.FIREWORK_COLORS.length)];

    const speedMultiplier = size === 'small' ? 1 : 2.5;
    const sizeMultiplier = size === 'small' ? 1 : 1.5;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = (2 + Math.random() * 3) * speedMultiplier;
      const particleSize = (2 + Math.random() * 3) * sizeMultiplier;

      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 1.0,
        color: baseColor,
        size: particleSize,
      });
    }

    this.fireworks.push({
      particles,
      active: true,
    });
  }

  public updateFireworks(): void {
    if (!this.effectGraphics || this.fireworks.length === 0) return;

    this.effectGraphics.clear();

    this.fireworks = this.fireworks.filter((firework) => {
      firework.particles = firework.particles.filter((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.15;
        particle.vx *= 0.98;
        particle.vy *= 0.98;
        particle.life -= 0.02;

        if (particle.life > 0) {
          const alpha = particle.life;
          const currentSize = particle.size * particle.life;

          this.effectGraphics!.circle(particle.x, particle.y, currentSize);
          this.effectGraphics!.fill({
            color: particle.color,
            alpha: alpha,
          });

          this.effectGraphics!.circle(particle.x, particle.y, currentSize * 0.5);
          this.effectGraphics!.fill({
            color: 0xffffff,
            alpha: alpha * 0.5,
          });

          return true;
        }
        return false;
      });

      return firework.particles.length > 0;
    });
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
  }

  public destroy(): void {
    this.app.destroy(true);
  }
}
