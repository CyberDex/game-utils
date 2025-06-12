import {
  AtlasAttachmentLoader,
  SkeletonData,
  SkeletonJson,
  SlotData,
  Spine,
  SpineTexture,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import { type AssetsManifest, Container, Text, Texture, type UnresolvedAsset } from 'pixi.js';

const slotPointers = {
  spine: 'spine_',
  text: 'text_',
};

const folderPointers = {
  state: 'state_',
};

const modificators = {
  next: '_next',
  loop: '_loop',
  speed: '_speed_',
  speedX: '_speedX_',
  speedY: '_speedY_',
  // random: '_random',
};

type SpineID = string;
type AnimationName = string;
type AnimationsRegistry = Map<SpineID, AnimationName[]>;

type SpineLayoutOptions = {
  debug?: boolean;
  manifest?: AssetsManifest;
};

export type SpineInstanceData = {
  skeleton: SkeletonData;
  atlasText: string;
  textures: Record<string, Texture>;
};

type AnimationTrackRegistry = Map<AnimationName, number>;

export class SpineLayout extends Container {
  private spines: Map<SpineID, Spine> = new Map();
  private animations: Map<SpineID, AnimationsRegistry> = new Map();
  private statesAnimations: Map<string, string[]> = new Map();
  private activeAnimations: Map<string, AnimationTrackRegistry> = new Map();
  private loopingAnimations: Map<string, AnimationTrackRegistry> = new Map();
  private texts: Map<SpineID, Text> = new Map();

  constructor(private options?: SpineLayoutOptions) {
    super();

    if (options?.manifest) {
      this.createInstancesFromManifest(options.manifest);
    }
  }

  createInstancesFromDataArray(data: SpineInstanceData[]) {
    data.forEach((item) => this.createInstanceFromData(item, true));

    this.attachBones();
    this.attachTexts();
  }

  /**
   * Creates a Spine instance from the provided data.
   * @param data - SpineInstanceData
   * @param data.skeleton - Skeleton data
   * @param data.atlasText - Atlas text
   * @param data.textures - Textures
   * @throws Will throw an error if the texture is missing for a page in the atlas.
   */
  createInstanceFromData(data: SpineInstanceData, skipAttachBones = false) {
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

    if (!skipAttachBones) {
      this.attachBones();
      this.attachTexts();
    }
  }

  /**
   * Parse the manifest and create spine instances from it.
   * @param manifest - pixi assets manifest to create spine instances from
   */
  createInstancesFromManifest(manifest: AssetsManifest) {
    if (this.options?.debug) {
      console.log(`Create Spines:`);
    }

    this.getSpineAssetsFromManifest(manifest).forEach((spine) => {
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

    if (this.options?.debug) {
      console.log(`Start play state: ${stateName}`);
    }

    stateAnimations?.forEach((animation) => {
      this.animations.get(animation)?.forEach((animations, spineID) => {
        animations.forEach(async (animation) => {
          const promise = this.playInstanceAnimation(spineID, animation);

          animationsPromises.push(promise);

          activeStates.set(stateName, promise);
        });
      });
    });

    await Promise.all(animationsPromises);

    if (this.options?.debug) {
      console.log(`Finish play state: ${stateName}`);
    }

    activeStates.delete(stateName);
  }

  async playOnlyAnimation(animationName: string) {
    this.stopAll();
    this.playAnimationByName(animationName);
  }

  /**
   * Stop all currently playing animations.
   * This will clear all active animations and looping animations.
   * It will also stop all animations for each spine instance.
   */
  stopAll() {
    this.spines.forEach((spine, spineID) => {
      spine.state.clearTracks();

      console.log(`⏹️ Stop all animations for spine ${spineID}`);

      this.activeAnimations.delete(spineID);
      this.loopingAnimations.delete(spineID);
    });
  }

  /**
   * Tryes to play an animation based on the name of the animation for each of the created spine instances.
   * Will only play the animation if the animation name is found in the spine instance.
   * @param animationName The name of the animation to play
   */
  async playAnimationByName(animationName: string) {
    const animationsPromises: Promise<void>[] = [];

    this.animations.get(animationName)?.forEach((animations, spineID) => {
      animations.forEach(async (animation) => {
        const promise = this.playInstanceAnimation(spineID, animation);

        animationsPromises.push(promise);
      });
    });

    await Promise.all(animationsPromises);
  }

  /**
   * Play spine animation by ID.
   * @param spineID - spine ID to play the animation on
   * @param animation - animation name to play
   */
  async playInstanceAnimation(spineID: string, animation: string) {
    const mod = Object.values(modificators).filter((mod) => animation.includes(mod));
    const spine = this.spines.get(spineID)?.state;
    let nextAnimation: string | undefined;

    if (mod.includes(modificators.next)) {
      const regex = /next_(\w+)_?/;

      nextAnimation = animation.match(regex)?.[1];

      animation.replace(/next_\w+_?/g, '');
    }

    if (!spine) {
      console.error(`Spine ${spineID} not found`);
      return;
    }

    if (this.activeAnimations.get(spineID)?.get(animation)) {
      return Promise.resolve();
    }

    const loop = mod.includes(modificators.loop);

    const activeAnimations = this.activeAnimations.get(spineID)?.size || 0;
    const activeLoopAnimations = this.loopingAnimations.get(spineID)?.size || 0;
    const trackID = activeAnimations + activeLoopAnimations;

    spine.setAnimation(trackID, animation, loop);

    if (loop) {
      this.addLoopingAnimation(spineID, animation, trackID);
    } else {
      this.addActiveAnimation(spineID, animation, trackID);
    }

    if (this.options?.debug) {
      const track = trackID > 0 ? ` track ${trackID}` : '';

      let logString = `▶️ ${spineID}(${animation})${track}`;

      if (nextAnimation) {
        logString += `, next ${nextAnimation}`;
      }
      if (this.options?.debug) {
        console.log(logString);
      }
    }

    const animationPromise = new Promise<void>((resolve) => {
      this.spines.get(spineID)?.state.addListener({
        complete: async () => {
          this.removeActiveAnimation(spineID, animation);

          resolve();
        },
      });
    }).then(() => {
      if (nextAnimation) {
        this.playAnimationByName(nextAnimation);
      }
    });

    return animationPromise;
  }

  stopAnimation(spineID: string, animation: string) {
    const spine = this.spines.get(spineID)?.state;

    if (!spine) {
      console.error(`Spine ${spineID} not found`);
      return;
    }

    if (this.options?.debug) {
      console.log(`⏹️ ${spineID}(${animation})`);
    }

    const track = this.activeAnimations.get(spineID)?.get(animation);

    if (track) {
      spine.clearTrack(track);
    }

    const loopingTrack = this.loopingAnimations.get(spineID)?.get(animation);

    if (loopingTrack) {
      spine.clearTrack(loopingTrack);
    }

    this.removeLoopingAnimation(spineID, animation);
    this.removeActiveAnimation(spineID, animation);
  }

  private removeActiveAnimation(spineID: string, animation: string) {
    const activeAnimations = this.activeAnimations.get(spineID) ?? new Map<AnimationName, number>();

    if (activeAnimations.has(animation)) {
      activeAnimations.delete(animation);
      this.activeAnimations.set(spineID, activeAnimations);
    }
  }

  private addActiveAnimation(spineID: string, animation: string, trackID: number) {
    const activeAnimationsTracks = this.activeAnimations.get(spineID) ?? new Map<AnimationName, number>();

    activeAnimationsTracks.set(animation, trackID);

    this.activeAnimations.set(spineID, activeAnimationsTracks);
  }

  private addLoopingAnimation(spineID: string, animation: string, trackID: number) {
    const loopingAnimationsTracks = this.loopingAnimations.get(spineID) ?? new Map<AnimationName, number>();

    loopingAnimationsTracks.set(animation, trackID);

    this.loopingAnimations.set(spineID, loopingAnimationsTracks);
  }

  private removeLoopingAnimation(spineID: string, animation: string) {
    const loopingAnimations = this.loopingAnimations.get(spineID) ?? new Map<AnimationName, number>();

    if (loopingAnimations.has(animation)) {
      loopingAnimations.delete(animation);
      this.loopingAnimations.set(spineID, loopingAnimations);
    }
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

  getActiveAnimations(): string[] {
    return Array.from(this.activeAnimations.keys());
  }

  getLoopingAnimations(): string[] {
    return Array.from(this.loopingAnimations.keys());
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
   * Set the text style for a bone.
   * @param boneName - ID of the bone to set the text style for
   * @param style - Partial text style to apply
   */
  setTextStyle(boneName: string, style: Partial<Text['style']>) {
    const textObject = this.texts.get(boneName);

    if (textObject) {
      textObject.style = style;
    } else {
      console.error(`Text ${boneName} not found`);
    }
  }

  /**
   * Reset layout, destroy all spines, animations, texts.
   * This will remove all children from the layout.
   */
  reset() {
    this.spines.forEach((spine) => {
      spine.destroy();
    });

    this.spines.clear();
    this.animations.clear();
    this.texts.clear();

    this.removeChildren();
  }

  /**
   * Get a spine instance by ID.
   * @param spineID - ID of the spine instance to get
   * @returns The spine instance or undefined if not found
   */
  getSpine(spineID: string): Spine | undefined {
    return this.spines.get(spineID);
  }

  /**
   * Play a queue of animations.
   * This will stop all currently playing animations and play the animations in the queue one by one.
   * @param queue - Array of animation names to play
   */
  async playAnimationsQueue(queue: string[]) {
    if (this.options?.debug) {
      console.log(`Start animations queue:`, queue);
    }

    for (const animation of queue) {
      if (this.options?.debug) {
        console.log(`Play queue:`, animation);
      }

      if (animation.startsWith(folderPointers.state)) {
        const stateName = this.getStateName(animation);

        if (!stateName) {
          console.warn(`Animation ${animation} does not have a state name.`);
          continue;
        }

        await this.playState(stateName);
      } else {
        await this.playAnimationByName(animation);
      }
    }

    if (this.options?.debug) {
      console.log(`Finished animations queue:`, queue);
    }
  }

  /**
   * Add a spine instance to layout.
   * This will add the spine instance to the layout and register all animations from the spine instance.
   * If the spine instance with the same ID already exists, it will be destroyed and replaced with the new one.
   * This is useful for updating the spine instance with new animations or textures.
   * It will also attach the spine instance to the slots of other spine instances.
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

      if (animation.startsWith(folderPointers.state)) {
        const stateName = this.getStateName(noModAnimation);

        if (!stateName) {
          console.warn(`Animation ${noModAnimation} does not have a state name.`);
          return;
        }

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

  /**
   * Get the state name from an animation name.
   * @param animationName - The name of the animation to get the state name from.
   * The animation name should be in the format `state_<state_name>/<animationName>`.
   * For example, if the animation name is `state_walk/next`, it will return `walk`.
   * If the animation name does not start with `state_`, it will return undefined.
   * If the animation name does not have a state name, it will return undefined.
   * @returns The state name or undefined if not found.
   */
  private getStateName(animationName: string): string | undefined {
    const split = animationName.split('/');

    if (split[0].startsWith(folderPointers.state)) {
      return split[0].replace(folderPointers.state, '');
    }
  }

  /**
   * Get the value of a specific pointer in a string.
   * This method uses a regular expression to find the pointer in the string.
   * The pointer should be in the format `pointer_value_` where `pointer` is the name of the pointer and `value` is the value to return.
   * For example, if the string is `state_walk_next` and the pointer is `state`, it will return `walk`.
   * If the pointer is not found, it will return undefined.
   * @param str - The string to search in.
   * @param pointer - The pointer to search for.
   * @returns The value of the pointer or undefined if not found.
   */
  // private getValue(str: string, pointer: string): string | undefined {
  //   const regex = new RegExp(`${pointer}_(\\w+?)(?:_|$)`);
  //   const match = str.match(regex);

  //   return match?.[1];
  // }

  /**
   * Strip modificators from an animation name.
   * @param animationName - The name of the animation to strip modificators from.
   * This method will remove any modificators from the animation name.
   * Modificators are defined in the `modificators` object and can be:
   * - `_next` - next animation to play after this one
   * - `_loop` - loop the animation
   * - `_speed_` - speed of the animation
   * @returns The animation name without modificators.
   * For example, if the animation name is `walk_next`, it will return `walk`.
   * If the animation name does not have any modificators, it will return the original animation name.
   * If the animation name is `walk_loop`, it will return `walk`.
   */
  private stripModificators(animationName: string) {
    const modificator = Object.values(modificators).find((mod) => animationName.includes(mod));

    if (modificator) {
      return animationName.split(modificator)[0];
    }

    return animationName;
  }

  /**
   * Attach all bones (slots) to the spine instances.
   * This will attach all spine instances to the slots of other spine instances.
   * It will also add the spine instance to the stage if it has no parent.
   * Attaching will be done if slont name starts with `spine_X` where `X` is the ID of the spine instance.
   */
  private attachBones() {
    const results: { [key: string]: string[] } = {};

    this.spines.forEach((spine, id) => {
      spine?.state.data.skeletonData.slots.forEach((slot) => {
        if (slot.name.startsWith(slotPointers.spine)) {
          const attachedBones = this.attachBone(slot, spine, slot.name.replace(slotPointers.spine, ''));

          if (this.options?.debug) {
            if (attachedBones) {
              if (!results[id]) {
                results[id] = [];
              }
              results[id].push(attachedBones);
            }
          }
        }
      });
    });

    if (this.options?.debug && Object.keys(results).length > 0) {
      console.log(`Attach Bones:`, results);
    }

    this.spines.forEach((spine) => {
      if (!spine.parent) {
        this.addChild(spine);
      }
    });
  }

  /**
   * Attach spine instance to bone (slot) of other spine instance.
   * @param slot - Slot to attach the spine instance to
   * @param spine - Spine instance to the spine instance to
   * @param childSpineKey - Key spine instance  that will be attached to the slot
   * @param id - ID of the spine instance that will be attached, used for debugging
   */
  private attachBone(slot: SlotData, spine: Spine, childSpineKey: string): string | undefined {
    const childSpine = this.spines.get(childSpineKey);

    if (childSpine) {
      spine.addSlotObject(slot.name, childSpine);

      if (this.options?.debug) {
        return `${childSpineKey} -> ${slot.name}`;
      }
    }
  }

  /**
   * Attach texts to the spine instances.
   * This will create a Text object for each slot that starts with `text_` and attach it to the spine instance.
   * The text will be created with a default style and will be centered in the slot.
   */
  private attachTexts() {
    this.spines.forEach((spine) => {
      spine?.state.data.skeletonData.slots.forEach((slot) => {
        if (slot.name.startsWith(slotPointers.text)) {
          const textKey = slot.name.replace(slotPointers.text, '');
          const text = new Text();

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

  /**
   * Parse pixi manifest and get all spines from it.
   * @param manifest - The assets manifest to parse.
   * @returns - An array of SpineData objects containing atlas, skel, and texture paths.
   */
  private getSpineAssetsFromManifest(manifest: AssetsManifest): SpineData[] {
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

  /**
   * Get all assets of a specific type from a bundle.
   * @param bundle The asset bundle to search.
   * @param type The type of asset to find (e.g., 'skel', 'json', 'atlas', 'png').
   * @returns An array of asset paths or undefined if none found.
   */
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
}

type SpineData = {
  atlas: string;
  skel: string;
  texture: string;
};
