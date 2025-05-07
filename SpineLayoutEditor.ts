import { Assets } from "pixi.js";
import { FileHandle, FileSystemController } from "./FileSystemController";
import { SpineLayout } from "./SpineLayout";

export class SpineLayoutEditor {
    fs: FileSystemController;

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
        console.log('Loading spine files:', files);

        let image: string;
        let skel: string;
        let atlas: string;

        const createSpine = () => {
            if (image && skel && atlas) {
                this.layout.createInstance(skel, atlas);
            }
        }

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
                if (file.type.match(/image/)) {
                    if (Assets.cache.has(file.name)) {
                        Assets.cache.remove(file.name);
                    }

                    await Assets.load(event.target!.result as string);

                    Assets.cache.set(
                        file.name,
                        Assets.cache.get(event.target!.result as string),
                    );

                    image = file.name;
                } else if (file.type === 'application/json') {
                    if (Assets.cache.has(file.name)) {
                        Assets.cache.remove(file.name);
                    }
                    Assets.cache.set(
                        file.name,
                        JSON.parse(event.target!.result as string),
                    );

                    skel = file.name;
                } else if (/^.+\.skel$/.test(file.name)) {
                    if (Assets.cache.has(file.name)) {
                        Assets.cache.remove(file.name);
                    }
                    Assets.cache.set(
                        file.name,
                        event.target!.result,
                    );

                    skel = file.name;
                } else if (/^.+\.atlas$/.test(file.name)) {
                    if (Assets.cache.has(file.name)) {
                        Assets.cache.remove(file.name);
                    }
                    Assets.cache.set(
                        file.name,
                        event.target!.result as string
                    );

                    atlas = file.name;
                }

                createSpine();
            };
        };
    }
}