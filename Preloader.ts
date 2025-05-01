import { Assets, type AssetsManifest } from "pixi.js";

/**
 * Preloader class to load assets for the game
 */
export class Preloader {
    /**
     * Module to load assets
     * @param basePath - The base path for the assets
     */
    constructor(private basePath?: string) { }

    /**
     * Load assets
     * @param manifest - The pixi manifest file containing the assets to be loaded
     * @param bundles - The bundles to be loaded
     * @param onProgress - A callback function to be called on progress
     */
    async load(
        manifest: AssetsManifest,
        bundles: string[] = [],
        onProgress?: (progress: number) => void
    ): Promise<void> {
        await Assets.init({ manifest: manifest, basePath: this.basePath });
        await Assets.loadBundle(bundles, (progress) => onProgress?.(progress * 100));

        onProgress?.(100);
    }
}

