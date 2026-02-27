export type ViewportScanChunk = {
    localBgs: Record<string, number>;
    localImgs: Record<string, number>;
    viewTextNodes: any[];
    localTotalScore: number;
    nonTextElements: any[];
    visualHash: string;
    hasFinalSection: boolean;
    hasStaticFinalBehindMain: boolean;
    debugLog: string[];
};
export declare function scanViewportChunk(currentLoopIndex: number, strategy?: string): ViewportScanChunk;
//# sourceMappingURL=viewportChunkScanner.d.ts.map