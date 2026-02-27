import type { Page } from 'puppeteer';
import fs from 'fs';
import { Jimp } from 'jimp';
import type { CaptureData, SiteStrategy } from './types.js';

const VIEWPORT_W = 1920;
const VIEWPORT_H = 1080;

// ── Take special screenshot of #final by temporarily hiding #main ──
// Sites like palace.ch have #final behind a transformed #main — it's never
// visible in normal screenshots. We hide #main to reveal what's underneath.
export async function captureFinalSection(page: Page): Promise<Buffer | null> {
    try {
        console.log('[FINAL-CAPTURE] Detected #final behind #main. Taking special screenshot...');
        await page.evaluate(() => {
            const main = document.querySelector('#main');
            if (main) (main as HTMLElement).style.visibility = 'hidden';
            document.querySelectorAll('#bar, #mobile, #scrollbar, .cursor').forEach(el => {
                (el as HTMLElement).style.visibility = 'hidden';
            });
        });

        await new Promise(r => setTimeout(r, 500));
        const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 85 }) as Buffer;
        console.log('[FINAL-CAPTURE] Special screenshot captured successfully.');

        await page.evaluate(() => {
            const main = document.querySelector('#main');
            if (main) (main as HTMLElement).style.visibility = 'visible';
        });
        return buffer;
    } catch (e) {
        console.error('[FINAL-CAPTURE] Error:', e);
        return null;
    }
}

// ── Stitch individual frames into one long/wide image + save debug files ──
export async function stitchScreenshots(
    captureData: CaptureData[], strategy: SiteStrategy,
    debugDir: string, finalSectionBuffer: Buffer | null
): Promise<void> {
    if (!fs.existsSync('./debug_screens')) fs.mkdirSync('./debug_screens');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    try {
        if (captureData.length > 0) {
            let finalImage: any;

            if (strategy === 'HORIZONTAL_APP') {
                const OVERLAP_PX = 200;
                const totalWidth = VIEWPORT_W + (captureData.length - 1) * (VIEWPORT_W - OVERLAP_PX);
                if (totalWidth < 50000) {
                    finalImage = new Jimp({ width: totalWidth, height: VIEWPORT_H });
                    for (let i = 0; i < captureData.length; i++) {
                        const img = await Jimp.read(captureData[i].buffer);
                        img.resize({ w: VIEWPORT_W, h: VIEWPORT_H });
                        finalImage.composite(img, i * (VIEWPORT_W - OVERLAP_PX), 0);
                    }
                }
            } else {
                const totalHeight = captureData.length * VIEWPORT_H;
                if (totalHeight < 30000) {
                    finalImage = new Jimp({ width: VIEWPORT_W, height: totalHeight });
                    for (let i = 0; i < captureData.length; i++) {
                        const img = await Jimp.read(captureData[i].buffer);
                        img.resize({ w: VIEWPORT_W, h: VIEWPORT_H });
                        finalImage.composite(img, 0, i * VIEWPORT_H);
                 
                    }
                }
            }

            if (finalImage) await finalImage.write(`${debugDir}/FULL_PAGE_CAPTURE.jpg` as any);
        }

        if (finalSectionBuffer) {
            const img = await Jimp.read(finalSectionBuffer);
            await img.write(`${debugDir}/FINAL_SECTION_CAPTURE.jpg` as any);
            console.log(`[FINAL-CAPTURE] Debug image saved to ${debugDir}/FINAL_SECTION_CAPTURE.jpg`);
        }
    } catch (e) {
        console.error('Stitch error', e);
    }
}