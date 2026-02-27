import type { Page } from 'puppeteer';
import type { SiteStrategy } from './types.js';
export declare function dismissOverlays(page: Page, keepCookies?: boolean): Promise<void>;
export declare function performCleanup(page: Page, isInitial: boolean, keepCookies?: boolean): Promise<void>;
export declare function forceRenderContent(page: Page): Promise<void>;
export declare function detectStrategy(page: Page): Promise<SiteStrategy>;
export declare function advancePage(page: Page, strategy: SiteStrategy, loopCount: number, viewportH: number, runSafe: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T | null>): Promise<boolean>;
//# sourceMappingURL=pageSetup.d.ts.map