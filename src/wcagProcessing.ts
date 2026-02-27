// wcagProcessing.ts
import WCAGContrast from 'wcag-contrast';
import { Jimp, intToRGBA } from 'jimp';
import type { ContrastIssue, CaptureData, NonTextElement } from './types.js';

const VIEWPORT_W = 1920;
const VIEWPORT_H = 1080;
const DEBUG_IMAGE_TEXT_ISSUES = false;

// ── Deduplicate #final nodes that appear in every frame ──
// #final sits outside #main, so getBoundingClientRect always reports it as visible.
// FIX v3: Deduplicate by text content ONLY (ignore position — it may shift between loops).
export function deduplicateFinalArrows(allTextNodes: any[]): any[] {
    const finalCount = allTextNodes.filter(n => n.isInFinal).length;
    console.log(`[DEDUP] Total=${allTextNodes.length} isInFinal=${finalCount}`);
    if (finalCount > 0) {
        const samples = allTextNodes.filter(n => n.isInFinal).slice(0, 10)
            .map(n => `"${n.text}" c=${n.captureIndex}`);
        console.log(`[DEDUP] Final samples: ${samples.join(' | ')}`);
    }

    const result: any[] = [];
    const seenFinal = new Set<string>();

    for (let i = allTextNodes.length - 1; i >= 0; i--) {
        const node = allTextNodes[i];
        if (node.isInFinal) {
            // Key by text alone — position irrelevant for #final
            const key = node.hasArrow && node.isIconOnly
                ? `final_arrow`
                : `final_${node.text.trim().toLowerCase()}`;
            if (seenFinal.has(key)) continue;
            seenFinal.add(key);
        }
        result.push(node);
    }

    result.reverse();
    console.log(`[DEDUP] After: ${result.length} (removed ${allTextNodes.length - result.length})`);
    return result;
}

// ── Select the correct screenshot frame for cropping ──
function selectFrame(
    node: any, captureData: CaptureData[], finalSectionBuffer: Buffer | null
): { buffer: Buffer; index: number } | undefined {
    if (node.isInFinal && node.isStaticBehindMain && finalSectionBuffer) {
        return { buffer: finalSectionBuffer, index: -1 };
    }
    if (node.isInFinal) {
        return captureData[captureData.length - 1];
    }
    return captureData.find(c => c.index === node.captureIndex);
}

// ── Crop a preview image from a screenshot frame ──
function isLikelyBlankCrop(img: any): boolean {
    const w = img.width;
    const h = img.height;
    if (w < 6 || h < 6) return true;

    const stepX = Math.max(1, Math.floor(w / 7));
    const stepY = Math.max(1, Math.floor(h / 7));
    const samples: number[][] = [];
    for (let x = 0; x < w; x += stepX) {
        for (let y = 0; y < h; y += stepY) {
            const c = img.getPixelColor(x, y);
            const r = (c >> 24) & 0xFF;
            const g = (c >> 16) & 0xFF;
            const b = (c >> 8) & 0xFF;
            samples.push([r, g, b]);
        }
    }
    if (samples.length < 4) return true;

    const avgR = samples.reduce((s, p) => s + p[0], 0) / samples.length;
    const avgG = samples.reduce((s, p) => s + p[1], 0) / samples.length;
    const avgB = samples.reduce((s, p) => s + p[2], 0) / samples.length;
    const maxDev = samples.reduce((m, p) => Math.max(m, Math.abs(p[0] - avgR), Math.abs(p[1] - avgG), Math.abs(p[2] - avgB)), 0);
    return maxDev < 18;
}

async function cropPreview(buffer: Buffer, rect: any, isArrow: boolean): Promise<string | undefined> {
    try {
        const frameImage = await Jimp.read(buffer);
        const padCandidates = isArrow ? [10, 18, 26] : [4, 10, 18, 30];

        for (const pad of padCandidates) {
            const cropX = Math.max(0, Math.floor(rect.x - pad));
            const cropY = Math.max(0, Math.floor(rect.y - pad));
            let cropW = Math.min(VIEWPORT_W - cropX, Math.floor(rect.width + pad * 2));
            let cropH = Math.min(VIEWPORT_H - cropY, Math.floor(rect.height + pad * 2));
            if (cropX + cropW > VIEWPORT_W) cropW = VIEWPORT_W - cropX;
            if (cropY + cropH > VIEWPORT_H) cropH = VIEWPORT_H - cropY;
            if (cropW <= 5 || cropH <= 5) continue;

            const crop = frameImage.clone().crop({ x: cropX, y: cropY, w: cropW, h: cropH });
            if (isLikelyBlankCrop(crop)) continue;
            return await crop.getBase64("image/jpeg");
        }
    } catch (err) { console.error('Frame crop error:', err); }
    return undefined;
}


function rgbToHex(r: number, g: number, b: number): string {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * If a node is classified as IMAGE_STACKED, try to prove it's actually sitting on a solid overlay
 * (common for cookie banners / modals) by sampling the border area around the text rect.
 * Returns a solid bg color if the border is sufficiently uniform.
 */
async function inferSolidBgFromFrame(buffer: Buffer, rect: any): Promise<{ bgHex: string; uniformity: number } | null> {
    try {
        const img = await Jimp.read(buffer);

        const pad = 10;
        const x0 = Math.max(0, Math.floor(rect.x - pad));
        const y0 = Math.max(0, Math.floor(rect.y - pad));
        const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width + pad));
        const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height + pad));
        const w = Math.max(0, x1 - x0);
        const h = Math.max(0, y1 - y0);
        if (w < 16 || h < 16) return null;

        // Sample a border ring to avoid text pixels affecting the estimate.
        const ring = 3; // px thickness
        const samples: Array<{ r: number; g: number; b: number }> = [];

        const pushSample = (x: number, y: number) => {
            const c = img.getPixelColor(x, y);
            const rgba = intToRGBA(c);
            samples.push({ r: rgba.r, g: rgba.g, b: rgba.b });
        };

        const stepX = Math.max(1, Math.floor(w / 24));
        const stepY = Math.max(1, Math.floor(h / 24));

        for (let x = x0; x < x1; x += stepX) {
            for (let t = 0; t < ring; t++) {
                pushSample(x, y0 + t);
                pushSample(x, y1 - 1 - t);
            }
        }
        for (let y = y0; y < y1; y += stepY) {
            for (let t = 0; t < ring; t++) {
                pushSample(x0 + t, y);
                pushSample(x1 - 1 - t, y);
            }
        }

        if (samples.length < 30) return null;

        const avgR = samples.reduce((s, p) => s + p.r, 0) / samples.length;
        const avgG = samples.reduce((s, p) => s + p.g, 0) / samples.length;
        const avgB = samples.reduce((s, p) => s + p.b, 0) / samples.length;

        let maxDev = 0;
        for (const p of samples) {
            maxDev = Math.max(maxDev, Math.abs(p.r - avgR), Math.abs(p.g - avgG), Math.abs(p.b - avgB));
        }

        // Heuristic: if max deviation is small, it behaves like a solid overlay.
        // Return a "uniformity" score (lower is better).
        const uniformity = maxDev;
        if (uniformity <= 18) {
            const bgHex = rgbToHex(Math.round(avgR), Math.round(avgG), Math.round(avgB));
            return { bgHex, uniformity };
        }
    } catch {
        // ignore
    }
    return null;
}

function isLargeText(fontSize: string, fontWeight: string): boolean {
    const size = parseFloat(fontSize);
    return size >= 24 || (size >= 18.66 && parseInt(fontWeight) >= 700);
}

// ── Main WCAG contrast analysis ──
export async function processWCAG(
    textNodes: any[], captureData: CaptureData[], finalSectionBuffer: Buffer | null,
    nonTextOverlayElements?: any[]
): Promise<{
    contrastIssues: ContrastIssue[];
    fontGroups: Record<string, Record<string, boolean>>;
    textColorAgg: Record<string, { score: number; elements: Set<string> }>;
}> {
    const issuesMap = new Map<string, ContrastIssue>();
    const seenSemanticIssueKeys = new Set<string>();
    const fontGroups: Record<string, Record<string, boolean>> = {};
    const textColorAgg: Record<string, { score: number; elements: Set<string> }> = {};

    // ── Inject inline-svg-icon and hamburger-icon as IMAGE_STACKED contrast issues ──
    if (nonTextOverlayElements) {
        for (const el of nonTextOverlayElements) {
            if (el.type !== 'inline-svg-icon' && el.type !== 'hamburger-icon') continue;
            const isIcon = el.type === 'hamburger-icon';
            const note = isIcon ? 'Arrow/icon positioned over image.' : 'Text positioned over image/video.';
            let previewBase64: string | undefined;
            if (el.elementScreenshot) {
                try {
                    const img = await Jimp.read(el.elementScreenshot);
                    const origW = img.width;
                    const origH = img.height;
                    if (origW < 60 || origH < 60) {
                        const scale = Math.ceil(60 / Math.min(origW, origH));
                        img.resize({ w: origW * scale, h: origH * scale });
                    }
                    previewBase64 = await img.getBase64("image/png");
                } catch {}
            }
            const issue: ContrastIssue = {
                text: el.label || (isIcon ? '[Menu Icon]' : '[SVG Logo]'),
                textColor: el.estimatedColor || '#FFFFFF',
                effectiveBg: 'IMAGE_STACKED',
                contrastUsed: 'Image BG',
                AA: { required: '3.0:1', status: 'WARNING' },
                AAA: { required: '7.0:1', status: 'FAIL' },
                note, previewBase64
            };
            const key = `overlay_${el.type}_${Math.round(el.rect?.x || 0)}_${Math.round(el.rect?.y || 0)}`;
            issuesMap.set(key, issue);
        }
    }

    for (const node of textNodes) {
        if (node.fontFamily?.length > 2) {
            const baseName = node.fontFamily.trim();
            const weight = node.fontWeight || '400';
            if (!fontGroups[baseName]) fontGroups[baseName] = {};
            fontGroups[baseName][weight] = true;
        }
        if (node.textColor) {
            if (!textColorAgg[node.textColor]) textColorAgg[node.textColor] = { score: 0, elements: new Set() };
            textColorAgg[node.textColor].score += node.text.length;
            textColorAgg[node.textColor].elements.add(node.tagName);
        }
        if (!node.textColor) continue;

        const normalizedText = node.text.trim().toLowerCase().replace(/\s+/g, ' ');
        if (['icon', 'icomoon', 'awesome'].some(bad => node.fontFamily.toLowerCase().includes(bad))) continue;

        let statusAA: 'PASS' | 'FAIL' | 'WARNING' = 'PASS';
        let statusAAA: 'PASS' | 'FAIL' = 'PASS';
        let contrastDisplay = "";
        let previewBase64: string | undefined;
        let note = "";

        const isImage = ['IMAGE_STACKED', 'IMAGE_COMPLEX', 'IMAGE', 'IMAGE_CSS'].includes(node.effectiveBg);
        const isGalleryText = typeof node.text === 'string' && /gallery/i.test(node.text);
        // Deduplicate across frames/positions:
        // in horizontal apps the same text moves every loop, so x/y-based keys create duplicates.
        const textKey = isImage
            ? `img_${normalizedText}_${node.textColor || 'NA'}_${node.effectiveBg || 'IMAGE_STACKED'}`
            : `solid_${normalizedText}_${node.textColor || 'NA'}_${node.effectiveBg || '#FFFFFF'}`;

        if (isImage) {
            // Default classification: image/video background => AA warning / AAA fail.
            // But before we commit, try to prove it's actually a solid overlay (common for consent modals).
            const frame = selectFrame(node, captureData, finalSectionBuffer);
            if (isGalleryText) {
                console.log(`[WCAG-GALLERY] "${node.text}" bg=${node.effectiveBg} cap=${node.captureIndex} frame=${frame?.index ?? 'none'} final=${node.isInFinal} static=${node.isStaticBehindMain}`);
            }

            let inferredSolidBg: string | null = null;

            if (frame) {
                // 1) Try infer solid overlay bg from screenshot border samples.
                const inferred = await inferSolidBgFromFrame(frame.buffer, node.rect);
                if (inferred?.bgHex) {
                    inferredSolidBg = inferred.bgHex;
                }

                // 2) Always attempt preview crop for UI; if blank, we may skip the issue.
                previewBase64 = await cropPreview(frame.buffer, node.rect, !!(node.isIconOnly && node.hasArrow));
            }

            // If we inferred a solid bg, compute real contrast and treat it as non-image.
            if (inferredSolidBg) {
                try {
                    const contrast = WCAGContrast.hex(node.textColor, inferredSolidBg);
                    contrastDisplay = contrast.toFixed(2);
                    const large = isLargeText(node.fontSize, node.fontWeight);
                    const reqAA = large ? 3.0 : 4.5;
                    const reqAAA = large ? 4.5 : 7.0;

                    if (contrast < reqAA) { statusAA = 'FAIL'; statusAAA = 'FAIL'; note = "WCAG Violation"; }
                    else if (contrast < reqAAA) { statusAAA = 'FAIL'; note = "Passes AA, Fails AAA"; }
                    else { note = "Solid overlay detected (not image background)."; }

                    // Override effectiveBg to the inferred solid color.
                    node.effectiveBg = inferredSolidBg;
                } catch {
                    // fall back to image classification below
                    inferredSolidBg = null;
                }
            }

            if (!inferredSolidBg) {
                statusAA = 'WARNING';
                statusAAA = 'FAIL';
                contrastDisplay = 'Image BG';
                note = node.isIconOnly ? "Arrow/icon positioned over image." : "Text positioned over image/video.";
            }

            // If we cannot get a meaningful crop AND it's still classified as image-bg, skip entry to avoid blank cards.
            if (!previewBase64 && !inferredSolidBg) {
                continue;
            }
        } else {
            if (isGalleryText) {
                console.log(`[WCAG-GALLERY] "${node.text}" bg=${node.effectiveBg} cap=${node.captureIndex} NON-IMAGE`);
            }
            const bg = node.effectiveBg || '#FFFFFF';
            try {
                const contrast = WCAGContrast.hex(node.textColor, bg);
                contrastDisplay = contrast.toFixed(2);
                const large = isLargeText(node.fontSize, node.fontWeight);
                const reqAA = large ? 3.0 : 4.5;
                const reqAAA = large ? 4.5 : 7.0;
                if (contrast < reqAA) { statusAA = 'FAIL'; statusAAA = 'FAIL'; note = "WCAG Violation"; }
                else if (contrast < reqAAA) { statusAAA = 'FAIL'; note = "Passes AA, Fails AAA"; }
            } catch {}
        }

        if (statusAA !== 'PASS' || statusAAA !== 'PASS') {
            const large = isLargeText(node.fontSize, node.fontWeight);
            const issue: ContrastIssue = {
                text: node.text, textColor: node.textColor,
                effectiveBg: (['IMAGE_STACKED','IMAGE_COMPLEX','IMAGE','IMAGE_CSS'].includes(node.effectiveBg) ? 'IMAGE_STACKED' : node.effectiveBg),
                contrastUsed: contrastDisplay,
                AA: { required: large ? '3.0:1' : '4.5:1', status: statusAA },
                AAA: { required: large ? '4.5:1' : '7.0:1', status: statusAAA },
                note, previewBase64
            };

            const semanticText = normalizedText
                .replace(/[^a-z0-9\s]/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const semanticTextKey = semanticText.length > 90 ? semanticText.substring(0, 90) : semanticText;
            const semanticIssueKey = `${semanticTextKey}_${issue.textColor}_${issue.effectiveBg}_${issue.AA.status}_${issue.AAA.status}`;
            if (seenSemanticIssueKeys.has(semanticIssueKey)) continue;

            if (!issuesMap.has(textKey)) {
                issuesMap.set(textKey, issue);
                seenSemanticIssueKeys.add(semanticIssueKey);
            } else {
                const existing = issuesMap.get(textKey);
                if (existing && existing.effectiveBg !== 'IMAGE_STACKED' && isImage) {
                    issuesMap.set(textKey, issue);
                    seenSemanticIssueKeys.add(semanticIssueKey);
                }
            }
        }
    }

    return { contrastIssues: Array.from(issuesMap.values()), fontGroups, textColorAgg };
}

// ── Non-text contrast analysis (WCAG 1.4.11) ──
export async function processNonTextElements(
    elements: any[], captureData: CaptureData[], finalSectionBuffer?: Buffer | null
): Promise<NonTextElement[]> {
    const results: NonTextElement[] = [];
    const seenKeys = new Set<string>();
    
    // Filter out inline-svg-icon and hamburger-icon — these are handled as contrast issues in processWCAG
    elements = elements.filter(el => el.type !== 'inline-svg-icon' && el.type !== 'hamburger-icon');
    
    let finalImg: Awaited<ReturnType<typeof Jimp.read>> | null = null;
    let finalW = 0, finalH = 0;
    if (finalSectionBuffer) {
        try {
            finalImg = await Jimp.read(finalSectionBuffer);
            finalW = finalImg.width;
            finalH = finalImg.height;
            console.log(`[NonText] Final section image: ${finalW}x${finalH}`);
        } catch { finalImg = null; }
    }

    for (const el of elements) {
        const dedupeKey = `${el.src}_${Math.round(el.rect.x / 10)}_${Math.round(el.rect.y / 10)}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        let previewBase64: string | undefined;

        if (el.elementScreenshot) {
            try {
                const img = await Jimp.read(el.elementScreenshot);
                const origW = img.width;
                const origH = img.height;
                if (origW < 60 || origH < 60) {
                    const scale = Math.ceil(60 / Math.min(origW, origH));
                    img.resize({ w: origW * scale, h: origH * scale });
                }
                previewBase64 = await img.getBase64("image/png");
                console.log(`[NonText-Crop] ${el.label}: USED ELEMENT SCREENSHOT ${origW}x${origH}`);
                try {
                    const fs = await import('fs');
                    const debugDir = './debug_screens/nontext_crops';
                    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
                    const safeName = el.label.replace(/[^a-zA-Z0-9-]/g, '_');
                    const buf = await img.getBuffer("image/png");
                    fs.writeFileSync(`${debugDir}/${safeName}_ELEM.png`, buf);
                } catch {}
            } catch (err) {
                console.error(`[NonText-Crop] ${el.label}: Element screenshot processing failed:`, err);
            }
        }

        if (!previewBase64) {
        const frame = captureData.find(c => c.index === el.captureIndex);
        if (frame) {
            try {
                const img = await Jimp.read(frame.buffer);
                const imgW = img.width;
                const imgH = img.height;
                const scaleX = imgW / VIEWPORT_W;
                const scaleY = imgH / VIEWPORT_H;
                const elW = el.rect.width;
                const elH = el.rect.height;
                const pad = elW <= 50 ? 8 : elW <= 120 ? 10 : 12;
                const sx = el.rect.x * scaleX;
                const sy = el.rect.y * scaleY;
                const sPad = pad * scaleX;
                let cropX = Math.max(0, Math.floor(sx - sPad));
                let cropY = Math.max(0, Math.floor(sy - sPad));
                let cropW = Math.floor(elW * scaleX + sPad * 2);
                let cropH = Math.floor(elH * scaleY + sPad * 2);
                if (cropX + cropW > imgW) cropW = imgW - cropX;
                if (cropY + cropH > imgH) cropH = imgH - cropY;
                cropW = Math.max(20, cropW);
                cropH = Math.max(20, cropH);

                const frameCrop = img.clone().crop({ x: cropX, y: cropY, w: cropW, h: cropH });
                let isBlank = false;
                try {
                    const samplePixels: number[][] = [];
                    const stepX = Math.max(1, Math.floor(cropW / 5));
                    const stepY = Math.max(1, Math.floor(cropH / 5));
                    for (let px = 0; px < cropW && px < frameCrop.width; px += stepX) {
                        for (let py = 0; py < cropH && py < frameCrop.height; py += stepY) {
                            const c = frameCrop.getPixelColor(px, py);
                            const r = (c >> 24) & 0xFF, g = (c >> 16) & 0xFF, b = (c >> 8) & 0xFF;
                            samplePixels.push([r, g, b]);
                        }
                    }
                    if (samplePixels.length > 2) {
                        const avgR = samplePixels.reduce((s, p) => s + p[0], 0) / samplePixels.length;
                        const avgG = samplePixels.reduce((s, p) => s + p[1], 0) / samplePixels.length;
                        const avgB = samplePixels.reduce((s, p) => s + p[2], 0) / samplePixels.length;
                        const maxDev = samplePixels.reduce((m, p) => Math.max(m, Math.abs(p[0]-avgR), Math.abs(p[1]-avgG), Math.abs(p[2]-avgB)), 0);
                        isBlank = maxDev < 15;
                    }
                } catch {}

                console.log(`[NonText-Crop] ${el.label}: el=${Math.round(elW)}x${Math.round(elH)} → crop=(${cropX},${cropY},${cropW}x${cropH}) frame=${el.captureIndex} blank=${isBlank}`);

                if (isBlank && finalImg) {
                    try {
                        const fScaleX = finalW / VIEWPORT_W;
                        const fScaleY = finalH / VIEWPORT_H;
                        let fcX = Math.max(0, Math.floor(el.rect.x * fScaleX - pad * fScaleX));
                        let fcY = Math.max(0, Math.floor(el.rect.y * fScaleY - pad * fScaleY));
                        let fcW = Math.floor(elW * fScaleX + pad * fScaleX * 2);
                        let fcH = Math.floor(elH * fScaleY + pad * fScaleY * 2);
                        if (fcX + fcW > finalW) fcW = finalW - fcX;
                        if (fcY + fcH > finalH) fcH = finalH - fcY;
                        fcW = Math.max(10, fcW); fcH = Math.max(10, fcH);
                        if (fcX >= 0 && fcY >= 0 && fcX + fcW <= finalW && fcY + fcH <= finalH) {
                            const finalCrop = finalImg.clone().crop({ x: fcX, y: fcY, w: fcW, h: fcH });
                            previewBase64 = await finalCrop.getBase64("image/png");
                            console.log(`[NonText-Crop] ${el.label}: USED FINAL SECTION crop=(${fcX},${fcY},${fcW}x${fcH})`);
                        }
                    } catch (err) { console.error(`[NonText-Crop] ${el.label}: Final section crop failed:`, err); }
                }
                if (!previewBase64 && cropW > 5 && cropH > 5) {
                    previewBase64 = await frameCrop.getBase64("image/png");
                }
            } catch (err) { console.error('[NonText] Screenshot crop error:', err); }
        } else {
            console.log(`[NonText-Crop] ${el.label}: NO FRAME for captureIndex=${el.captureIndex}`);
        }
        }

        let contrastRatio: string | undefined;
        let status: 'PASS' | 'FAIL' | 'WARNING' = 'WARNING';
        let enhancedStatus: 'PASS' | 'FAIL' | undefined;
        let note = '';
        const fgColor = el.estimatedColor;
        const bgColor = el.bgColor;
        const isImageBg = ['IMAGE_STACKED', 'IMAGE_COMPLEX', 'IMAGE', 'IMAGE_CSS'].includes(bgColor);

        if (fgColor && bgColor && !isImageBg) {
            try {
                const ratio = WCAGContrast.hex(fgColor, bgColor);
                contrastRatio = ratio.toFixed(2);
                status = ratio >= 3.0 ? 'PASS' : 'FAIL';
                note = ratio >= 3.0 ? 'Meets WCAG 1.4.11 (3:1)' : `WCAG 1.4.11 violation: ${ratio.toFixed(2)}:1 < 3.0:1`;
                enhancedStatus = ratio >= 4.5 ? 'PASS' : 'FAIL';
            } catch { status = 'WARNING'; note = 'Could not compute contrast'; }
        } else if (isImageBg) {
            note = 'Element over image background — manual review needed';
        } else if (!fgColor && el.cssFilter) {
            note = 'Has CSS filter but color could not be computed';
        } else if (!fgColor) {
            note = el.type === 'partner-logo' ? 'Raster image — contrast depends on image content' : 'Icon color could not be determined';
        }

        let stickyPreviewBase64: string | undefined;
        let stickyContrastRatio: string | undefined;
        let stickyWcag1411: { required: '3.0:1'; status: 'PASS' | 'FAIL' | 'WARNING' } | undefined;
        let stickyEnhanced: { required: '4.5:1'; status: 'PASS' | 'FAIL' } | undefined;
        
        if (el.stickyScreenshot) {
            try { stickyPreviewBase64 = await (await Jimp.read(el.stickyScreenshot)).getBase64("image/png"); } catch {}
        }
        if (fgColor && el.stickyBgColor) {
            try {
                const stickyRatio = WCAGContrast.hex(fgColor, el.stickyBgColor);
                stickyContrastRatio = stickyRatio.toFixed(2);
                stickyWcag1411 = { required: '3.0:1', status: stickyRatio >= 3.0 ? 'PASS' : 'FAIL' };
                stickyEnhanced = { required: '4.5:1', status: stickyRatio >= 4.5 ? 'PASS' : 'FAIL' };
                console.log(`[NonText-Sticky-WCAG] ${el.label}: fg=${fgColor} stickyBg=${el.stickyBgColor} ratio=${stickyRatio.toFixed(2)} => 3:1=${stickyWcag1411.status} 4.5:1=${stickyEnhanced.status}`);
            } catch (e: any) { console.log(`[NonText-Sticky-WCAG] ${el.label}: ERROR: ${e?.message}`); }
        } else {
            console.log(`[NonText-Sticky-WCAG] ${el.label}: SKIPPED — fgColor=${fgColor || 'null'} stickyBgColor=${el.stickyBgColor || 'null'}`);
        }

        results.push({
            type: el.type, label: el.label, tagName: el.tagName, src: el.src, alt: el.alt,
            cssFilter: el.cssFilter || undefined, estimatedColor: fgColor || undefined,
            bgColor: bgColor || 'unknown', contrastRatio,
            wcag1411: { required: '3.0:1', status },
            enhanced: enhancedStatus ? { required: '4.5:1', status: enhancedStatus } : undefined,
            rect: el.rect, href: el.href || undefined, previewBase64,
            stickyPreviewBase64, stickyBgColor: el.stickyBgColor || undefined,
            normalBgColor: el.normalBgColor || undefined, stickyContrastRatio,
            stickyWcag1411, stickyEnhanced, note
        });
    }

    console.log(`[NonText] Found ${results.length} non-text elements: ${results.map(r => `${r.type}(${r.label})`).join(', ')}`);
    return results;
}
