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

    constructor(private layout: SpineLayout) {
        this.fs = new FileSystemController();
        this.init();
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

        // console.log('Files changed:', files);

        this.loadSpine(files);
    }

    close() {
        this.fs.close();
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
                const baseName = name.replace(/\d+$/, '');

                if (!fileMap.has(baseName)) {
                    fileMap.set(baseName, { skel: null, atlas: null, png: [] });
                }

                const currentEntry = fileMap.get(baseName);

                currentEntry!.png?.push(file);
            }
        });

        return fileMap;
    }

    private async addCheats() {
        const devTools = new DevTools({
            app: this.pixi,
            gameName: APP_NAME,
            gameVersion: this.version,
        })

        const cheats = devTools.addFolder({
            title: 'Available Animations',
            expanded: true,
        });

        this.layout?.getAnimations().forEach((animation) => {
            cheats.addButton({ title: animation }).on('click', async () => {
                console.log(`start: ${animation}`);

                await this.layout?.play(animation);

                console.log(`end: ${animation}`);
            });
        });

        const layoutEditor = new SpineLayoutEditor(this.layout!);


        devTools.addFolder({
            title: 'Editor',
            expanded: true,
        }).addButton({
            title: layoutEditor.initialised ? 'Close layout' : 'Open layout',
        }).on('click', async ({ target }: { target: ButtonApi }) => {
            if (layoutEditor.initialised) {
                await layoutEditor.close();
            } else {
                await layoutEditor.init();
            }

            target.title = layoutEditor.initialised ? 'Close layout' : 'Open layout';
        });
    }
}

type SpineFilesData = Map<string, SpineFilesSet>;
type SpineFilesSet = {
    skel: FileHandle | null;
    atlas: FileHandle | null;
    png: FileHandle[] | null;
};