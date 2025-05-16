import { Assets } from "pixi.js";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { extensions, ExtensionType, Texture } from 'pixi.js';
import type { FileHandle } from "./FileSystemController";
import type { SpineData } from "./SpineLayout";

const blobParser = {
    extension: ExtensionType.LoadParser,
    test: (url: string) => url.startsWith('blob:'),
    async load(url: string) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(Texture.from(img));
            img.onerror = reject;
            img.src = url;
        });
    }
};

extensions.add(blobParser);


export class SpineLoader {
    async loadSpineFiles(files: FileHandle[]): Promise<SpineData | null> {
        console.time('Load spines');

        const filePromises = files.map(async (fileHandle) => await fileHandle.getFile());
        const fileArray = await Promise.all(filePromises);

        console.timeEnd('Load spines');

        // Create a DataTransfer to convert the array to FileList
        const dataTransfer = new DataTransfer();
        fileArray.forEach((file: any) => dataTransfer.items.add(file));
        const fileList = dataTransfer.files;
        const acceptedFiles = Array.from(fileList);
        const imageFiles = acceptedFiles.filter(file => file.type.match(/image/));

        try {
            // Load textures
            const assetBundle: Record<string, {
                src: string;
                data: { type: string };
            }> = {};

            let fileName = '';

            await Promise.all(imageFiles.map(async (file) => {
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });

                assetBundle[file.name] = {
                    src: base64,
                    data: { type: file.type }
                };

                fileName = file.name.replace(/\.[^/.]+$/, '');
            }));

            // Add and load bundle
            console.log('Adding bundle:', `spine_${fileName}`, assetBundle);
            Assets.addBundle(`spine_${fileName}`, assetBundle);
            const textures = await Assets.loadBundle(`spine_${fileName}`);

            // Load skeleton and atlas files
            const skelFile = acceptedFiles.find(file => /^.+\.skel$/.test(file.name));
            const jsonFile = acceptedFiles.find(file => file.type === "application/json");
            const atlasFile = acceptedFiles.find(file => file.name.endsWith('.atlas'));

            let skel;

            if (skelFile) {
                skel = await this.readFileAsArrayBuffer(skelFile);
            } else if (jsonFile) {
                const jsonText = await this.readFileAsText(jsonFile);
                skel = JSON.parse(jsonText);
            } else {
                throw new Error('No skeleton file (.skel or .json) found');
            }

            if (!atlasFile) {
                throw new Error('No atlas file found');
            }

            await this.readFileAsText(atlasFile);

            const atlas = await this.readFileAsText(atlasFile);

            return {
                skel,
                atlas,
                textures
            };
        } catch (error) {
            console.error('Error loading Spine files:', error);
        }

        return null;
    }

    private readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    // Usage example:
    // Assuming you have a Spine instance called 'spineInstance'
    // const spineInstance = new PIXI.spine.Spine(spineData);
    // const analysis = analyzeSpineSkeleton(spineInstance);

    playSpineAnimationsInSequence(spineInstance: Spine) {
        const animations = spineInstance.skeleton.data.animations;
        let currentIndex = 0;
        spineInstance.state.addListener({
            complete: function () {
                currentIndex++;
                setTimeout(playNextAnimation, 250);
            },
        });
        function playNextAnimation() {
            if (currentIndex < animations.length) {
                const animation = animations[currentIndex];

                document.getElementById(
                    "currentAnimation"
                )!.innerHTML = `Animation: ${animation.name}`;
                spineInstance.state.setAnimation(0, animation.name, false);
            } else {
                currentIndex = 0;
                setTimeout(playNextAnimation, 250);
            }
        }

        playNextAnimation();
    }
}
