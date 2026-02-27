import type { Page } from 'puppeteer';
import type { CaptureData, SiteStrategy } from './types.js';
export type RunSafe = <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T | null>;
export type LoopRunResult = {
    captureData: CaptureData[];
    globalBgCounts: Record<string, number>;
    globalImageCounts: Record<string, number>;
    allTextNodes: any[];
    allNonTextElements: any[];
    totalScore: number;
    hasStaticFinalBehindMain: boolean;
};
export declare function runAnalysisCaptureLoop(params: {
    page: Page;
    strategy: SiteStrategy;
    keepCookies?: boolean | undefined;
    viewportWidth: number;
    viewportHeight: number;
    runSafe: RunSafe;
}): Promise<LoopRunResult>;
//# sourceMappingURL=analysisLoopRunner.d.ts.map