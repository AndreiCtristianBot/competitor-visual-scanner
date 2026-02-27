import { getPage } from './browserManager.js';
import { dismissOverlays, detectStrategy, performCleanup } from './pageSetup.js';
import { captureFinalSection, stitchScreenshots } from './screenshotUtils.js';
import { deduplicateFinalArrows, processWCAG, processNonTextElements } from './wcagProcessing.js';
import { rankTextColors } from './colorRanking.js';
import { captureSiteBrandMark } from './brandMarkExtractor.js';
import { collectTopContentImages } from './contentImageExtractor.js';
import { runAnalysisCaptureLoop } from './analysisLoopRunner.js';
const VIEWPORT_W = 1920;
const VIEWPORT_H = 1080;
async function analyzeUrl(url, options = {}) {
    const page = await getPage();
    try {
        await page.setViewport({ width: VIEWPORT_W, height: VIEWPORT_H });
        if (options.prefersColorScheme && options.prefersColorScheme !== 'none') {
            await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: options.prefersColorScheme }]);
        }
    }
    catch (e) {
        console.log('[Puppeteer] Warn: Viewport setup -', e);
    }
    const runSafe = async (fn, ...args) => {
        try {
            if (page.isClosed())
                return null;
            return await page.evaluate(fn, ...args);
        }
        catch {
            return null;
        }
    };
    try {
        console.log(`[ANALYZER-ULTIMATE-FINAL] Navigating to ${url}...`);
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        }
        catch {
            console.log('Nav timeout...');
        }
        await new Promise(r => setTimeout(r, 8000));
        await dismissOverlays(page, options.keepCookies);
        await new Promise(r => setTimeout(r, 3000));
        await performCleanup(page, true, options.keepCookies);
        const strategy = await detectStrategy(page);
        console.log(`[Strategy Detected]: ${strategy}`);
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('ARROW DETECTED') ||
                text.includes('ARROW PASSED') ||
                text.includes('[SCAN-GALLERY-DEBUG]') ||
                text.includes('[SCAN-GALLERY-DEBUG-FB]')) {
                console.log('[BROWSER]', text);
            }
        });
        const { captureData, globalBgCounts, globalImageCounts, allTextNodes, allNonTextElements, totalScore: rawTotalScore, hasStaticFinalBehindMain } = await runAnalysisCaptureLoop({
            page,
            strategy,
            keepCookies: options.keepCookies,
            viewportWidth: VIEWPORT_W,
            viewportHeight: VIEWPORT_H,
            runSafe
        });
        let finalSectionBuffer = null;
        if (hasStaticFinalBehindMain && !page.isClosed()) {
            finalSectionBuffer = await captureFinalSection(page);
        }
        const cleanUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        await stitchScreenshots(captureData, strategy, `./debug_screens/${cleanUrl}`, finalSectionBuffer);
        const deduped = deduplicateFinalArrows(allTextNodes);
        const { contrastIssues, fontGroups, textColorAgg } = await processWCAG(deduped, captureData, finalSectionBuffer, allNonTextElements);
        const processedNonText = await processNonTextElements(allNonTextElements, captureData, finalSectionBuffer);
        const totalScore = rawTotalScore === 0 ? 1 : rawTotalScore;
        const backgrounds = Object.entries(globalBgCounts)
            .map(([color, score]) => ({
            color,
            surface: score,
            percentage: ((score / totalScore) * 100).toFixed(2),
            type: 'color'
        }))
            .sort((a, b) => b.surface - a.surface)
            .slice(0, 8);
        const images = Object.entries(globalImageCounts)
            .map(([src]) => ({ src, type: 'image', areaPercent: 'N/A' }))
            .slice(0, 15);
        const textColors = rankTextColors(textColorAgg);
        const siteLogo = await captureSiteBrandMark(page, strategy, runSafe, { width: VIEWPORT_W, height: VIEWPORT_H });
        const topImages = await collectTopContentImages(page, 10);
        return {
            url,
            backgrounds,
            images,
            textColors,
            colors: textColors,
            fonts: Object.entries(fontGroups)
                .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)
                .map(([name, weights]) => ({
                font: name,
                weights: Object.keys(weights).sort((a, b) => Number(a) - Number(b))
            })),
            accessibility: {
                summary: {
                    totalTextNodes: deduped.length,
                    issuesAA: contrastIssues.filter(i => i.AA.status === 'FAIL').length,
                    issuesAAA: contrastIssues.filter(i => i.AAA.status === 'FAIL').length
                },
                contrastIssues: contrastIssues.slice(0, 50)
            },
            nonTextElements: processedNonText,
            siteLogo,
            topImages
        };
    }
    catch (error) {
        console.error('[Analysis Error]:', error);
        return {
            url,
            backgrounds: [],
            images: [],
            textColors: [],
            colors: [],
            fonts: [],
            accessibility: { summary: { totalTextNodes: 0, issuesAA: 0, issuesAAA: 0 }, contrastIssues: [] },
            error: error.message,
            siteLogo: null,
            topImages: []
        };
    }
    finally {
        if (page)
            await page.close();
    }
}
export { analyzeUrl };
//# sourceMappingURL=analyzer.js.map