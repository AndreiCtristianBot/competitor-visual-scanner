import type { Page } from 'puppeteer';
import type { SiteStrategy } from './types.js';
type ViewportSize = {
    width: number;
    height: number;
};
type RunSafe = <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T | null>;
type BrandMark = {
    src: string;
    base64: string;
    width: number;
    height: number;
};
export declare function captureSiteBrandMark(page: Page, strategy: SiteStrategy, runSafe: RunSafe, viewport: ViewportSize): Promise<BrandMark | null>;
export {};
//# sourceMappingURL=brandMarkExtractor.d.ts.map