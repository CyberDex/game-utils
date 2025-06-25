export const arraysEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;

    return a.every((val, index) => val === b[index]);
}