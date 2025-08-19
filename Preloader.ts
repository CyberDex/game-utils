import { ArrayOr, Assets, type AssetsManifest } from 'pixi.js';

/**
 * Preloader class to load assets for the game
 */
export class Preloader {
  private initiated = false;

  /**
   * Module to load assets
   * @param basePath - The base path for the assets
   */
  constructor(private manifest: AssetsManifest, private basePath?: string) { }

  private async init() {
    await Assets.init({ manifest: this.manifest, basePath: this.basePath });
    this.initiated = true;
  }

  /**
   * Load assets
   * @param manifest - The pixi manifest file containing the assets to be loaded
   * @param bundles - The bundles to be loaded
   * @param onProgress - A callback function to be called on progress
   */
  async load(bundles: ArrayOr<string>, onProgress?: (progress: number) => void): Promise<void> {
    if (!this.initiated) {
      await this.init();
    }

    await Assets.loadBundle(bundles, (progress) => onProgress?.(progress * 100));

    onProgress?.(100);
  }

  get cache(): typeof Assets.cache {
    return Assets.cache;
  }
}
