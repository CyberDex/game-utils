/* eslint-disable @typescript-eslint/no-explicit-any */
import { Assets, type UnresolvedAsset } from 'pixi.js';

import { type FileData, type FileHandle, FileSystemController } from './FileSystemController';
import { type SpineInstanceData, SpineLayout } from './spine-layout/SpineLayout';

declare global {
  interface Window {
    showDirectoryPicker: (params: { mode: 'reed' | 'write' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker: (params: {
      types: {
        description: string;
        accept: {
          [key: string]: string[];
        };
      }[];
      excludeAcceptAllOption: boolean;
      multiple: boolean;
    }) => Promise<FileData>;
  }
}

export class SpineFSLoader {
  private fs: FileSystemController;
  private onCloseCallbacks: (() => void)[] = [];
  private initiated = false;
  private onFolderOpenCallbacks: (() => void)[] = [];
  private onInitCallbacks: (() => void)[] = [];

  constructor(private layout: SpineLayout) {
    this.fs = new FileSystemController();
    this.init();
  }

  /**
   * Initialises the SpineLayoutEditor.
   * This method sets up the file system controller and watches for changes in the spine files.
   * When files change, it reloads the layout and calls the registered callbacks.
   */
  async init() {
    await this.fs.init();

    const sotrFilesByName = true;

    this.fs.watch(
      async (files: FileHandle[]) => {
        if (this.initiated) {
          document.location.reload();
        } else {
          this.initiated = true;

          await this.renderSpines(files);
          this.onInitCallbacks.forEach((cb) => cb());
        }
      },
      ['atlas', 'json', 'png', 'skel'],
      sotrFilesByName
    );
  }

  /**
   * Checks if the layout editor is initialised.
   * @returns {boolean} True if the layout editor is initialised, false otherwise.
   */
  get isInitialised(): boolean {
    return this.initiated;
  }

  /**
   * Add a callback to be called when the layout is closed.
   * @param cb Callback to be called when the layout is closed.
   */
  onClose(cb: () => void) {
    this.onCloseCallbacks.push(cb);
  }

  /**
   * Add a callback to be called when the folder is opened.
   * @param cb Callback to be called when the folder is opeed.   *
   * This is useful for updating the UI or performing actions when the folder is opened.
   * For example, you might want to refresh the list of animations or update the UI state.
   */
  onFolderOpen(cb: () => void) {
    this.onFolderOpenCallbacks.push(cb);
  }

  /**
   * Add a callback to be called when the layout is initialised.
   * @param cb Callback to be called when the layout is initialised.
   */
  onInit(cb: () => void) {
    this.onInitCallbacks.push(cb);
  }

  private async renderSpines(files: FileHandle[]) {
    if (!files) {
      return;
    }

    console.log(
      'Files changed:',
      files.map((file) => file.name)
    );

    const spines = await this.loadSpines(files);

    this.layout.createInstancesFromDataArray(spines);

    this.onFolderOpenCallbacks.forEach((cb) => cb());
  }

  /**
   * Closes selected spine folder and resets the layout.
   */
  close() {
    this.fs.close();
    this.layout?.reset();
    this.onCloseCallbacks.forEach((cb) => cb());
  }

  /**
   * Checks if the file system is initialised.
   * @returns {boolean} True if the file system is initialised, false otherwise.
   */
  get isFSInitialised(): boolean {
    return this.fs.initialised;
  }

  /**
   * Loads spine files and prepares them for rendering.
   * @param files - Accepted files, including skeleton, atlas, and texture files.
   * @param files.skelFile - Skeleton file (.skel or .json)
   * @param files.atlasFile - Atlas file (.atlas)
   * @param files.textureFiles - Texture files (.png)
   * @throws Will throw an error if the files are not valid or if loading fails.
   * @returns - SpineInstanceData
   */
  async loadSpineFiles(files: {
    skelFile: File;
    atlasFile: File;
    textureFiles: File[];
  }): Promise<SpineInstanceData | null> {
    const { skelFile, atlasFile, textureFiles } = files;

    try {
      // Load textures
      const assetBundle: Record<string, UnresolvedAsset> = {};

      await Promise.all(
        textureFiles.map(async (file) => {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          assetBundle[file.name] = {
            src: base64,
            data: { type: file.type },
          };
        })
      );

      // Add and load bundle
      Assets.addBundle('spineAssets', assetBundle);
      const textures = await Assets.loadBundle('spineAssets');

      let skeleton;

      if (skelFile.type === 'application/json') {
        const jsonText = await this.readFileAsText(skelFile);
        skeleton = JSON.parse(jsonText);
      } else if (skelFile) {
        skeleton = await this.readFileAsArrayBuffer(skelFile);
      } else {
        throw new Error('No skeleton file (.skel or .json) found');
      }

      if (!atlasFile) {
        throw new Error('No atlas file found');
      }
      const atlasText = await this.readFileAsText(atlasFile);

      return { skeleton, atlasText, textures };
    } catch (error) {
      console.error('Error loading Spine files:', error);
    }

    return null;
  }

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private async loadSpines(files: FileHandle[]): Promise<SpineInstanceData[]> {
    const spineFiles = this.convertToSpinesMap(files);
    const spines: SpineInstanceData[] = [];

    for (const spineFileData of Array.from(spineFiles.entries())) {
      if (!this.isFullSetOfSpineFiles(spineFileData[1])) {
        console.warn(`Incomplete set of spine files:`, spineFileData);

        continue;
      }

      const skelFile = await spineFileData[1].skel?.getFile();
      const atlasFile = await spineFileData[1].atlas?.getFile();
      const textureFilesPromises = spineFileData[1].png.map(
        async (fileHandle: FileHandle) => await fileHandle.getFile()
      );
      const textureFiles = await Promise.all(textureFilesPromises);

      if (!skelFile || !atlasFile) {
        console.warn(`Incomplete set of spine files:`, spineFileData);
        continue;
      }

      if (skelFile && atlasFile && textureFiles.length > 0) {
        const spineData = await this.loadSpineFiles({
          skelFile: skelFile as any,
          atlasFile: atlasFile as any,
          textureFiles: textureFiles as any,
        });

        if (spineData) {
          spines.push(spineData);
        }
      }
    }

    return spines;
  }

  private isFullSetOfSpineFiles(files: SpineFilesSet): boolean {
    const hasRequired = files.atlas !== null && files.png !== null;
    const hasOptional = files.skel !== null;

    return hasRequired && hasOptional;
  }

  private convertToSpinesMap(files: FileHandle[]): SpineFilesData {
    const fileMap: SpineFilesData = new Map();

    files.forEach((file) => {
      const [name, ext] = file.name.split('.');

      if (ext === 'skel' || ext === 'json') {
        if (!fileMap.has(name)) {
          fileMap.set(name, { skel: null, atlas: null, png: [] });
        }

        const currentEntry = fileMap.get(name);

        currentEntry!.skel = file;
      } else if (ext === 'atlas') {
        if (!fileMap.has(name)) {
          fileMap.set(name, { skel: null, atlas: null, png: [] });
        }

        const currentEntry = fileMap.get(name);

        currentEntry!.atlas = file;
      } else if (ext === 'png') {
        const baseName = name.replace(/_\d+$/, '');

        if (!fileMap.has(baseName)) {
          fileMap.set(baseName, { skel: null, atlas: null, png: [] });
        }

        const currentEntry = fileMap.get(baseName);

        currentEntry!.png.push(file);
      }
    });

    return fileMap;
  }
}

type SpineFilesData = Map<string, SpineFilesSet>;
type SpineFilesSet = {
  skel: FileHandle | null;
  atlas: FileHandle | null;
  png: FileHandle[];
};