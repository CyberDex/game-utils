import type { ButtonApi, FolderApi } from 'tweakpane';
import type { DevTools } from './devTools';
import { type FileData, type FileHandle, FileSystemController } from './FileSystemController';
import { SpineLayout } from './SpineLayout';

declare global {
  interface Window {
    showDirectoryPicker: (params: { mode: 'reed' | 'write' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker: (params: {
      types: {
        description: string;
        accept: {
          [key: string]: string[];
        };
      }[],
      excludeAcceptAllOption: boolean;
      multiple: boolean;
    }) => Promise<FileData>;
  }
}

export class SpineLayoutEditor {
  private fs: FileSystemController;
  private availableAnimations!: FolderApi;
  private _onClose: (() => void)[] = [];

  constructor(private layout: SpineLayout, private devTools: DevTools) {
    this.fs = new FileSystemController();
    this.init().then(() => {
      this.addUI();
    });
  }

  onClose(cb: () => void) {
    this._onClose.push(cb);
  }

  async init() {
    await this.fs.init();

    this.fs.watch((files: FileHandle[]) => {
      this.onFilesChanged(files);
    }, ['atlas', 'json', 'png', 'skel']);
  }

  private async onFilesChanged(files: FileHandle[]) {
    if (!files) {
      return;
    }

    console.log('Files changed:', files.map((file) => file.name));

    await this.loadSpine(files);

    this.layout?.getAnimations().forEach((animation) => {
      // this.animationsFolder.children.forEach((child) => {
      //     child.dispose();
      // });
      this.animationsFolder.addButton({ title: animation }).on('click', async () => {
        console.log(`start: ${animation}`);

        await this.layout?.play(animation);

        console.log(`end: ${animation}`);
      });
    });
  }

  close() {
    this._onClose.forEach((cb) => cb());
    this.fs.close();
    this.animationsFolder.dispose();
    this.layout?.reset();
  }

  get initialised(): boolean {
    return this.fs.initialised;
  }

  private async loadSpine(files: FileHandle[]) {
    const spineFiles = this.convertToSpinesMap(files);

    for (const spineFileData of spineFiles) {
      if (!this.isFullSetOfSpineFiles(spineFileData[1])) {
        console.warn(`Incomplete set of spine files:`, spineFileData);

        continue;
      }

      const skelFile = await spineFileData[1].skel?.getFile();
      const atlasFile = await spineFileData[1].atlas?.getFile();
      const textureFilesPromises = (spineFileData[1].png ?? []).map(async (fileHandle) => await fileHandle.getFile());
      const textureFiles = await Promise.all(textureFilesPromises);

      if (!skelFile || !atlasFile) {
        console.warn(`Incomplete set of spine files:`, spineFileData);
        continue;
      }

      if (skelFile && atlasFile && textureFiles.length > 0) {
        const spineData = await this.layout.loadSpineFiles({
          skelFile,
          atlasFile,
          textureFiles
        });

        if (spineData) {
          this.layout.createInstanceFromData(spineData);
        }
      }
    };
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

        currentEntry!.png?.push(file);
      }
    });

    return fileMap;
  }

  private get animationsFolder(): FolderApi {
    if (!this.availableAnimations) {
      this.availableAnimations = this.devTools.addFolder({
        title: 'Animations',
        expanded: true,
      });
    }

    return this.availableAnimations;
  }

  private async addUI() {
    const button = this.devTools.addFolder({
      title: 'Editor',
      expanded: true,
    }).addButton({
      title: 'Open layout',
    }).on('click', async () => {
      if (this.initialised) {
        await this.close();
      } else {
        await this.init();
      }

      setTimeout(() => {
        button.title = this.initialised ? 'Close layout' : 'Open layout';
      }, 100);
    });

    if (this.initialised) {
      setTimeout(() => {
        button.title = 'Close layout';
      }, 100);
    }
  }
}

type SpineFilesData = Map<string, SpineFilesSet>;
type SpineFilesSet = {
  skel: FileHandle | null;
  atlas: FileHandle | null;
  png: FileHandle[] | null;
};