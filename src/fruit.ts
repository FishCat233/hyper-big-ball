export interface FruitType {
  emoji: string;
  radius: number;
  color: string;
  score: number;
}

export interface GameSettings {
  previewFruitMaxLevel: number;
  dropCooldown: number;
  gameOverStableFrames: number;
  gravity: number;
}

export interface WeightLevel {
  name: string;
  densityMultiplier: number;
  gravityMultiplier: number;
  outlineWidth: number;
  outlineColor: string;
}

export interface ElasticityLevel {
  name: string;
  restitution: number;
  breathSpeed: number;
  breathAmplitude: number;
  glowOpacity: number;
}

export interface WeightVariant {
  type: 'weight';
  level: WeightLevel;
}

export interface ElasticityVariant {
  type: 'elasticity';
  level: ElasticityLevel;
}

export interface ColorVariant {
  type: 'color';
  color: string;
  variantType: 'black' | 'white' | 'rainbow';
}

export interface ImageVariant {
  type: 'image';
  qqNumber: string;
  avatarUrl: string;
}

export type FruitVariant = WeightVariant | ElasticityVariant | ColorVariant | null;

export interface VariantSettings {
  triggerProbability: number;
  weight: {
    levels: WeightLevel[];
    probabilities: number[];
  };
  elasticity: {
    levels: ElasticityLevel[];
    probabilities: number[];
  };
  color: {
    variants: string[];
    probability: number;
    outlineWidth: number;
    rainbowColors: string[];
    cycleDuration: number;
  };
}

export interface FruitsConfig {
  fruits: FruitType[];
  gameSettings: GameSettings;
  variantSettings: VariantSettings;
}

let configCache: FruitsConfig | null = null;

export async function loadFruitsConfig(): Promise<FruitsConfig> {
  if (configCache) {
    return configCache;
  }

  const response = await fetch('./fruits.json');
  if (!response.ok) {
    throw new Error('Failed to load fruits config');
  }

  const data = await response.json();
  configCache = data as FruitsConfig;
  return configCache;
}

export function getFruits(config: FruitsConfig): FruitType[] {
  return config.fruits;
}

export function getGameSettings(config: FruitsConfig): GameSettings {
  return config.gameSettings;
}

export class Fruit {
  static getRandomFruitLevel(config: FruitsConfig, maxLevel?: number): number {
    const effectiveMaxLevel = maxLevel ?? config.gameSettings.previewFruitMaxLevel;
    return Math.floor(Math.random() * Math.min(effectiveMaxLevel, config.fruits.length));
  }

  static getFruit(config: FruitsConfig, level: number): FruitType {
    return config.fruits[Math.min(level, config.fruits.length - 1)];
  }

  static canMerge(config: FruitsConfig, level1: number, level2: number): boolean {
    return level1 === level2 && level1 < config.fruits.length - 1;
  }

  static getNextLevel(config: FruitsConfig, level: number): number {
    return Math.min(level + 1, config.fruits.length - 1);
  }

  static generateVariant(config: FruitsConfig): FruitVariant {
    const settings = config.variantSettings;

    if (Math.random() > settings.triggerProbability) {
      return null;
    }

    const variantTypes = ['weight', 'elasticity', 'color'] as const;
    const selectedType = variantTypes[Math.floor(Math.random() * variantTypes.length)];

    switch (selectedType) {
      case 'weight':
        return this.generateWeightVariant(settings);
      case 'elasticity':
        return this.generateElasticityVariant(settings);
      case 'color':
        return this.generateColorVariant(settings);
      default:
        return null;
    }
  }

  public static generateWeightVariant(settings: VariantSettings): WeightVariant | null {
    const rand = Math.random();
    let cumulative = 0;

    for (let i = 0; i < settings.weight.levels.length; i++) {
      cumulative += settings.weight.probabilities[i];
      if (rand < cumulative) {
        const level = settings.weight.levels[i];
        if (level.name === 'normal') return null;
        return { type: 'weight', level };
      }
    }

    return null;
  }

  public static generateElasticityVariant(settings: VariantSettings): ElasticityVariant | null {
    const rand = Math.random();
    let cumulative = 0;

    for (let i = 0; i < settings.elasticity.levels.length; i++) {
      cumulative += settings.elasticity.probabilities[i];
      if (rand < cumulative) {
        const level = settings.elasticity.levels[i];
        if (level.name === 'normal') return null;
        return { type: 'elasticity', level };
      }
    }

    return null;
  }

  public static generateColorVariant(settings: VariantSettings): ColorVariant | null {
    if (Math.random() > settings.color.probability) {
      return null;
    }

    const variantTypes = ['black', 'white', 'rainbow'] as const;
    const selectedType = variantTypes[Math.floor(Math.random() * variantTypes.length)];

    switch (selectedType) {
      case 'black':
        return { type: 'color', color: '#000000', variantType: 'black' };
      case 'white':
        return { type: 'color', color: '#FFFFFF', variantType: 'white' };
      case 'rainbow':
        return { type: 'color', color: '#FF1493', variantType: 'rainbow' };
      default:
        return null;
    }
  }

  static getEffectiveColor(fruit: FruitType, variant: FruitVariant): string {
    if (variant && variant.type === 'color') {
      return variant.color;
    }
    return fruit.color;
  }

  static getEffectiveDensity(baseDensity: number, variant: FruitVariant): number {
    if (variant && variant.type === 'weight') {
      return baseDensity * variant.level.densityMultiplier;
    }
    return baseDensity;
  }

  static getEffectiveGravity(baseGravity: number, variant: FruitVariant): number {
    if (variant && variant.type === 'weight') {
      return baseGravity * variant.level.gravityMultiplier;
    }
    return baseGravity;
  }

  static getEffectiveRestitution(baseRestitution: number, variant: FruitVariant): number {
    if (variant && variant.type === 'elasticity') {
      return variant.level.restitution;
    }
    return baseRestitution;
  }

  static generateImageVariant(qqNumbers: string[]): ImageVariant | null {
    if (qqNumbers.length === 0) {
      return null;
    }
    const qqNumber = qqNumbers[Math.floor(Math.random() * qqNumbers.length)];
    return {
      type: 'image',
      qqNumber,
      avatarUrl: `http://q.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`,
    };
  }
}
