import { Assets, type AssetsManifest } from 'pixi.js';

/**
 * Preloader class to load assets for the game
 */
export class Preloader {
  private initiated = false;

  /**
   * Module to load assets
   * @param basePath - The base path for the assets
   */
  constructor(
    public readonly manifest: AssetsManifest,
    private basePath?: string) {
    this.init();
  }

  private async init() {
    if (this.initiated) return;

    await Assets.init({ manifest: this.manifest, basePath: this.basePath });
    this.initiated = true;
  }

  /**
   * Load assets
   * @param bundles - The bundles to be loaded
   * @param onProgress - A callback function to be called on progress
   */
  async load(manifest: AssetsManifest, bundles: string[] = [], onProgress?: (progress: number) => void): Promise<void> {
    if (!this.initiated) {
      await Assets.init({ manifest: manifest, basePath: this.basePath });
      this.initiated = true;
    }

    await Assets.loadBundle(bundles, (progress) => onProgress?.(progress * 100));

    onProgress?.(100);
  }

  /**
   * Get the cache of loaded assets.
   * @returns The cache of loaded assets.
   */
  get cache(): typeof Assets.cache {
    return Assets.cache;
  }

  /**
   * Get an asset from the cache.
   * @param key The key of the asset to retrieve.
   * @returns The asset if found, or null.
   */
  getAsset<T>(key: string): T | null {
    return Assets.cache.get(key) ?? null;
  }
}
