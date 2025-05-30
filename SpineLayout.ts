import {
  AtlasAttachmentLoader,
  SkeletonData,
  SkeletonJson,
  SlotData,
  Spine,
  SpineTexture,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import { type AssetsManifest, Container, Text, Texture, TilingSprite, type UnresolvedAsset } from 'pixi.js';

const slotPointers = {
  spine: 'spine_',
  text: 'text_',
};

const modificators = {
  loop: '_loop',
  speed: '_speed_',
  speedX: '_speedX_',
  speedY: '_speedY_',
  // TODO: add more modificators
  // random: '_random',
};

type SpineID = string;
type AnimationName = string;
type AnimationsRegistry = Map<SpineID, AnimationName[]>;

type SpineLayoutOptions = {
  debug?: boolean;
  minHeight?: number | string;
  minWidth?: number | string;
  maxHeight?: number | string;
  maxWidth?: number | string;
  manifest?: AssetsManifest;
};

export type SpineInstanceData = {
  skeleton: SkeletonData;
  atlasText: string;
  textures: Record<string, Texture>;
};
export class SpineLayout extends Container {
  private spines: Map<SpineID, Spine> = new Map();
  private animations: Map<SpineID, AnimationsRegistry> = new Map();
  private statesAnimations: Map<string, string[]> = new Map();
  private texts: Map<SpineID, Text> = new Map();
  private tiles: Map<SpineID, TilingSprite> = new Map();
  private onInitCallbacks: (() => void)[] = [];

  constructor(private options?: SpineLayoutOptions) {
    super();

    if (options?.maxHeight || options?.minHeight || options?.maxWidth || options?.minWidth) {
      window.addEventListener('resize', () => this.resize());
      this.on('childAdded', () => this.resize());
    }

    if (options?.manifest) {
      this.createInstancesFromManifest(options.manifest);
    }
  }

  /**
   * Creates a Spine instance from the provided data.
   * @param data - SpineInstanceData
   * @param data.skeleton - Skeleton data
   * @param data.atlasText - Atlas text
   * @param data.textures - Textures
   * @throws Will throw an error if the texture is missing for a page in the atlas.
   */
  createInstanceFromData(data: SpineInstanceData) {
    // Create atlas
    const spineAtlas = new TextureAtlas(data.atlasText);

    // Process each page in the atlas
    for (const page of spineAtlas.pages) {
      const pageName = page.name;
      const texture = data.textures[pageName];

      if (!texture) {
        console.error(`Missing texture for page: ${pageName}`);
        throw new Error(`Missing texture for page: ${pageName}`);
      }

      // Create SpineTexture from the PIXI Texture
      const spineTexture = SpineTexture.from(texture.source);

      // Set the texture for the page
      page.setTexture(spineTexture);

      // Handle PMA (Premultiplied Alpha) if needed
      // if (page.pma) {
      //     texture.alphaMode = ALPHA_MODES.PREMULTIPLIED_ALPHA;
      // } else {
      //     texture.alphaMode = ALPHA_MODES.PREMULTIPLY_ON_UPLOAD;
      // }
    }

    // Create attachment loader
    const atlasLoader = new AtlasAttachmentLoader(spineAtlas);

    // Create skeleton data
    const skeletonJson = new SkeletonJson(atlasLoader);
    const skeletonData = skeletonJson.readSkeletonData(data.skeleton);

    const spineInstance = new Spine(skeletonData);
    const spineID = data.atlasText.split('.')[0];

    this.addSpineInstance(spineID, spineInstance);

    this.attachBones();
    this.attachTexts();
  }

  /**
   * Parse the manifest and create spine instances from it.
   * @param manifest - pixi assets manifest to create spine instances from
   */
  createInstancesFromManifest(manifest: AssetsManifest) {
    if (this.options?.debug) {
      console.log(`Create Spines:`);
    }

    this.getSpinesFromManifest(manifest).forEach((spine) => {
      const spineInstance = Spine.from({ skeleton: spine.skel, atlas: spine.atlas, scale: 1 });
      const spineID = spine.atlas.replace(/\.[^.]+$/, '');

      this.addSpineInstance(spineID, spineInstance);
    });

    this.attachBones();
    this.attachTexts();
  }

  /**
   * Tryes to play an animations based on the state name of the animations for each of the created spine instances.
   * Will only play the animation state if the animation state name is found in the spine instance.
   * @param stateName The name of the animation to play
   */
  async playState(stateName: string) {
    const animationsPromises: Promise<void>[] = [];
    const stateAnimations = this.statesAnimations.get(stateName);
    const activeStates: Map<string, Promise<void>> = new Map();

    console.log(`State ${stateName}`, { stateAnimations, animations: this.animations });

    stateAnimations?.forEach((animation) => {
      this.animations.get(animation)?.forEach((animations, spineID) => {
        animations.forEach(async (animation) => {
          const promise = this.playInstanceAnimation(spineID, animation, animationsPromises.length + 1);

          animationsPromises.push(promise);

          activeStates.set(stateName, promise);
        });
      });
    });

    await Promise.all(animationsPromises);

    activeStates.delete(stateName);
  }

  /**
   * Tryes to play an animation based on the name of the animation for each of the created spine instances.
   * Will only play the animation if the animation name is found in the spine instance.
   * @param animationName The name of the animation to play
   */
  async play(animationName: string) {
    const animationsPromises: Promise<void>[] = [];

    this.animations.get(animationName)?.forEach((animations, spineID) => {
      animations.forEach(async (animation) => {
        // const modificatorsParameters = Object.values(animationModificators).map((mod) => {
        //     if (animation.includes(mod)) {
        //         return animation.split(mod)[1];
        //     }
        // });

        const promise = this.playInstanceAnimation(spineID, animation);

        animationsPromises.push(promise);

        // TODO: add more modificators
        // modificators.forEach((mod) => {
        //     switch (mod.includes(modificators.loop)) {
        //         case value:

        //             break;

        //         default:
        //             break;
        //     }
        // });
      });
    });
    return Promise.all(animationsPromises);
  }

  /**
   * Stop all animations.
   */
  stopAll() {
    this.spines.forEach((spine) => {
      spine.state.clearTrack(0);
    });
  }

  /**
   * Play spine animation by ID.
   * @param spineID - spine ID to play the animation on
   * @param animation - animation name to play
   */
  async playInstanceAnimation(spineID: string, animation: string, trackID = 0) {
    const mod = Object.values(modificators).filter((mod) => animation.includes(mod));
    const spine = this.spines.get(spineID)?.state;

    if (!spine) {
      console.error(`Spine ${spineID} not found`);
      return;
    }

    if (this.isAnimationPlaying(spineID, animation)) {
      return Promise.resolve();
    }

    spine.setAnimation(trackID, animation, mod.includes(modificators.loop));

    if (this.options?.debug) {
      const track = trackID > 0 ? ` track ${trackID}` : '';

      console.log(`▶️ ${spineID}(${animation})${track}`);
    }

    return new Promise<void>((resolve) => {
      this.spines.get(spineID)?.state.addListener({
        complete: () => resolve(),
      });
    });
  }

  /**
   * Get all available animations from all spine instances.
   * @returns Array of all available animations
   */
  getAnimations(): string[] {
    return Array.from(this.animations.keys());
  }

  /**
   * Get all available animations from all spine instances.
   * @returns Array of all available animations
   */
  getAnimationsStates(): string[] {
    return Array.from(this.statesAnimations.keys());
  }

  /**
   * Set text of the bone text attachment.
   * @param boneName - ID of the bone to set the text for
   * @param text - text to set
   */
  setText(boneName: string, text: string) {
    const textObject = this.texts.get(boneName);
    // console.log(textObject, text);

    if (textObject) {
      textObject.text = text;
    } else {
      console.error(`Text ${boneName} not found`);
    }
  }

  /**
   * Reset layout, destroy all spines, animations, texts, and tiles.
   * This will remove all children from the layout.
   */
  reset() {
    this.spines.forEach((spine) => {
      spine.destroy();
    });

    this.spines.clear();
    this.animations.clear();
    this.texts.clear();
    this.tiles.clear();

    this.removeChildren();
  }

  getSpine(spineID: string): Spine | undefined {
    return this.spines.get(spineID);
  }

  /**
   * Add callback to be called when the layout is initialized.
   * This is useful for waiting until all spines are created and attached.
   * This will be called after all spines are created and attached.
   * @param {Function} callback - Callback to be called when the layout is initialized.
   */
  onInit(callback: () => void) {
    this.onInitCallbacks.push(callback);
  }

  /**
   * Play a queue of animations.
   * This will stop all currently playing animations and play the animations in the queue one by one.
   * @param queue - Array of animation names to play
   */
  async playAnimationsQueue(queue: string[]) {
    console.log('Play animations queue:', queue);

    this.stopAll();

    for (const animation of queue) {
      if (animation.startsWith('state_')) {
        const stateName = this.getStateName(animation);

        await this.playState(stateName);
      } else {
        await this.play(animation);
      }
    }
  }

  /**
   * Add a spine instance to layout.
   * @param spineID - ID of the spine instance
   * @param spine - spine instance to add
   */
  private addSpineInstance(spineID: string, spine: Spine) {
    if (this.spines.has(spineID)) {
      this.spines.get(spineID)?.destroy();
      this.spines.delete(spineID);
    }

    this.spines.set(spineID, spine);
    const animations = spine.state.data.skeletonData.animations.map((a) => a.name);

    if (this.options?.debug) {
      console.log(`➕ spine ${spineID}`, animations);
    }

    animations.forEach((animation) => {
      const noModAnimation = this.stripModificators(animation);

      if (!this.animations.has(noModAnimation)) {
        const animationsRegistry: AnimationsRegistry = new Map();

        this.animations.set(noModAnimation, animationsRegistry);
      }

      if (animation.startsWith('state_')) {
        const stateName = this.getStateName(noModAnimation);
        const stateAnimations = this.statesAnimations.get(stateName) ?? [];

        if (!stateAnimations.includes(noModAnimation)) {
          stateAnimations.push(noModAnimation);
          this.statesAnimations.set(stateName, stateAnimations);
        }

        this.statesAnimations.set(stateName, stateAnimations);
      }

      const animations: string[] = this.animations.get(noModAnimation)?.get(spineID) ?? [];

      animations.push(animation);

      this.animations.get(noModAnimation)?.set(spineID, animations);
    });
  }

  private getStateName(animationName: string) {
    return `state_${animationName.split('_')[1]}`;
  }

  private isAnimationPlaying(spineID: string, animation: string) {
    const spine = this.spines.get(spineID)?.state;

    if (!spine) {
      return false;
    }

    const currentTrackEntry = spine.getCurrent(0);
    let currentAnimation;

    if (currentTrackEntry) {
      currentAnimation = currentTrackEntry.animation?.name;
    }

    return currentAnimation === animation;
  }

  private stripModificators(animationName: string) {
    const modificator = Object.values(modificators).find((mod) => animationName.includes(mod));

    if (modificator) {
      return animationName.split(modificator)[0];
    }

    return animationName;
  }

  private attachBones() {
    if (this.options?.debug) {
      console.log(`Attach Bones:`);
    }

    this.spines.forEach((spine, id) => {
      spine?.state.data.skeletonData.slots.forEach((slot) => {
        if (slot.name.startsWith(slotPointers.spine)) {
          this.attachBone(slot, spine, slot.name.replace(slotPointers.spine, ''), id);
        }
      });
    });

    this.spines.forEach((spine) => {
      if (!spine.parent) {
        this.addChild(spine);
      }
    });
  }

  private attachBone(slot: SlotData, spine: Spine, childSpineKey: string, id?: string) {
    const childSpine = this.spines.get(childSpineKey);

    if (childSpine) {
      spine.addSlotObject(slot.name, childSpine);

      if (this.options?.debug) {
        console.log(`${childSpineKey} -> ${id}(${slot.name})`);
      }
    }
  }

  // private turnAttachmentIntoTile(slot: SlotData, spine: Spine) {
  //   if (!slot.attachmentName) {
  //     console.error(`Attachment name is empty for slot ${slot.name}`);
  //     return;
  //   }

  //   try {
  //     const tile = TilingSprite.from(slot.attachmentName);

  //     this.tiles.set(slot.name, tile);
  //     spine.addSlotObject(slot.name, tile);

  //     if (this.options?.debug) {
  //       console.log(`Tile ${slot.name} -> ${slot.attachmentName}`);
  //     }
  //   } catch (error) {
  //     console.error(`Error creating tile from attachment ${slot.attachmentName}:`, error);
  //   }
  // }

  private attachTexts() {
    this.spines.forEach((spine) => {
      spine?.state.data.skeletonData.slots.forEach((slot) => {
        if (slot.name.startsWith(slotPointers.text)) {
          const textKey = slot.name.replace(slotPointers.text, '');

          // TODO: update text with the state values
          const text = new Text({
            text: slot.name,
            // TODO: get style from spine
            style: {
              fontFamily: 'Rubik',
              fontSize: 52,
              fill: 0x212a4f,
              align: 'center',
              stroke: {
                color: 0xffffff,
                width: 6,
                join: 'round',
              },
            },
          });

          text.anchor.set(0.5, 0.5);

          this.texts.set(textKey, text);

          if (text) {
            spine.addSlotObject(slot.name, text);
          } else {
            console.error(`Text ${textKey} not found for bone ${slot.name}`);
          }
        }
      });
    });
  }

  private getSpinesFromManifest(manifest: AssetsManifest): SpineData[] {
    const spinesMap: SpineData[] = [];

    manifest.bundles.forEach((bundle: UnresolvedAsset) => {
      const skeletons = this.getAssetByType(bundle, 'skel');
      const jsons = this.getAssetByType(bundle, 'json');
      const atlases = this.getAssetByType(bundle, 'atlas');
      const pngs = this.getAssetByType(bundle, 'png');

      atlases?.forEach((atlas) => {
        const atlasID = atlas.replace(/\.atlas/, '');
        const hasJSON = jsons?.includes(`${atlasID}.json`);
        const hasSKEL = skeletons?.includes(`${atlasID}.skel`);
        const hasPNG = pngs?.includes(`${atlasID}.png`);

        if ((hasJSON || hasSKEL) && hasPNG) {
          const skel = hasJSON ? `${atlasID}.json` : `${atlasID}.skel`;
          const texture = `${atlasID}.png`;

          spinesMap.push({
            atlas,
            skel,
            texture,
          });
        }
      });
    });

    // console.log(spinesMap);

    return spinesMap;
  }

  private getAssetByType(bundle: UnresolvedAsset, type: string): string[] | undefined {
    if (Array.isArray(bundle.assets)) {
      const assets = bundle.assets
        .filter(({ alias }) => alias[alias.length - 1].endsWith(type))
        .map(({ alias }) => alias[alias.length - 1]);

      return assets;
    } else {
      bundle.assets.endsWith(type);
    }
  }

  // private moveTiles() {
  //   this.tiles.forEach((tile, tileID) => {
  //     const moveType = tileID.split('_')[0];
  //     const speed = Number(tileID.split(modificators.speed)[1]);
  //     const speedX = Number(tileID.split(modificators.speedX)[1]);
  //     const speedY = Number(tileID.split(modificators.speedY)[1]);

  //     if (!tile) {
  //       return;
  //     }

  //     switch (moveType) {
  //       case 'tileH':
  //         tile.tilePosition.x += speedX ? speedX : speed;
  //         break;
  //       case 'tileV':
  //         tile.tilePosition.y += speedY ? speedY : speed;
  //         break;
  //       case 'tileVH':
  //       case 'tileHV':
  //         if (speed || speedX) {
  //           tile.tilePosition.x += speedX ? speedX : speed;
  //         }

  //         if (speed || speedY) {
  //           tile.tilePosition.y += speedY ? speedY : speed;
  //         }
  //         break;
  //     }
  //   });
  // }

  private resize() {
    this.fitVertical();
    this.fitHorizontal();
    this.resizeTiles();
  }

  private fitVertical() {
    const originalHeight = this.height / this.scale.y;
    const height = window.innerHeight;

    if (this.options?.maxHeight) {
      let maxHeight = 0;

      if (typeof this.options.maxHeight === 'number') {
        maxHeight = this.options.maxHeight;
      }

      if (typeof this.options.maxHeight === 'string') {
        maxHeight = (height / 100) * parseInt(this.options.maxHeight);
      }

      if (originalHeight > maxHeight) {
        const scale = maxHeight / originalHeight;

        if (this.options?.debug) {
          console.log(`Fit ${originalHeight} to maxHeight(${maxHeight}) scale(${scale})`);
        }

        this.scale.set(scale);
      }
    }

    if (this.options?.minHeight) {
      let minHeight = 0;

      if (typeof this.options.minHeight === 'number') {
        minHeight = this.options.minHeight;
      }

      if (typeof this.options.maxHeight === 'string') {
        minHeight = (height / 100) * parseInt(this.options.maxHeight);
      }

      if (originalHeight < minHeight) {
        const scale = minHeight / originalHeight;

        if (this.options?.debug) {
          console.log(`Fit ${originalHeight} to minHeight(${minHeight}) scale(${scale})`);
        }

        this.scale.set(scale);
      }
    }
  }

  private fitHorizontal() {
    const originalWidth = this.width / this.scale.x;
    const width = window.innerWidth;

    if (this.options?.maxWidth) {
      let maxWidth = 0;

      if (typeof this.options.maxWidth === 'number') {
        maxWidth = this.options.maxWidth;
      }

      if (typeof this.options.maxWidth === 'string') {
        maxWidth = (width / 100) * parseInt(this.options.maxWidth);
      }

      if (originalWidth > maxWidth) {
        const scale = maxWidth / originalWidth;

        if (this.options?.debug) {
          console.log(`Fit ${originalWidth} to maxWidth(${maxWidth}) scale(${scale})`);
        }

        this.scale.set(scale);
      }
    }

    if (this.options?.minWidth) {
      let minWidth = 0;

      if (typeof this.options.minWidth === 'number') {
        minWidth = this.options.minWidth;
      }

      if (typeof this.options.minHeight === 'string') {
        minWidth = (width / 100) * parseInt(this.options.minHeight);
      }

      if (originalWidth < minWidth) {
        const scale = minWidth / originalWidth;

        if (this.options?.debug) {
          console.log(`Fit ${originalWidth} to minHeight(${minWidth}) scale(${scale})`);
        }

        this.scale.set(scale);
      }
    }
  }

  private resizeTiles() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.tiles.forEach((tile, tileID) => {
      const tileType = tileID.split('_')[0];

      switch (tileType) {
        case 'tileH':
          tile.width = width / this.scale.x;
          break;
        case 'tileV':
          tile.height = height / this.scale.y;
          break;

        case 'tileVH':
        case 'tileHV':
          tile.width = width / this.scale.x;
          tile.height = height / this.scale.y;
          break;
      }
    });
  }
}

type SpineData = {
  atlas: string;
  skel: string;
  texture: string;
};
