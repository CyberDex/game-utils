import { Howl, type HowlOptions, Howler } from 'howler';
import type { AssetSrc, AssetsManifest, UnresolvedAsset } from 'pixi.js';

export type SoundSettings = {
  debug?: boolean;
  musicMuted: boolean;
  fxMuted: boolean;
  muted: boolean;
  musicVolume: number; // 0 to 1
  fxVolume: number; // 0 to 1
  skin?: string | null;
};

class Sounds {
  private userInteraction = false;
  private initialized = false;
  private soundNames: Map<string, AssetSrc> = new Map();
  private sounds: Map<string, Howl> = new Map();
  private fxSounds: Map<string, Howl> = new Map();
  private musicSounds: Map<string, Howl> = new Map();
  private activeMusic: string | null = null;

  constructor(
    private settings: SoundSettings = {
      musicMuted: false,
      fxMuted: false,
      muted: false,
      debug: false,
      musicVolume: 0.8,
      fxVolume: 0.8,
    }
  ) {
    window.addEventListener('visibilitychange', () => this.onVisibilityChange());

    this.mute();
  }

  init(pixiManifest: AssetsManifest, settings?: SoundSettings) {
    if (settings) {
      this.settings = {
        ...this.settings,
        ...settings,
      };
    }

    this.extractSoundNames(pixiManifest);

    this.initialized = true;

    this.playSounds();
  }

  private extractSoundNames(pixiManifest: AssetsManifest) {
    const assets: UnresolvedAsset[] =
      (pixiManifest.bundles.find((item) => item.name === 'sounds')?.assets as UnresolvedAsset[]) ?? [];

    assets.forEach((asset) => {
      if (!asset.src) return;

      if (typeof asset.alias === 'string') {
        this.soundNames.set(asset.alias, asset.src);
      }

      if (Array.isArray(asset.alias)) {
        asset.alias.forEach((alias) => {
          if (!asset.src) return;

          this.soundNames.set(
            alias,
            (asset.src as []).map((src) => `assets/${this.settings.skin ? this.settings.skin + '/' : ''}${src}`)
          );
        });
      }
    });
  }

  onUserInteraction() {
    this.userInteraction = true;

    this.playSounds();
  }

  async playFX(fx: string, loop = false) {
    if (!this.userInteraction || !this.initialized) {
      return;
    }

    const fxInstance = this.fxSounds.get(fx);

    if (fxInstance) {
      fxInstance.play();
      return;
    }

    const newInstance = this.addAndPlay(fx, {
      loop,
      volume: this.settings.fxVolume,
      mute: this.settings.fxMuted,
    });

    if (!newInstance) {
      if (this.settings.debug) {
        console.warn(`Failed to play FX: ${fx} - sound not found`);
      }
      return;
    }

    // console.log(`!!! Playing FX: ${fx}`);

    this.fxSounds.set(fx, newInstance);
  }

  stopFX(fx: string) {
    const fxInstance = this.fxSounds.get(fx);

    // console.log(`!!! Stopping FX: ${fx}`);

    if (fxInstance) {
      fxInstance.stop();
    }
  }

  playMusic(music: string) {
    if (this.activeMusic === music) {
      return;
    }

    this.stopAllMusic();

    const musicInstance = this.musicSounds.get(music);

    if (musicInstance) {
      musicInstance.play();
      this.activeMusic = music;
      return;
    }

    const newInstance = this.addAndPlay(music, {
      loop: true,
      volume: this.settings.musicVolume,
      mute: this.settings.musicMuted,
    });

    if (!newInstance) {
      if (this.settings.debug) {
        console.warn(`Failed to play music: ${music} - sound not found`);
      }
      return;
    }

    this.musicSounds.set(music, newInstance);

    this.activeMusic = music;
  }

  private stopAllMusic() {
    this.musicSounds.forEach((sound) => {
      sound.stop();
    });

    this.activeMusic = null;
  }

  private addAndPlay(soundName: string, settings: Partial<HowlOptions>): Howl | null {
    if (this.sounds.has(soundName)) {
      const sound = this.sounds.get(soundName)!;

      sound.play();

      return sound;
    }

    const soundSources = this.getSoundName(soundName);

    // Check if sound sources are valid before creating Howl
    if (!soundSources || soundSources.length === 0) {
      if (this.settings.debug) {
        console.warn(`Cannot create sound instance for "${soundName}": no valid sound sources found`);
      }
      return null;
    }

    const sound = new Howl({
      src: soundSources,
      preload: true,
      autoplay: true,
      ...settings,
    });

    this.sounds.set(soundName, sound);

    return sound;
  }

  private muteFX() {
    this.settings.fxMuted = true;

    this.fxSounds.forEach((sound) => {
      sound.mute(true);
    });
  }

  private unmuteFX() {
    this.settings.fxMuted = false;

    this.fxSounds.forEach((sound) => {
      sound.mute(false);
    });
  }

  private muteMusic() {
    this.settings.musicMuted = true;

    this.musicSounds.forEach((sound) => {
      sound.mute(true);
    });
  }

  private unmuteMusic() {
    this.settings.musicMuted = false;

    this.musicSounds.forEach((sound) => {
      sound.mute(false);
    });
  }

  updateSettings(settings: Partial<SoundSettings>) {
    this.settings = {
      ...this.settings,
      ...settings,
    };

    if (this.settings.muted) {
      this.mute();
    } else {
      this.unmute();
    }

    if (this.settings.fxMuted) {
      this.muteFX();
    } else {
      this.unmuteFX();
    }

    if (this.settings.musicMuted) {
      this.muteMusic();
    } else {
      this.unmuteMusic();
    }

    this.musicSounds.forEach((sound) => {
      sound.volume(this.settings.musicVolume);
    });

    this.fxSounds.forEach((sound) => {
      sound.volume(this.settings.fxVolume);
    });
  }

  mute() {
    Howler.mute(true);
  }

  unmute() {
    if (!this.userInteraction || !this.initialized || this.settings.muted) {
      return;
    }

    Howler.mute(false);
  }

  private playSounds() {
    if (!this.userInteraction || !this.initialized) {
      return;
    }

    this.unmute();
  }

  private onVisibilityChange() {
    if (document.hidden) {
      this.mute();
    } else if (!this.settings.muted) {
      this.unmute();
    }
  }

  private getSoundName(soundName: string): string[] {
    const soundData = this.soundNames.get(soundName);

    if (!soundData) {
      if (this.settings.debug) {
        const availableSounds = Array.from(this.soundNames.keys()).join(', ');
        console.error(`Sound not found: "${soundName}". Available sounds: [${availableSounds}]`);
      }
      return [];
    }

    if (Array.isArray(soundData)) {
      return soundData as string[];
    }

    if (typeof soundData === 'string') {
      return [`assets/${this.settings.skin ? this.settings.skin + '/' : ''}sounds/${soundData}.ogg`];
    }

    if (this.settings.debug) {
      console.error(`Invalid sound data type for "${soundName}":`, soundData);
    }
    return [];
  }
}

export const sounds = new Sounds();

const userInteraction = () => {
  window.removeEventListener('pointerdown', userInteraction);

  sounds.onUserInteraction();
};

window.addEventListener('pointerdown', userInteraction);
