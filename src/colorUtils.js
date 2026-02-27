// colorUtils.ts
export function isVeryDark(hex) {
    if (!hex || typeof hex !== 'string')
        return false;
    const raw = hex.trim();
    if (!raw.startsWith('#'))
        return false;
    let normalized = raw.toUpperCase();
    if (normalized.length === 4) {
        const [_, r, g, b] = normalized;
        normalized = `#${r}${r}${g}${g}${b}${b}`;
    }
    if (normalized.length < 7)
        return false;
    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    if ([r, g, b].some(Number.isNaN))
        return false;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance < 0.12;
}
//# sourceMappingURL=colorUtils.js.map