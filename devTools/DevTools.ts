import { removeMobileConsole, initMobileConsole } from './tools/MobileConsole';
import { PixiStats } from './tools/PixiStats';
import type { FolderApi } from 'tweakpane';
import { Pane } from 'tweakpane';
import ls from 'localstorage-slim';
import type { BindingApi, BladeState, ButtonApi, FolderParams } from '@tweakpane/core';
import { type Application } from 'pixi.js';

type Position = {
    x: 'left' | 'right';
    y: 'top' | 'bottom';
};

type DevToolsConfig = {
    app?: Application;
    position?: Position;
    gameName?: string;
    gameVersion?: string;
};

export class DevTools extends Pane {
    protected container: HTMLDivElement;

    pixiStats!: PixiStats | null;
    debugFolder!: FolderApi;

    constructor(private config: DevToolsConfig) {
        const container = document.createElement('div');

        container.style.maxHeight = '100%';
        container.style.overflowY = 'auto';
        container.style.zIndex = '1000';

        super({
            title: 'DevTools',
            expanded: false,
            container,
        });

        this.container = container;
        this.setPosition(config?.position);

        this.init(this.config?.app);
    }

    private async init(app?: Application) {
        this.debugFolder = this.addFolder({
            title: 'Debug',
            expanded: false,
        });

        console.log(`💀 ${this.config.gameName} ${this.config.gameVersion}`);

        this.element.querySelector('.tp-rotv_b')?.addEventListener('click', () => this.saveState());

        this.addMobileConsole();

        if (app) {
            this.app = app;
        }

        this.loadState();

        this.on('change', () => this.saveState());
        document.body?.appendChild(this.container);
    }

    set app(app: Application) {
        window.__PIXI_APP__ = app;
        this.config.app = app;
        this.addPixiStats();
    }


    setPosition(position?: Position) {
        this.container.style.position = 'fixed';
        this.container.style.top = '3px';
        this.container.style.left = '3px';

        switch (position?.x) {
            case 'left':
                this.container.style.left = '0';
                this.container.style.right = '';
                break;
            case 'right':
                this.container.style.right = '0';
                this.container.style.left = '';
                break;
        }

        switch (position?.y) {
            case 'top':
                this.container.style.top = '0';
                this.container.style.bottom = '';
                break;
            case 'bottom':
                this.container.style.bottom = '0';
                this.container.style.top = '';
                break;
        }
    }

    protected loadState() {
        if (!ls.get('DevTools')) return;

        const state = ls.get('DevTools') as BladeState;

        this.importState(state);

        this.refresh();
    }

    protected saveState() {
        const state = this.exportState();

        ls.set('DevTools', state);
    }

    protected addPixiStats() {
        this.debugFolder.addBinding({ PixiStats: false }, 'PixiStats').on('change', ({ value }) => {
            this.updatePixiStats(value);
        });
    }

    protected updatePixiStats(enabled: boolean) {
        if (enabled && !this.pixiStats && this.config?.app) {
            this.pixiStats = new PixiStats(this.config?.app);
        }

        if (!enabled && this.pixiStats) {
            this.pixiStats.remove();
            this.pixiStats = null;
        }
    }

    protected addMobileConsole() {
        this.debugFolder
            .addBinding({ MobileConsole: false }, 'MobileConsole')
            .on('change', ({ value }) => {
                if (value) {
                    initMobileConsole();
                } else {
                    removeMobileConsole();
                }
            });
    }

    override addFolder(params: FolderParams): FolderApi {
        const folder = super.addFolder(params);

        folder.element.addEventListener('click', () => this.saveState());

        this.loadState();

        return folder;
    }

    addSection(config: SectionConfig): {
        section: FolderApi;
        fields: FieldsAPI;
        selectors: SelectorsAPI;
    } {
        const section = this.addFolder({
            title: config.title,
            expanded: config.expanded,
        });

        const fields: FieldsAPI = {};
        const selectors: SelectorsAPI = {};

        for (const fieldID in config.fields) {
            const field = config.fields[fieldID];

            switch (field.type) {
                case 'select':
                    // eslint-disable-next-line no-case-declarations
                    const options: {
                        options: Record<string, string>;
                    } = {
                        options: {
                            [field.title]: '',
                        },
                    };

                    for (const option in field.options) {
                        options.options[option] = field.options[option];
                    }

                    // eslint-disable-next-line no-case-declarations
                    const select = { [fieldID]: '' };

                    selectors[fieldID] = {
                        set: (val: string) => {
                            select[fieldID] = val;

                            this.refresh();
                            this.saveState();
                        },
                    };

                    fields[fieldID] = section
                        .addBinding(select, fieldID, options)
                        .on('change', ({ value }) => {
                            field.cb?.(value);
                        });
                    break;
                case 'button':
                    fields[fieldID] = section.addButton({ title: field.title }).on('click', () => {
                        field.cb?.('');
                    });
                    break;
            }
        }

        return {
            section,
            fields,
            selectors,
        };
    }
}

type SelectorsAPI = {
    [key: string]: {
        set: (val: string) => void;
    };
};

type FieldsAPI = {
    [key: string]: BindingApi | ButtonApi;
};

type DebugFieldType = 'button' | 'select';

export type DebugFieldOptions = {
    [key: string]: string;
};

type DebugFields = {
    [key: string]: {
        type: DebugFieldType;
        title: string;
        options?: DebugFieldOptions;
        cb?: (value: string) => void;
    };
};

export type SectionConfig = {
    title: string;
    expanded?: boolean;
    fields: DebugFields;
};
