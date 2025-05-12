import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { type AssetsManifest, Container, Text, type UnresolvedAsset } from 'pixi.js';

const bonesPointers = {
  spine: 'spine_',
  text: 'text_',
};

const modificators = {
  loop: '_loop',
  // TODO: add more modificators
  // random: '_random',
};

type SpineID = string;
type AnimationName = string;
type AnimationsRegistry = Map<SpineID, AnimationName[]>;

export class SpineLayout extends Container {
  private rootSpine: Spine | null = null;
  private spines: Map<SpineID, Spine> = new Map();
  private animations: Map<SpineID, AnimationsRegistry> = new Map();
  private texts: Map<SpineID, Text> = new Map();

  constructor(private debug = false) {
    super();
  }

  /**
   * Sets the root spine for the layout.
   * @param spineID - ID of the spine to set as root
   */
  setRootSpine(spineID: string) {
    const spine = this.spines.get(spineID);

    if (spine) {
      if (this.rootSpine) {
        this.removeChild(this.rootSpine);
      }

      this.rootSpine = spine;

      this.addChild(spine);
    } else {
      console.error(`Spine ${spineID} not found`);
    }
  }

  /**
   * Create a spine instance by skeleton and atlas.
   * @param skeleton - skeleton asset name
   * @param atlas - atlas asset name
   */
  createInstance(skeleton: string, atlas: string) {
    const spine = Spine.from({ skeleton, atlas, scale: 1 });
    const spineID = atlas.replace(/\.atlas/, '');

    this.spines.set(spineID, spine);

    if (this.debug) {
      console.log(spineID, spine.state.data.skeletonData.animations.map((a) => a.name));
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

    this.attachBones();
    this.attachTexts();

    if (!this.rootSpine && spineID === 'root') {
      this.setRootSpine(spineID);
    }
  }

  /**
   * Parse the manifest and create spine instances from it.
   * @param manifest - pixi assets manifest to create spine instances from
   */
  createInstancesFromManifest(manifest: AssetsManifest) {
    this.getSpinesFromManifest(manifest).forEach((spine) => {
      this.createInstance(spine.skel, spine.atlas);
    });
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

        if (this.debug) {
          console.log(`▶️`, spineID, animation, modificators);
        }

        animationsPromises.push(this.playByID(spineID, animation));

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

  async playByID(spineID: string, animation: string) {
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

  getAnimations(): string[] {
    return Array.from(this.animations.keys());
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
    this.spines.forEach((spine) => {
      spine?.state.data.skeletonData.slots.forEach((slot, id) => {
        if (slot.name.startsWith(bonesPointers.spine)) {
          const childSpineKey = slot.name.replace(bonesPointers.spine, '');
          const childSpine = this.spines.get(childSpineKey);

          if (childSpine) {
            spine.addSlotObject(slot.name, childSpine);


            if (this.debug) {
              console.log(`Spine ${childSpineKey} added to ${id}(${slot.name})`);
            }
          }
        }
      });
    });
  }

  private attachTexts() {
    this.spines.forEach((spine) => {
      spine?.state.data.skeletonData.bones.forEach((bone) => {
        if (bone.name.startsWith(bonesPointers.text)) {
          const textKey = bone.name.replace(bonesPointers.text, '');
          // TODO: update text with the state values
          const textValue = 'TEXT'; // Replace with the actual text object
          const text = new Text({
            text: textValue,
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
            spine.addSlotObject(bone.name, text);
          } else {
            console.error(`Text ${textKey} not found for bone ${bone.name}`);
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

  setText(spineID: string, text: string) {
    const textObject = this.texts.get(spineID);
    // console.log(textObject, text);

    if (textObject) {
      textObject.text = text;
    } else {
      console.error(`Text ${spineID} not found`);
    }
  }
}

type SpineData = {
  atlas: string;
  skel: string;
  texture: string;
};
