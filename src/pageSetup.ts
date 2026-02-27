// pageSetup.ts
import type { Page } from 'puppeteer';
import type { SiteStrategy } from './types.js';

// ── Dismiss "Enter site" / cookie / consent overlays ──
export async function dismissOverlays(page: Page, keepCookies?: boolean): Promise<void> {
    await page.evaluate(async (keepCookies) => {
        const keywords = ["ENTER", "SKIP", "EXPLORE", "CLOSE", "Enter", "Skip", "ACCEPT", "Accept", "AGREE", "Agree"];
        const elements = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
        for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).opacity !== '0') {
                const text = (el.textContent || '').trim();
                const isCookie = text.toLowerCase().includes('cookie') || text.toLowerCase().includes('accept') || text.toLowerCase().includes('consent');
                if (keepCookies && isCookie) continue;
                const shouldClickCookie = !keepCookies && isCookie;
                if (shouldClickCookie || (keywords.some(k => text.includes(k)) && text.length < 30)) {
                    (el as HTMLElement).click();
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }
    }, keepCookies);
}

// ── Remove/hide fixed overlays, scrollbars, sticky elements ──
const NUKE_STYLES = `
    ::-webkit-scrollbar { display: none !important; } 
    body, html { -ms-overflow-style: none !important; scrollbar-width: none !important; scroll-behavior: auto !important; }
    * { scroll-snap-align: none !important; transition: none !important; }
    /* Desktop analysis: hide mobile-only fixed bars that can occlude crops */
    @media (min-width: 1024px) {
        #mobile, [id="mobile"], [class*="mobile-bar"], [class*="mobile-nav"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
    }
`;

export async function performCleanup(page: Page, isInitial: boolean, keepCookies?: boolean): Promise<void> {
    if (keepCookies) {
        await page.evaluate((css) => {
            const style = document.createElement('style'); style.innerHTML = css; document.head.appendChild(style);
            document.querySelectorAll('#popup, .popup, [class*="newsletter"], [id*="newsletter"]').forEach(el => el.remove());
            document.querySelectorAll('#mobile, [id="mobile"], [class*="mobile-bar"], [class*="mobile-nav"]').forEach(el => el.remove());
        }, NUKE_STYLES);
        return;
    }

    await page.evaluate((initial, css) => {
        document.querySelectorAll('#mobile, [id="mobile"], [class*="mobile-bar"], [class*="mobile-nav"]').forEach(el => el.remove());

        const selectors = ['#onetrust-accept-btn-handler', '.cc-btn', '[class*="cookie"]', '#usercentrics-root', '[id*="popup"]', '[class*="consent"]'];
        selectors.forEach(s => document.querySelectorAll(s).forEach(e => { (e as HTMLElement).click(); e.remove(); }));

        const consentSelectors = [
            '[id*="cookie" i]', '[class*="cookie" i]',
            '[id*="consent" i]', '[class*="consent" i]',
            '[id*="onetrust" i]', '[class*="onetrust" i]',
            '[id*="usercentrics" i]', '[class*="usercentrics" i]',
            '[id*="privacy" i]', '[class*="privacy" i]',
            '[aria-label*="cookie" i]', '[aria-label*="consent" i]'
        ];
        consentSelectors.forEach(s => document.querySelectorAll(s).forEach(e => (e as HTMLElement).remove()));

        document.querySelectorAll('div, section, aside, footer').forEach(el => {
            const style = window.getComputedStyle(el);
            if (!['fixed', 'sticky'].includes(style.position)) return;
            const rect = el.getBoundingClientRect();
            const nearBottom = rect.bottom >= window.innerHeight && rect.top > window.innerHeight - 360;
            if (!nearBottom) return;
            const text = ((el.textContent || '') + ' ' + ((el as HTMLElement).id || '') + ' ' + ((el as HTMLElement).className || '')).toLowerCase();
            if (/cookie|consent|privacy|gdpr|onetrust|usercentrics|tracking/.test(text)) {
                el.remove();
            }
        });

        document.querySelectorAll('div, section, footer, aside, header, nav').forEach(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            if (['fixed', 'sticky'].includes(style.position)) {
                const isBottom = rect.bottom >= window.innerHeight && rect.top > window.innerHeight - 300;
                const isTop = rect.top <= 0 && rect.height < 150;
                if (isBottom || isTop) {
                    const essentialRegex = /header|nav|menu/i;
                    const footerRegex = /footer|legal|accessibility|availability|contact|press|fair\\s*housing/i;
                    const role = (el as HTMLElement).getAttribute('role') || '';
                    const text = (el.textContent || '').toLowerCase();
                    const isFooterContentInfo = el.tagName === 'FOOTER' || role === 'contentinfo' || !!el.closest('footer');
                    const hasLegalFooterLinks = footerRegex.test(el.id) || footerRegex.test(el.className.toString()) ||
                        /legal|accessibility statement|fair housing|press|availability|contact/.test(text);
                    // Preserve top nav wrappers that carry brand SVG/menu icons (Belnord-like headers),
                    // otherwise keepCookies=false can remove them before non-text extraction.
                    const hasHeaderBrandOrMenuIcon =
                        isTop &&
                        !!el.querySelector('svg, .logo svg, [class*="hamburger"], [class*="menu"], [aria-label*="menu" i]');

                    const isEssential = ['NAV', 'HEADER'].includes(el.tagName) || el.closest('header, nav') ||
                        essentialRegex.test(el.id) || essentialRegex.test(el.className.toString()) ||
                        isFooterContentInfo || hasLegalFooterLinks || hasHeaderBrandOrMenuIcon;
                    if (!isEssential) el.remove();
                }
            }
        });

        if (!initial) {
            document.querySelectorAll('header, nav, .sidebar').forEach(el => {
                const s = window.getComputedStyle(el);
                const hasBrandOrMenuIcon = !!el.querySelector(
                    'svg, .logo svg, [class*="hamburger"], [class*="menu"], [aria-label*="menu" i]'
                );
                if (hasBrandOrMenuIcon) return;
                if (['fixed', 'sticky', 'absolute'].includes(s.position)) {
                    (el as HTMLElement).style.visibility = 'hidden';
                }
            });
        }
        const style = document.createElement('style'); style.innerHTML = css; document.head.appendChild(style);
    }, isInitial, NUKE_STYLES);
}

// ── Force lazy images, reveal hidden media, preload CSS backgrounds ──
export async function forceRenderContent(page: Page): Promise<void> {
    await page.evaluate(async () => {
        const style = document.createElement('style');
        style.id = 'force-pointer-events-global';
        style.innerHTML = `* { pointer-events: auto !important; }`;
        if (!document.getElementById('force-pointer-events-global')) document.head.appendChild(style);

        document.querySelectorAll('img[loading="lazy"]').forEach(img => {
            img.setAttribute('loading', 'eager');
            img.removeAttribute('loading');
            const src = (img as HTMLImageElement).src;
            if (src) (img as HTMLImageElement).src = src;
        });

        document.querySelectorAll('img, video, picture').forEach(node => {
            const el = node as HTMLElement;
            const s = window.getComputedStyle(el);
            if (s.opacity === '0' || s.visibility === 'hidden') {
                el.style.opacity = '1'; el.style.visibility = 'visible';
            }
        });

        // Force all scroll-triggered animations to their "revealed" state.
        const revealStyle = document.createElement('style');
        revealStyle.id = 'force-reveal-animations';
        revealStyle.innerHTML = `
            [style*="opacity: 0"]:not(img):not(video):not(picture):not(canvas),
            [style*="opacity:0"]:not(img):not(video):not(picture):not(canvas) { opacity: 1 !important; }
            .is-inview, .in-view, .aos-animate, .revealed, .visible { opacity: 1 !important; transform: none !important; }
            /* FIX: Override IntersectionObserver CSS-class-based opacity:0 on section content.
               This persistent rule survives IntersectionObserver re-firing after scroll. */
            section p, section a, section span, section h1, section h2, section h3, section h4, section h5, section h6,
            section figcaption, section blockquote, section li, section label,
            section .open-gallery, section [class*="gallery"], section [class*="caption"] {
                opacity: 1 !important;
                visibility: visible !important;
            }
        `;
        if (!document.getElementById('force-reveal-animations')) document.head.appendChild(revealStyle);

        // ── FIX: Use COMPUTED style to detect opacity:0, not just inline style ──
        // Sites like Palace set opacity:0 via CSS classes (IntersectionObserver animations).
        // el.style.opacity only reads INLINE styles, missing class-based opacity.
        // getComputedStyle catches BOTH inline and class-based opacity.
        const skipOpacityForce = new Set(['IMG', 'VIDEO', 'PICTURE', 'CANVAS', 'SOURCE']);
        let opacityFixCount = 0;
        document.querySelectorAll('*').forEach(node => {
            const el = node as HTMLElement;
            if (!el.style) return;
            if (skipOpacityForce.has(el.tagName)) return;
            // Skip elements we intentionally hide (headers, nav during cleanup)
            const tag = el.tagName.toLowerCase();
            if (['header', 'nav'].includes(tag) || el.closest('header, nav')) return;
            // Skip hidden panels, booking, mobile
            if (el.closest('[pnl], #booking, #menu, #mobile')) return;

            // Use COMPUTED opacity — catches both inline AND class-based opacity:0
            const computed = window.getComputedStyle(el);
            if (computed.opacity === '0') {
                el.style.setProperty('opacity', '1', 'important');
                opacityFixCount++;
            }
            // Also fix inline visibility:hidden
            if (computed.visibility === 'hidden') {
                if (!['header', 'nav'].includes(tag) && !el.closest('header, nav')) {
                    el.style.setProperty('visibility', 'visible', 'important');
                }
            }
        });
        if (opacityFixCount > 0) {
            console.log(`[ForceRender] Fixed ${opacityFixCount} elements with computed opacity:0`);
        }

        const bgUrls = new Set<string>();
        document.querySelectorAll('*').forEach(el => {
            [window.getComputedStyle(el), window.getComputedStyle(el, '::after'), window.getComputedStyle(el, '::before')].forEach(s => {
                const bg = s.backgroundImage;
                if (bg?.includes('url(')) {
                    const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
                    if (match?.[1]) bgUrls.add(match[1]);
                }
            });
        });
        bgUrls.forEach(url => {
            const img = new Image(); img.src = url; img.style.display = 'none'; document.body.appendChild(img);
        });

        const promises: Promise<void>[] = [];
        document.querySelectorAll('img').forEach(img => {
            img.decoding = 'sync';
            if (img.decode) promises.push(img.decode().catch(() => {}));
        });
        await Promise.all(promises);
    });

    await new Promise(r => setTimeout(r, 1500));
}

// ── Detect scroll strategy (HORIZONTAL_APP / VERTICAL_SNAP / STANDARD) ──
export async function detectStrategy(page: Page): Promise<SiteStrategy> {
    try {
        return await page.evaluate(async () => {
            const doc = document.documentElement;
            const scrollWidth = Math.max(document.body.scrollWidth, doc.scrollWidth, doc.offsetWidth);
            const scrollHeight = Math.max(document.body.scrollHeight, doc.scrollHeight, doc.offsetHeight);
            const vw = window.innerWidth, vh = window.innerHeight;

            if (scrollWidth > vw * 2) return 'HORIZONTAL_APP';

            const startY = window.scrollY;
            window.scrollBy(0, 100);
            await new Promise(r => setTimeout(r, 150));
            const diff = Math.abs(window.scrollY - startY);
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 100));

            const hasSnapMarkers = !!(
                document.querySelector('.swiper-wrapper') || document.querySelector('.fp-section') ||
                document.querySelector('[data-scroll-container]') || document.querySelector('.snap-container')
            );

            const fullScreenSections = Array.from(document.querySelectorAll('section, div')).filter(el => {
                const h = parseFloat(window.getComputedStyle(el).height);
                return Math.abs(h - vh) < 20 && window.getComputedStyle(el).display !== 'none';
            }).length;

            if ((diff < 70 && scrollHeight > vh + 200) || hasSnapMarkers || fullScreenSections > 2) return 'VERTICAL_SNAP';
            return 'STANDARD';
        }) as SiteStrategy;
    } catch {
        console.log('Strategy detect failed');
        return 'STANDARD';
    }
}

// ── Advance the page by one "screen" based on strategy. Returns true if end reached. ──
export async function advancePage(
    page: Page, strategy: SiteStrategy, loopCount: number, viewportH: number,
    runSafe: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T | null>
): Promise<boolean> {
    if (strategy === 'HORIZONTAL_APP') {
        const readMainTranslateX = async (): Promise<number> => {
            return await page.evaluate(() => {
                const parseTranslateX = (transform: string): number => {
                    if (!transform || transform === 'none') return 0;
                    const m3 = transform.match(/matrix3d\((.+)\)/);
                    if (m3) {
                        const v = m3[1].split(',').map(n => parseFloat(n.trim()));
                        return isFinite(v[12]) ? v[12] : 0;
                    }
                    const m2 = transform.match(/matrix\((.+)\)/);
                    if (m2) {
                        const v = m2[1].split(',').map(n => parseFloat(n.trim()));
                        return isFinite(v[4]) ? v[4] : 0;
                    }
                    return 0;
                };

                const candidates = [
                    document.querySelector('#main'),
                    document.querySelector('#scroller > main'),
                    document.querySelector('[data-scroll-container]'),
                    document.querySelector('main')
                ].filter(Boolean) as Element[];

                for (const el of candidates) {
                    const t = window.getComputedStyle(el).transform;
                    if (t && t !== 'none') return parseTranslateX(t);
                }
                return window.scrollX || 0;
            });
        };

        // Adaptive horizontal step:
        // first tiny probe (to learn how aggressive the site's wheel mapping is),
        // then a calibrated second step to avoid skipping overlay text frames.
        const beforeX = await readMainTranslateX();
        const targetShiftPx = 700;
        const probeDelta = 12;

        await page.mouse.wheel({ deltaY: probeDelta });
        await new Promise(r => setTimeout(r, 300));

        let afterProbeX = await readMainTranslateX();
        let movedPx = Math.abs(afterProbeX - beforeX);

        if (movedPx < 20) {
            // Fallback for sites with weak wheel response on tiny deltas.
            await page.mouse.wheel({ deltaY: 120 });
            await new Promise(r => setTimeout(r, 350));
            afterProbeX = await readMainTranslateX();
            movedPx = Math.abs(afterProbeX - beforeX);
        } else if (movedPx < targetShiftPx) {
            const pxPerDelta = movedPx / probeDelta;
            const remainingPx = targetShiftPx - movedPx;
            const secondDelta = Math.max(8, Math.min(220, Math.round(remainingPx / Math.max(pxPerDelta, 0.1))));
            if (secondDelta > 0) {
                await page.mouse.wheel({ deltaY: secondDelta });
                await new Promise(r => setTimeout(r, 350));
            }
        }

        const afterX = await readMainTranslateX();
        const totalMovedPx = Math.abs(afterX - beforeX);
        console.log(`[HSCROLL] before=${beforeX.toFixed(1)} after=${afterX.toFixed(1)} moved=${totalMovedPx.toFixed(1)}`);

        await new Promise(r => setTimeout(r, 1400));
        return false;
    }

    if (strategy === 'VERTICAL_SNAP') {
        await page.keyboard.press('PageDown');
        await page.evaluate(() => {
            const sw = document.querySelector('.swiper-container, .swiper, .swiper-wrapper');
            if (sw && (sw as any).swiper) (sw as any).swiper.slideNext();
        });
        await runSafe(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true })));
        await new Promise(r => setTimeout(r, 4000));
        return loopCount > 20;
    }

    // STANDARD
    await runSafe((h: number) => window.scrollBy(0, h), viewportH);
    await new Promise(r => setTimeout(r, 2000));
    return await page.evaluate(() => (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 50);
}
