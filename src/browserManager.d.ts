import { Browser, Page } from 'puppeteer';
export declare function initializeBrowser(): Promise<Browser>;
interface GetPageOptions {
    incognito?: boolean;
}
export declare function getPage(options?: GetPageOptions): Promise<Page>;
export {};
//# sourceMappingURL=browserManager.d.ts.map