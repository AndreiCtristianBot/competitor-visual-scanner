// browserManager.ts
import puppeteer, { Browser, Page } from 'puppeteer';
import { BROWSER_IDLE_MS } from './config.js'; // ← ES MODULE IMPORT, nu require!!
let browser = null;
let launchingPromise = null;
let lastUseTs = Date.now();
let idleTimer = null;
function scheduleIdleClose() {
    if (idleTimer)
        clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
        if (browser && Date.now() - lastUseTs >= BROWSER_IDLE_MS) {
            console.log('[Puppeteer] Închidere automată după idle.');
            await browser.close().catch(() => { });
            browser = null;
        }
    }, BROWSER_IDLE_MS + 2000);
}
export async function initializeBrowser() {
    if (launchingPromise)
        return launchingPromise;
    if (browser?.isConnected())
        return browser;
    console.log('[Puppeteer] Lansare instanță nouă de browser...');
    launchingPromise = puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-cache',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-features=ImproveInsecureCookieWarnings'
        ],
        defaultViewport: null
    }).then(newBrowser => {
        browser = newBrowser;
        newBrowser.on('disconnected', () => {
            console.log('[Puppeteer] Browser deconectat.');
            browser = null;
        });
        return newBrowser;
    }).catch(err => {
        console.error('[Puppeteer] Eroare la launch:', err);
        browser = null;
        throw err;
    }).finally(() => {
        launchingPromise = null;
    });
    return launchingPromise;
}
export async function getPage(options = {}) {
    const br = await initializeBrowser();
    lastUseTs = Date.now();
    scheduleIdleClose();
    if (options.incognito) {
        const context = await br.createBrowserContext();
        const page = await context.newPage();
        // Auto-close context când pagina se închide
        page.on('close', () => context.close().catch(() => { }));
        return page;
    }
    return await br.newPage();
}
//# sourceMappingURL=browserManager.js.map