export function onOutsideClick<T extends HTMLElement = HTMLElement>(
    ref: React.RefObject<T>,
    callback: () => void
): () => void {
    const handleClickOutside = (event: MouseEvent) => {
        if (ref.current && !ref.current.contains(event.target as Node)) {
            callback();
        }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
};
