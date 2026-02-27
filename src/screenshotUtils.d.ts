import type { Page } from 'puppeteer';
import type { CaptureData, SiteStrategy } from './types.js';
export declare function captureFinalSection(page: Page): Promise<Buffer | null>;
export declare function stitchScreenshots(captureData: CaptureData[], strategy: SiteStrategy, debugDir: string, finalSectionBuffer: Buffer | null): Promise<void>;
//# sourceMappingURL=screenshotUtils.d.ts.map