// contentImageExtractor.ts
import type { Page } from 'puppeteer';

type ContentImage = { src: string; alt: string; base64: string; width: number; height: number };

export async function collectTopContentImages(page: Page, limit = 10): Promise<ContentImage[]> {
    let topImages: ContentImage[] = [];

    try {
        // Hide cookie/consent overlays only for the "top images" screenshots.
        // Analysis has already finished, so this does not affect contrast scanning.
        await page.evaluate(() => {
            const markHidden = (el: Element) => {
                const h = el as HTMLElement;
                if (h.dataset.codexCookieHidden === '1') return;
                h.dataset.codexCookieHidden = '1';
                h.dataset.codexPrevDisplay = h.style.display || '';
                h.dataset.codexPrevVisibility = h.style.visibility || '';
                h.dataset.codexPrevOpacity = h.style.opacity || '';
                h.style.setProperty('display', 'none', 'important');
                h.style.setProperty('visibility', 'hidden', 'important');
                h.style.setProperty('opacity', '0', 'important');
            };

            const candidateSelectors = [
                '[id*="cookie" i]', '[class*="cookie" i]',
                '[id*="consent" i]', '[class*="consent" i]',
                '[id*="onetrust" i]', '[class*="onetrust" i]',
                '[id*="usercentrics" i]', '[class*="usercentrics" i]',
                '[id*="cookiebot" i]', '[class*="cookiebot" i]',
                'iframe[src*="consent" i]', 'iframe[src*="cookie" i]'
            ];
            for (const sel of candidateSelectors) {
                document.querySelectorAll(sel).forEach(markHidden);
            }
        });

        const imgInfos = await page.evaluate((maxItems: number) => {
            const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
            const seen = new Set<string>();
            return imgs
                .map(img => {
                    const cs = window.getComputedStyle(img);
                    if (cs.display === 'none' || cs.visibility === 'hidden') return null;

                    const nw = img.naturalWidth || 0;
                    const nh = img.naturalHeight || 0;
                    if (nw < 50 || nh < 50) return null;

                    const resolvedSrc = (img.currentSrc || img.src || '').trim();
                    if (!resolvedSrc) return null;
                    const fullSrc = resolvedSrc.toLowerCase();
                    if (
                        fullSrc.includes('icon') ||
                        fullSrc.includes('logo') ||
                        fullSrc.includes('pixel') ||
                        fullSrc.includes('tracking') ||
                        fullSrc.includes('1x1') ||
                        fullSrc.includes('spacer') ||
                        fullSrc.includes('favicon') ||
                        fullSrc.includes('facebook.') ||
                        fullSrc.includes('tr?') ||
                        fullSrc.includes('.svg')
                    ) return null;

                    if (img.closest('[pnl], #booking, #menu, #mobile, .pnl')) return null;
                    if (img.closest('.swiper-slide-duplicate')) return null;

                    if (seen.has(resolvedSrc)) return null;
                    seen.add(resolvedSrc);

                    return {
                        src: resolvedSrc,
                        alt: img.alt || '',
                        naturalWidth: nw,
                        naturalHeight: nh,
                        area: nw * nh
                    };
                })
                .filter(Boolean)
                .sort((a: any, b: any) => b.area - a.area)
                .slice(0, maxItems) as any[];
        }, limit);

        console.log(`[Images] Found ${imgInfos.length} candidate images`);

        for (const info of imgInfos) {
            try {
                const rendered = await page.evaluate((imgSrc: string, naturalWidth: number, naturalHeight: number) => {
                    try {
                        const old = document.getElementById('__img_temp');
                        if (old) old.remove();

                        const nw = naturalWidth || 800;
                        const nh = naturalHeight || 600;
                        const vw = window.innerWidth;
                        const vh = window.innerHeight;
                        const scale = Math.min(vw / nw, vh / nh, 1);
                        const rw = Math.round(nw * scale);
                        const rh = Math.round(nh * scale);

                        const container = document.createElement('div');
                        container.id = '__img_temp';
                        container.style.cssText = `
                            position: fixed; top: 0; left: 0; z-index: 999999;
                            width: ${rw}px; height: ${rh}px;
                            background: #fff;
                        `;
                        const img = document.createElement('img');
                        img.src = imgSrc;
                        img.style.cssText = `
                            width: ${rw}px; height: ${rh}px; object-fit: contain;
                            display: block; opacity: 1; visibility: visible;
                        `;
                        container.appendChild(img);
                        document.body.appendChild(container);
                        return { width: rw, height: rh };
                    } catch {
                        return null;
                    }
                }, info.src, info.naturalWidth, info.naturalHeight);

                if (!rendered) continue;
                await new Promise(r => setTimeout(r, 300));

                const loaded = await page.evaluate(() => {
                    const c = document.getElementById('__img_temp');
                    const img = c?.querySelector('img');
                    if (img && (!img.complete || img.naturalWidth === 0)) {
                        const s = img.src;
                        img.src = '';
                        img.src = s;
                    }
                    const loadedImg = c?.querySelector('img');
                    return !!(loadedImg && loadedImg.complete && loadedImg.naturalWidth > 0 && loadedImg.naturalHeight > 0);
                });
                await new Promise(r => setTimeout(r, 200));
                if (!loaded) continue;

                const clip = { x: 0, y: 0, width: rendered.width, height: rendered.height };
                const buf = await page.screenshot({ type: 'png', clip }) as Buffer;

                topImages.push({
                    src: info.src.substring(0, 300),
                    alt: info.alt,
                    base64: `data:image/png;base64,${buf.toString('base64')}`,
                    width: rendered.width,
                    height: rendered.height
                });
                console.log(`[Images] Captured: ${info.alt || info.src.split('/').pop()?.substring(0, 50)} (${rendered.width}x${rendered.height})`);
            } catch {
            } finally {
                await page.evaluate(() => {
                    const el = document.getElementById('__img_temp');
                    if (el) el.remove();
                }).catch(() => {});
            }
        }
        console.log(`[Images] Captured ${topImages.length} top images total`);
    } catch (e: any) {
        console.log(`[Images] Extraction failed: ${e?.message?.substring(0, 80)}`);
    } finally {
        await page.evaluate(() => {
            document.querySelectorAll('[data-codex-cookie-hidden="1"]').forEach(el => {
                const h = el as HTMLElement;
                h.style.display = h.dataset.codexPrevDisplay || '';
                h.style.visibility = h.dataset.codexPrevVisibility || '';
                h.style.opacity = h.dataset.codexPrevOpacity || '';
                delete h.dataset.codexCookieHidden;
                delete h.dataset.codexPrevDisplay;
                delete h.dataset.codexPrevVisibility;
                delete h.dataset.codexPrevOpacity;
            });
        }).catch(() => {});
    }

    return topImages;
}
