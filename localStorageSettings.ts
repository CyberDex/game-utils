import merge from 'lodash.merge';

export class LocalStorageSettings<T extends Record<string, unknown>> {
    #settings: T;

    constructor(defaultSettings: T, private storageKey: string) {
        this.#settings = merge(defaultSettings, localStorage.getItem(this.storageKey) || '{}');
    }

    get(): T {
        return this.#settings;
    }

    set(newSettings: Partial<T>): void {
        this.#settings = merge(this.#settings, newSettings);

        this.save();
    }

    private save(): void {
        localStorage.setItem(this.storageKey, JSON.stringify(this.#settings));
    }
}