// analysisLoopRunner.ts
import type { Page } from 'puppeteer';
import type { CaptureData, SiteStrategy } from './types.js';
import { performCleanup, forceRenderContent, advancePage } from './pageSetup.js';
import { scanViewportChunk, type ViewportScanChunk } from './viewportChunkScanner.js';
import { captureAndMergeNonTextElements } from './nonTextCapturePipeline.js';

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

export async function runAnalysisCaptureLoop(params: {
    page: Page;
    strategy: SiteStrategy;
    keepCookies?: boolean | undefined;
    viewportWidth: number;
    viewportHeight: number;
    runSafe: RunSafe;
}): Promise<LoopRunResult> {
    const { page, strategy, keepCookies, viewportWidth, viewportHeight, runSafe } = params;

    const captureData: CaptureData[] = [];
    const globalBgCounts: Record<string, number> = {};
    const globalImageCounts: Record<string, number> = {};
    let allTextNodes: any[] = [];
    const allNonTextElements: any[] = [];
    let totalScore = 0;
    let hasStaticFinalBehindMain = false;
    let loopCount = 0;
    let reachedEnd = false;
    let previousVisualHash = '';

    // ── Forward browser console → Node terminal ──
    // This captures console.log from page.evaluate (forceRenderContent, etc.)
    page.on('console', msg => {
        const text = msg.text();
        // Only forward our debug tags, skip noise
        if (text.startsWith('[GALLERY') || text.startsWith('[ForceRender') || text.startsWith('[SCAN-')) {
            console.log(`[Browser] ${text}`);
        }
    });

    await runSafe(() => window.scrollTo(0, 0));
    if (strategy === 'HORIZONTAL_APP') {
        try {
            await page.mouse.click(viewportWidth / 2, viewportHeight / 2);
        } catch {}
    }

    while (!reachedEnd && loopCount < 25) {
        if (page.isClosed()) break;
        loopCount++;

        await performCleanup(page, false, keepCookies);
        await forceRenderContent(page);

        const chunk = await page.evaluate(scanViewportChunk, loopCount, strategy) as ViewportScanChunk | null;

        if (chunk) {
            // ── Print debug log from browser context ──
            if (chunk.debugLog?.length) {
                for (const line of chunk.debugLog) {
                    console.log(line);
                }
            }

            totalScore += chunk.localTotalScore;
            for (const [k, v] of Object.entries(chunk.localBgs)) globalBgCounts[k] = (globalBgCounts[k] || 0) + v;
            const imgCount = Object.values(chunk.localImgs).reduce((a, b) => a + b, 0);
            if (imgCount > 0) globalBgCounts['IMAGE/VIDEO'] = (globalBgCounts['IMAGE/VIDEO'] || 0) + imgCount;
            for (const [k, v] of Object.entries(chunk.localImgs)) globalImageCounts[k] = (globalImageCounts[k] || 0) + v;
            if (chunk.hasStaticFinalBehindMain) hasStaticFinalBehindMain = true;

            allTextNodes = allTextNodes.concat(chunk.viewTextNodes.map((n: any) => ({ ...n, hasFinalInViewport: chunk.hasFinalSection })));

            if (chunk.nonTextElements?.length) {
                await captureAndMergeNonTextElements(page, chunk.nonTextElements, allNonTextElements);
            }

            if (loopCount > 1 && chunk.visualHash === previousVisualHash && chunk.visualHash.length > 5) {
                reachedEnd = true;
                break;
            }
            previousVisualHash = chunk.visualHash;
        }

        const buffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });
        captureData.push({ buffer: buffer as Buffer, index: loopCount, x: 0 });

        const done = await advancePage(page, strategy, loopCount, viewportHeight, runSafe);
        if (done) reachedEnd = true;
    }

    return {
        captureData,
        globalBgCounts,
        globalImageCounts,
        allTextNodes,
        allNonTextElements,
        totalScore,
        hasStaticFinalBehindMain
    };
}
