import ls from 'localstorage-slim';
import type { Application } from 'pixi.js';
import { UPDATE_PRIORITY } from 'pixi.js';
import { Stats } from 'pixi-stats';

type Styles = {
    [key: string]: string;
};

const offsets = {
    x: 50,
    y: 30,
};
const defaultScale = 0.5;
const defaultStyles: Styles = {
    position: 'fixed',
    left: `-${offsets.x}px`,
    bottom: `-${offsets.y}px`,
    opacity: '0.8',
    'user-select': ' none',
    scale: `${defaultScale}`,
    userSelect: 'none',
};

export class PixiStats {
    private stats: Stats;
    private element!: HTMLElement;

    constructor(pixi: Application) {
        this.stats = new Stats(pixi.renderer);

        pixi.ticker.add(this.stats.update, this.stats, UPDATE_PRIORITY.UTILITY);

        const element = document.getElementById('stats');

        if (element) {
            this.element = element;
        }

        this.stats.domElement.addEventListener('pointerup', () => {
            setTimeout(() => {
                ls.set('stats-mode', this.stats.mode);
            }, 10);
        });

        this.stats.showPanel(ls.get('stats-mode') ?? 0);

        this.setStyles(defaultStyles);
        this.stats.domElement.style.zIndex = '1000';
    }

    setStyles(styles: Styles) {
        if (!this.element) {
            console.error('Stats element not found');

            return;
        }

        for (const style in styles) {
            this.element.style.setProperty(style, styles[style]);
        }
    }

    remove() {
        if (!this.element) {
            console.error('Stats element not found');

            return;
        }

        this.element.remove();
    }
}
