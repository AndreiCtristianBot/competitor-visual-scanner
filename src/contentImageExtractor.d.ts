import type { Page } from 'puppeteer';
type ContentImage = {
    src: string;
    alt: string;
    base64: string;
    width: number;
    height: number;
};
export declare function collectTopContentImages(page: Page, limit?: number): Promise<ContentImage[]>;
export {};
//# sourceMappingURL=contentImageExtractor.d.ts.map