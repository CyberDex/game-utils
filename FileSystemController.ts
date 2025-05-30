import { del, get, set } from 'idb-keyval';

type Values = {
  values: () => (FileHandle | DirHandle)[];
};
type DirHandle = FileSystemDirectoryHandle &
  Values & {
    directoryHandle: DirHandle;
  };
export type FileHandle = Blob & {
  name: string;
  type: string;
  kind: 'file' | 'directory';
  getFile: () => Promise<
    FileData & {
      lastModifiedDate: string;
      directoryHandle: DirHandle;
    }
  >;
  getDirectory: () => Promise<DirHandle>;
  lastModifiedDate: string;
  directoryHandle: DirHandle;
} & Values;

export class FileSystemController {
  dirHandle!: DirHandle | null;
  filesHash: Map<string, number> = new Map();
  folderFiles!: FolderData;
  userInteractionDone = false;

  constructor() {
    if (!FileSystemController.isSupported) {
      console.error('This browser does not support the File System Access API.');
    }

    window.addEventListener('click', () => (this.userInteractionDone = true));
  }

  async init() {
    const dirHandle = await get<DirHandle>('dirHandle');

    if (dirHandle) {
      this.dirHandle = dirHandle;

      await this.getSelectedDirFiles();
    } else if (this.userInteractionDone) {
      try {
        await this.selectFolder();
        // await this.init();
      } catch (error) {
        this.dirHandle = null;

        console.error('Error getting directory handle', error);
      }
    }
  }

  private async getSelectedDirFiles() {
    if (!this.dirHandle) return;

    try {
      this.folderFiles = await this.getDirFiles(this.dirHandle, this.dirHandle.name);
    } catch (error) {
      console.error(error);
      del('dirHandle');
    }
  }

  async selectFolder(): Promise<FileSystemController> {
    try {
      this.dirHandle = (await window.showDirectoryPicker({ mode: 'readwrite' })) as DirHandle;

      set('dirHandle', this.dirHandle);

      await this.getSelectedDirFiles();
    } catch (error) {
      this.dirHandle = null;

      console.error(error);
    }

    if (!this.dirHandle) {
      console.error('User cancelled, or otherwise failed to open a folder.');
    }

    return this;
  }

  async selectFile(fileTypes?: string[]): Promise<FileData | null> {
    try {
      const file = await window.showOpenFilePicker({
        types: [
          {
            description: 'Images',
            accept: {
              '*/*': fileTypes ?? [],
            },
          },
        ],
        excludeAcceptAllOption: true,
        multiple: false,
      });

      return file;
    } catch (error) {
      console.error(error);
    }

    return null;
  }

  async watch(onChange: (files: FileHandle[]) => void, fileTypes?: string[]) {
    if (!this.dirHandle) {
      return;
    }

    const changedFiles: FileHandle[] = [];

    for await (const entry of this.dirHandle.values()) {
      if (entry.kind === 'file') {
        try {
          if (entry.name === '.DS_Store') {
            continue;
          }

          const fileData = await entry.getFile();
          const fileExtention = entry.name.split('.').pop();

          if (fileTypes?.length && fileExtention && !fileTypes.includes(fileExtention)) {
            continue;
          }

          if (fileData.lastModified !== this.filesHash.get(fileData.name)) {
            changedFiles.push(entry as FileHandle);
            this.filesHash.set(fileData.name, fileData.lastModified);
          }
        } catch (error) {
          console.error(error);
        }
      }
    }

    if (changedFiles.length > 0) {
      onChange(changedFiles);
    }

    setTimeout(() => this.watch(onChange, fileTypes), 1000);
  }

  async getDirFiles(
    handle: DirHandle | FileHandle | null = this.dirHandle,
    path: string | undefined = this.dirHandle?.name,
    rocoursive = false
  ): Promise<FolderData> {
    if (!handle) {
      return [];
    }

    const dirs = [];
    const files: Promise<FileData>[] = [];

    for await (const entry of handle.values()) {
      const nestedPath = `${path}/${entry.name}`;

      if (entry.kind === 'file') {
        try {
          if (entry.name === '.DS_Store') {
            continue;
          }

          const getFile = entry.getFile();

          files.push(getFile);
        } catch (error) {
          this.dirHandle = null;

          console.error(`Error getting file ${nestedPath}`, error);
        }
      } else if (rocoursive && entry.kind === 'directory') {
        dirs.push(this.getDirFiles(entry, nestedPath));
      }
    }

    return [...(await Promise.all(dirs)).flat(), ...(await Promise.all(files))] as FolderData;
  }

  get initialised(): boolean {
    return this.dirHandle !== null && this.dirHandle !== undefined;
  }

  async close() {
    this.dirHandle = null;
    this.folderFiles = [];
    this.filesHash.clear();

    await del('dirHandle');
  }

  static get isSupported() {
    return (
      'showDirectoryPicker' in window &&
      (() => {
        try {
          return window.self === window.top;
        } catch {
          return false;
        }
      })()
    );
  }

  async writeFile(fileName: string, data: FileSystemWriteChunkType): Promise<void> {
    if (!this.dirHandle) {
      console.error('No directory handle found. Please select a folder first.');
    }

    const fileHandle = await this.dirHandle?.getFileHandle(fileName, { create: true });

    const writable = await fileHandle?.createWritable();

    await writable?.write(data);
    await writable?.close();
  }
}

export type FileData = {
  directoryHandle: FileSystemDirectoryHandle;
  handle: FileSystemFileHandle;
  webkitRelativePath: string;
  lastModified: number;
  lastModifiedDate: number;
  name: string;
  size: number;
  type: string;
};
export type FolderData = FileData[];
