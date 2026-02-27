export function rankTextColors(aggregate) {
    return Object.entries(aggregate)
        .sort((a, b) => b[1].score - a[1].score)
        .map(([color, stats]) => ({
        color,
        score: stats.score,
        elements: [...stats.elements]
    }));
}
//# sourceMappingURL=colorRanking.js.map