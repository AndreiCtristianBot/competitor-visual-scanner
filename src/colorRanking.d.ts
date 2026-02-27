type ColorAggregate = Record<string, {
    score: number;
    elements: Set<string>;
}>;
export declare function rankTextColors(aggregate: ColorAggregate): {
    color: string;
    score: number;
    elements: string[];
}[];
export {};
//# sourceMappingURL=colorRanking.d.ts.map