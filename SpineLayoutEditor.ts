import { type FileData, type FileHandle, FileSystemController } from './FileSystemController';
import { SpineLayout } from './SpineLayout';
import { SpineLoader } from './SpineLoader';
import app from '../main';

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
    private loader = new SpineLoader();

    constructor(private layout: SpineLayout) {
        this.fs = new FileSystemController();
    }

    async init() {
        await this.fs.init();
        this.fs.watch((files: FileHandle[]) => {
            this.onFilesChanged(files);
        });
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
        const spinesData: Map<
            string,
            {
                image?: string;
                skel?: Uint8Array | ArrayBuffer;
                atlas?: string;
                skelType?: 'JSON' | 'skel';
            }
        > = new Map();

        for await (const fileData of files) {
            const file = await fileData.getFile();
            const reader = new FileReader();

            if (file.type.match(/image/)) {
                reader.readAsDataURL(file);
            } else if (/^.+\.skel$/.test(file.name)) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file);
            }

            reader.onload = async (event) => {
                const name = this.stripFileName(file.name);
                const spineData = spinesData.get(name) || {};

                if (file.type.match(/image/)) {
                    spinesData.set(name, {
                        ...spineData,
                        image: event.target!.result as string,
                    });
                } else if (file.type === 'application/json') {
                    spinesData.set(name, {
                        ...spineData,
                        skel: JSON.parse(event.target!.result as string),
                        skelType: 'JSON',
                    });
                } else if (/^.+\.skel$/.test(file.name)) {
                    spinesData.set(name, {
                        ...spineData,
                        skel: event.target!.result as Uint8Array,
                        skelType: 'skel',
                    });
                } else if (/^.+\.atlas$/.test(file.name)) {
                    spinesData.set(name, {
                        ...spineData,
                        atlas: event.target!.result as string,
                    });
                }

                const spine = spinesData.get(name);

                if (spine?.image && spine?.skel && spine?.atlas) {
                    console.log(`Loading spine data:`, files);

                    const spineData = await this.loader.loadSpineFiles(files);

                    if (spineData) {
                        console.log(`Spine data loaded:`, spineData);
                        this.layout.createInstanceFromData(spineData)
                    } else {
                        console.error(`Error loading spine data:`, spineData);
                    }
                }
            };
        }

    }

    private stripFileName(fileName: string): string {
        const parts = fileName.split('.');

        if (parts.length === 2) {
            return parts[0];
        } else {
            return fileName;
        }
    }
}
