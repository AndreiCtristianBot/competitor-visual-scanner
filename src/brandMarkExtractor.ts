// brandMarkExtractor.ts
import type { Page } from 'puppeteer';
import type { SiteStrategy } from './types.js';

type ViewportSize = { width: number; height: number };
type RunSafe = <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T | null>;
type BrandMark = { src: string; base64: string; width: number; height: number };

export async function captureSiteBrandMark(
    page: Page,
    strategy: SiteStrategy,
    runSafe: RunSafe,
    viewport: ViewportSize
): Promise<BrandMark | null> {
    let siteLogo: BrandMark | null = null;

    try {
        if (strategy !== 'HORIZONTAL_APP') {
            await runSafe(() => window.scrollTo(0, 0));
            await new Promise(r => setTimeout(r, 500));
        }

        const logoInfo = await page.evaluate(() => {
            // Phase 1: <img> selectors — exclude partner logo lists
            const imgSelectors = [
                'header .logo img', 'header .brand img', '#logo img',
                '#bar .logo img', '#bar a.logo img',
                '.logo:not(.logos) img', 'a.logo img',
                'header a:first-child img', 'nav .logo img',
                'header img[alt*="logo" i]',
                'header img:first-of-type', '.navbar-brand img'
            ];
            for (const sel of imgSelectors) {
                const el = document.querySelector(sel) as HTMLImageElement | null;
                if (!el) continue;
                if (el.closest('.logos, .partners, .footer-logos, footer ul')) continue;
                const cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
                const rect = el.getBoundingClientRect();
                if (rect.width > 10 && rect.height > 10) {
                    return { type: 'img' as const, src: el.src || '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }
            }

            // Phase 2: <svg> selectors — force header visible for intro-hidden sites (Belnord)
            const headerEl = document.querySelector('header') as HTMLElement;
            if (headerEl) {
                const hcs = window.getComputedStyle(headerEl);
                if (hcs.opacity === '0' || hcs.display === 'none' || hcs.visibility === 'hidden') {
                    headerEl.style.setProperty('opacity', '1', 'important');
                    headerEl.style.setProperty('display', 'block', 'important');
                    headerEl.style.setProperty('visibility', 'visible', 'important');
                }
            }

            const svgSelectors = [
                'header .logo a svg', 'header .logo svg', '.logo a svg',
                '#logo svg', 'header svg:first-of-type', 'nav .logo svg',
                '.navbar-brand svg', 'a.logo svg',
                '.logo:not(footer .logo) svg'
            ];
            for (const sel of svgSelectors) {
                const el = document.querySelector(sel) as SVGElement | null;
                if (!el) continue;
                if (el.closest('.logos, .partners, footer ul')) continue;
                const elHtml = el.closest('.logo, header') as HTMLElement;
                if (elHtml) {
                    elHtml.style.setProperty('opacity', '1', 'important');
                    elHtml.style.setProperty('visibility', 'visible', 'important');
                }
                const rect = el.getBoundingClientRect();
                if (rect.width > 10 && rect.height > 10) {
                    const svgStr = new XMLSerializer().serializeToString(el);
                    const src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
                    // Detect dominant fill color from SVG to choose appropriate background
                    let svgFill = '';
                    const gFill = el.querySelector('g[fill]');
                    if (gFill) svgFill = gFill.getAttribute('fill') || '';
                    if (!svgFill) {
                        const paths = el.querySelectorAll('path[fill]');
                        if (paths.length > 0) svgFill = (paths[0] as Element).getAttribute('fill') || '';
                    }
                    if (!svgFill) svgFill = el.getAttribute('fill') || '';
                    return { type: 'svg' as const, src, x: rect.x, y: rect.y, width: rect.width, height: rect.height, svgFill };
                }
            }

            // Phase 3: CSS bg-image OR text-replacement logos
            // NOTE: Does NOT skip visibility:hidden — Palace a.logo uses it for text replacement
            const bgSelectors = [
                '#bar a.logo', 'header a.logo', 'a.logo', '.logo a', '#logo a',
                'header .logo', '#bar .logo'
            ];
            for (const sel of bgSelectors) {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (!el) continue;
                if (el.closest('.logos, .partners, footer')) continue;
                const cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.opacity === '0') continue;
                const rect = el.getBoundingClientRect();
                if (rect.width < 10 || rect.height < 10) continue;
                if (el.querySelector('img, svg')) continue;

                const hasBgImg = cs.backgroundImage && cs.backgroundImage !== 'none' && cs.backgroundImage.includes('url');
                if (hasBgImg) {
                    const bgMatch = cs.backgroundImage.match(/url\(['"]?([^'")]+)['"]?\)/);
                    const bgUrl = bgMatch ? bgMatch[1] : '';
                    // Also capture CSS filter (Palace applies color filters to SVG logo)
                    const cssFilter = cs.filter && cs.filter !== 'none' ? cs.filter : '';
                    return { type: 'css-bg' as const, src: bgUrl, x: rect.x, y: rect.y, width: rect.width, height: rect.height, cssFilter };
                }
                // Text-replacement logo (Palace: a.logo with visibility:hidden text "GPA")
                if (rect.width < 400 && rect.height < 300) {
                    return { type: 'text-logo' as const, src: '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }
            }

            return null;
        });

        // Debug logging when no logo found
        if (!logoInfo) {
            const dbg = await page.evaluate(() => {
                const bgSelectors = [
                    '#bar a.logo', 'header a.logo', 'a.logo', '.logo a', '#logo a',
                    'header .logo', '#bar .logo'
                ];
                const info: string[] = [];
                for (const sel of bgSelectors) {
                    const el = document.querySelector(sel) as HTMLElement | null;
                    if (!el) { info.push(`${sel}:MISS`); continue; }
                    const cs = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    const inFooter = !!el.closest('.logos, .partners, footer');
                    const hasChild = !!el.querySelector('img, svg');
                    info.push(`${sel}:${el.tagName} ${Math.round(rect.width)}x${Math.round(rect.height)} d=${cs.display} v=${cs.visibility} o=${cs.opacity} footer=${inFooter} child=${hasChild}`);
                }
                return info.join(' | ');
            });
            console.log(`[Logo-Debug-Phase3] ${dbg}`);
        }

        if (logoInfo) {
            const lr = logoInfo;
            const isOnScreen = lr.x >= 0 && lr.y >= 0 && lr.x < viewport.width && lr.y < viewport.height;

            if (logoInfo.type === 'svg' && logoInfo.src) {
                // SVG logo (Belnord): always render in temp container for consistent output
                // regardless of page state (cookies, animations, header transparency).
                // Choose background based on SVG fill color — white logos need dark bg
                const svgFill = ((logoInfo as any).svgFill || '').toLowerCase().trim();
                const isLightFill = svgFill === '#fff' || svgFill === '#ffffff' || svgFill === 'white'
                    || svgFill === '#fefefe' || svgFill === '#fdfdfd';
                const logoBgColor = isLightFill ? '#333' : '#fff';
                
                await page.evaluate((svgSrc: string, w: number, h: number, bg: string) => {
                    const old = document.getElementById('__logo_temp');
                    if (old) old.remove();
                    const c = document.createElement('div');
                    c.id = '__logo_temp';
                    c.style.cssText = `position:fixed;top:0;left:0;z-index:999999;width:${w + 12}px;height:${h + 12}px;background:${bg};display:flex;align-items:center;justify-content:center;`;
                    const img = document.createElement('img');
                    img.src = svgSrc;
                    img.style.cssText = `width:${w}px;height:${h}px;`;
                    c.appendChild(img);
                    document.body.appendChild(c);
                }, logoInfo.src, lr.width, lr.height, logoBgColor);
                await new Promise(r => setTimeout(r, 300));
                const clip = { x: 0, y: 0, width: Math.round(lr.width + 12), height: Math.round(lr.height + 12) };
                const logoBuf = await page.screenshot({ type: 'png', clip }) as Buffer;
                await page.evaluate(() => { const el = document.getElementById('__logo_temp'); if (el) el.remove(); });
                siteLogo = {
                    src: logoInfo.src.substring(0, 300),
                    base64: `data:image/png;base64,${logoBuf.toString('base64')}`,
                    width: Math.round(lr.width),
                    height: Math.round(lr.height)
                };
                if (siteLogo) console.log(`[Logo] Found SVG: ${siteLogo.width}x${siteLogo.height} fill=${svgFill || 'none'} bg=${logoBgColor}`);

            } else if (logoInfo.type === 'css-bg' && logoInfo.src) {
                // CSS background-image logo (Palace): render bg URL as <img> in temp container
                // The element itself may have visibility:hidden, so direct screenshot won't work.
                // Also apply any CSS filter the element has (Palace uses invert/sepia/hue-rotate).
                const cssFilter = (logoInfo as any).cssFilter || '';
                const renderW = Math.max(Math.round(lr.width * 2), 120);  // Render at 2x for quality
                const renderH = Math.max(Math.round(lr.height * 2), 80);
                
                await page.evaluate((bgUrl: string, w: number, h: number, filter: string) => {
                    const old = document.getElementById('__logo_temp');
                    if (old) old.remove();
                    const c = document.createElement('div');
                    c.id = '__logo_temp';
                    c.style.cssText = `position:fixed;top:0;left:0;z-index:999999;width:${w + 12}px;height:${h + 12}px;background:#fff;display:flex;align-items:center;justify-content:center;padding:6px;`;
                    const img = document.createElement('img');
                    img.src = bgUrl;
                    img.style.cssText = `max-width:${w}px;max-height:${h}px;object-fit:contain;${filter ? `filter:${filter};` : ''}`;
                    c.appendChild(img);
                    document.body.appendChild(c);
                }, logoInfo.src, renderW, renderH, cssFilter);
                
                await new Promise(r => setTimeout(r, 500));
                
                // Get actual rendered size
                const tempRect = await page.evaluate(() => {
                    const c = document.getElementById('__logo_temp');
                    if (!c) return null;
                    const img = c.querySelector('img');
                    if (!img) return null;
                    // Wait for image load
                    const cRect = c.getBoundingClientRect();
                    return { width: Math.round(cRect.width), height: Math.round(cRect.height) };
                });
                
                if (tempRect && tempRect.width > 10 && tempRect.height > 10) {
                    const clip = { x: 0, y: 0, width: tempRect.width, height: tempRect.height };
                    const logoBuf = await page.screenshot({ type: 'png', clip }) as Buffer;
                    await page.evaluate(() => { const el = document.getElementById('__logo_temp'); if (el) el.remove(); });
                    siteLogo = {
                        src: logoInfo.src.substring(0, 300),
                        base64: `data:image/png;base64,${logoBuf.toString('base64')}`,
                        width: tempRect.width - 12,
                        height: tempRect.height - 12
                    };
                    console.log(`[Logo] Found css-bg logo: ${siteLogo.width}x${siteLogo.height} src=${logoInfo.src.substring(0, 60)}`);
                } else {
                    await page.evaluate(() => { const el = document.getElementById('__logo_temp'); if (el) el.remove(); }).catch(() => {});
                    console.log('[Logo] css-bg logo could not be rendered');
                }

            } else if (logoInfo.type === 'img' && isOnScreen && lr.width > 10 && lr.height > 10) {
                // On-screen <img> logo: direct viewport screenshot
                const pad = 6;
                const clip = {
                    x: Math.max(0, lr.x - pad),
                    y: Math.max(0, lr.y - pad),
                    width: Math.min(viewport.width - Math.max(0, lr.x - pad), lr.width + pad * 2),
                    height: Math.min(viewport.height - Math.max(0, lr.y - pad), lr.height + pad * 2)
                };
                if (clip.width > 0 && clip.height > 0) {
                    const logoBuf = await page.screenshot({ type: 'png', clip }) as Buffer;
                    siteLogo = {
                        src: logoInfo.src.substring(0, 300),
                        base64: `data:image/png;base64,${logoBuf.toString('base64')}`,
                        width: Math.round(lr.width),
                        height: Math.round(lr.height)
                    };
                    console.log(`[Logo] Found (${logoInfo.type}): ${siteLogo.width}x${siteLogo.height} at (${Math.round(lr.x)},${Math.round(lr.y)})`);
                }

            } else if (logoInfo.type === 'text-logo') {
                // Text-replacement logo (Palace: a.logo with text styled as logo)
                // Clone element into fixed container with visibility:visible
                const captured = await page.evaluate(() => {
                    const old = document.getElementById('__logo_temp');
                    if (old) old.remove();

                    const selectors = ['#bar a.logo', 'header a.logo', 'a.logo', '.logo a'];
                    let el: HTMLElement | null = null;
                    for (const s of selectors) {
                        el = document.querySelector(s);
                        if (el && !el.querySelector('img, svg') && !el.closest('.logos, footer')) break;
                        el = null;
                    }
                    if (!el) return null;

                    const clone = el.cloneNode(true) as HTMLElement;
                    const cs = window.getComputedStyle(el);
                    const c = document.createElement('div');
                    c.id = '__logo_temp';
                    c.style.cssText = 'position:fixed;top:0;left:0;z-index:999999;padding:6px;background:#fff;';
                    // Force visibility:visible on clone
                    clone.style.cssText = `
                        display:${cs.display};width:${cs.width};height:${cs.height};
                        visibility:visible !important;
                        background-image:${cs.backgroundImage};background-size:${cs.backgroundSize};
                        background-repeat:${cs.backgroundRepeat};background-position:${cs.backgroundPosition};
                        font-family:${cs.fontFamily};font-size:${cs.fontSize};
                        color:${cs.color};text-indent:${cs.textIndent};
                        overflow:${cs.overflow};line-height:${cs.lineHeight};
                    `;
                    c.appendChild(clone);
                    document.body.appendChild(c);
                    const rect = c.getBoundingClientRect();
                    return { width: Math.round(rect.width), height: Math.round(rect.height) };
                });

                if (captured && captured.width > 10 && captured.height > 10) {
                    await new Promise(r => setTimeout(r, 300));
                    const clip = { x: 0, y: 0, width: captured.width, height: captured.height };
                    const logoBuf = await page.screenshot({ type: 'png', clip }) as Buffer;
                    await page.evaluate(() => { const el = document.getElementById('__logo_temp'); if (el) el.remove(); });
                    siteLogo = {
                        src: logoInfo.src.substring(0, 300),
                        base64: `data:image/png;base64,${logoBuf.toString('base64')}`,
                        width: captured.width - 12,
                        height: captured.height - 12
                    };
                    console.log(`[Logo] Found text-logo: ${siteLogo.width}x${siteLogo.height}`);
                } else {
                    await page.evaluate(() => { const el = document.getElementById('__logo_temp'); if (el) el.remove(); }).catch(() => {});
                    console.log('[Logo] Text-logo could not be rendered');
                }

            } else {
                console.log(`[Logo] Element found but off-screen: (${Math.round(lr.x)},${Math.round(lr.y)}) ${Math.round(lr.width)}x${Math.round(lr.height)} type=${logoInfo.type}`);
            }
        } else {
            console.log('[Logo] No logo element found');
        }
    } catch (e: any) {
        console.log(`[Logo] Extraction failed: ${e?.message?.substring(0, 80)}`);
    }

    return siteLogo;
}
