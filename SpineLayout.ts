import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  SlotData,
  Spine,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import {
  Assets,
  type AssetsManifest,
  Container,
  Text,
  // Texture,
  Ticker,
  TilingSprite,
  type UnresolvedAsset,
} from 'pixi.js';

const slotPointers = {
  spine: 'spine_',
  text: 'text_',
  tile: ['tileH_', 'tileV_', 'tileVH_', 'tileHV_'],
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
};

export class SpineLayout extends Container {
  private spines: Map<SpineID, Spine> = new Map();
  private animations: Map<SpineID, AnimationsRegistry> = new Map();
  private texts: Map<SpineID, Text> = new Map();
  private tiles: Map<SpineID, TilingSprite> = new Map();

  constructor(private options?: SpineLayoutOptions) {
    super();

    if (options?.maxHeight || options?.minHeight || options?.maxWidth || options?.minWidth) {
      window.addEventListener('resize', () => this.resize());
      this.on('childAdded', () => this.resize());
    }
  }

  async createInstanceFromData(
    spineID: string,
    skeleton: Uint8Array | ArrayBuffer,
    atlas: string,
    // image: string,
    isSkel: boolean
  ) {
    console.log(`create spine`, {
      skeleton,
      atlas,
      spineID,
      // animations: spine.state.data.skeletonData.animations.map((a) => a.name)
    });

    // const texture: Texture = await Assets.load(image);
    const spineAtlas = new TextureAtlas(atlas);

    Assets.cache.set(`${spineID}_atlas`, spineAtlas);

    let skeletonData: SkeletonData;

    if (isSkel) {
      const spineBinaryParser = new SkeletonBinary(new AtlasAttachmentLoader(spineAtlas));
      skeletonData = spineBinaryParser.readSkeletonData(new Uint8Array(skeleton));
      Assets.cache.set(`${spineID}_skel`, skeletonData);
    } else {
      const spineJsonParser = new SkeletonJson(new AtlasAttachmentLoader(spineAtlas));
      skeletonData = spineJsonParser.readSkeletonData(skeleton);
      Assets.cache.set(`${spineID}_skel`, skeletonData);
    }

    // const spine = Spine.from({
    //     skeleton: `${spineID}_skel`,
    //     atlas: `${spineID}_atlas`,
    // });

    // this.addChild(spine);

    // console.log(`!!! createInstance`, {
    //     texture,
    //     skeletonData,
    //     spineAtlas,
    //     spine
    // });

    // this.createInstance(skeletonData, spineAtlas);
    // Inject rendererObject manually
    // for (const page of spineAtlas.pages) {
    //     // Manually assign Pixi baseTexture to Spine rendererObject
    //     page.rendererObject = texture.baseTexture;

    //     // These must also be set
    //     page.width = texture.baseTexture.width;
    //     page.height = texture.baseTexture.height;
    // }
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
      this.createInstance(spine.skel, spine.atlas);
    });

    this.attachBones();
    this.attachTexts();
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

        if (this.options?.debug) {
          console.log(`▶️ ${spineID}(${animation})`);
        }

        animationsPromises.push(this.playInstanceAnimation(spineID, animation));

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
   * Play spine animation by ID.
   * @param spineID - spine ID to play the animation on
   * @param animation - animation name to play
   */
  async playInstanceAnimation(spineID: string, animation: string) {
    const mod = Object.values(modificators).filter((mod) => animation.includes(mod));
    const spine = this.spines.get(spineID)?.state;

    if (!spine) {
      console.error(`Spine ${spineID} not found`);
      return;
    }

    if (this.isAnimationPlaying(spineID, animation)) {
      return Promise.resolve();
    }

    spine.setAnimation(0, animation, mod.includes(modificators.loop));

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
   * Start moving tiles.
   */
  startTiles() {
    Ticker.shared.add(this.moveTiles, this);
  }

  /**
   * Stop moving tiles.
   */
  stopTiles() {
    Ticker.shared.remove(this.moveTiles, this);
  }

  /**
   * Create a spine instance by skeleton and atlas.
   * @param skeleton - skeleton asset name
   * @param atlas - atlas asset name
   */
  private createInstance(skeleton: string, atlas: string) {
    const spine = Spine.from({ skeleton, atlas, scale: 1 });
    const spineID = atlas.replace(/\.atlas/, '');

    this.spines.set(spineID, spine);

    if (this.options?.debug) {
      console.log(
        spineID,
        spine.state.data.skeletonData.animations.map((a) => a.name)
      );
    }

    const animations = spine.state.data.skeletonData.animations.map((a) => a.name);

    animations.forEach((animation) => {
      const noModAnimation = this.stripModificators(animation);

      if (!this.animations.has(noModAnimation)) {
        const animationsRegistry: AnimationsRegistry = new Map();

        this.animations.set(noModAnimation, animationsRegistry);
      }

      const animations: string[] = this.animations.get(noModAnimation)?.get(spineID) ?? [];

      animations.push(animation);

      this.animations.get(noModAnimation)?.set(spineID, animations);
    });
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

        slotPointers.tile.forEach((tile) => {
          if (slot.name.startsWith(tile)) {
            this.turnAttachmentIntoTile(slot, spine);
          }
        });
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

  private turnAttachmentIntoTile(slot: SlotData, spine: Spine) {
    if (!slot.attachmentName) {
      console.error(`Attachment name is empty for slot ${slot.name}`);
      return;
    }

    try {
      const tile = TilingSprite.from(slot.attachmentName);

      this.tiles.set(slot.name, tile);
      spine.addSlotObject(slot.name, tile);

      if (this.options?.debug) {
        console.log(`Tile ${slot.name} -> ${slot.attachmentName}`);
      }
    } catch (error) {
      console.error(`Error creating tile from attachment ${slot.attachmentName}:`, error);
    }
  }

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

  private moveTiles() {
    this.tiles.forEach((tile, tileID) => {
      const moveType = tileID.split('_')[0];
      const speed = Number(tileID.split(modificators.speed)[1]);
      const speedX = Number(tileID.split(modificators.speedX)[1]);
      const speedY = Number(tileID.split(modificators.speedY)[1]);

      if (!tile) {
        return;
      }

      switch (moveType) {
        case 'tileH':
          tile.tilePosition.x += speedX ? speedX : speed;
          break;
        case 'tileV':
          tile.tilePosition.y += speedY ? speedY : speed;
          break;
        case 'tileVH':
        case 'tileHV':
          if (speed || speedX) {
            tile.tilePosition.x += speedX ? speedX : speed;
          }

          if (speed || speedY) {
            tile.tilePosition.y += speedY ? speedY : speed;
          }
          break;
      }
    });
  }

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
