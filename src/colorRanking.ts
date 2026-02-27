type ColorAggregate = Record<string, { score: number; elements: Set<string> }>;

export function rankTextColors(aggregate: ColorAggregate) {
    return Object.entries(aggregate)
        .sort((a, b) => b[1].score - a[1].score)
        .map(([color, stats]) => ({
            color,
            score: stats.score,
            elements: [...stats.elements]
        }));
}
