// nonTextCapturePipeline.ts
import type { Page } from 'puppeteer';

type Rect = { x: number; y: number; width: number; height: number };

export async function captureAndMergeNonTextElements(
  page: Page,
  nonTextElements: any[],
  allNonTextElements: any[]
): Promise<void> {
  const vp = page.viewport() || { width: 1920, height: 1080 };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const safeFileName = (s: string) => String(s || '').replace(/[^a-zA-Z0-9-]/g, '_');

  const writeDebugPng = async (label: string, suffix: string, buf: Buffer) => {
    try {
      const fs = await import('fs');
      const dir = './debug_screens/nontext_crops';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}/${safeFileName(label)}_${suffix}.png`, buf);
    } catch {
      // ignore
    }
  };

  const clampClipToViewport = (clip: Rect): Rect => {
    const x = Math.max(0, Math.floor(clip.x));
    const y = Math.max(0, Math.floor(clip.y));
    let width = Math.ceil(clip.width);
    let height = Math.ceil(clip.height);

    if (x + width > vp.width) width = vp.width - x;
    if (y + height > vp.height) height = vp.height - y;

    return { x, y, width, height };
  };

  /**
   * Re-locate element at capture time.
   * Uses elementFromPoint(center) and walks up to find a meaningful icon container (svg/button/a/div).
   * This fixes stale rects when layout changes after cookie/intro, especially with keepCookies=false.
   */
  const refreshRectFromPoint = async (nte: any): Promise<Rect | null> => {
    if (!nte?.rect || nte.rect.width <= 3 || nte.rect.height <= 3) return null;

    const cx = nte.rect.x + nte.rect.width / 2;
    const cy = nte.rect.y + nte.rect.height / 2;

    // if center is outside viewport, skip
    if (cx < 0 || cy < 0 || cx > vp.width || cy > vp.height) return null;

    try {
      const rect = await page.evaluate(
        (x: number, y: number, type: string) => {
          const pickBest = (start: Element | null): Element | null => {
            if (!start) return null;

            // Walk up a bit and choose the first “reasonable” container
            let el: Element | null = start;
            for (let i = 0; i < 8 && el; i++) {
              const tag = el.tagName.toLowerCase();
              if (tag === 'svg') return el;
              if (tag === 'button' || tag === 'a') return el;
              if (tag === 'div' || tag === 'span') {
                const r = (el as HTMLElement).getBoundingClientRect();
                if (r.width >= 6 && r.height >= 6 && r.width <= 600 && r.height <= 400) return el;
              }
              el = el.parentElement;
            }
            return start;
          };

          // If an overlay is on top (cookie), elementFromPoint will return overlay nodes.
          // Still ok: we’ll walk up, and if it’s clearly overlay, we try a few nearby points.
          const candidates: Array<{ dx: number; dy: number }> = [
            { dx: 0, dy: 0 },
            { dx: -8, dy: 0 },
            { dx: 8, dy: 0 },
            { dx: 0, dy: -8 },
            { dx: 0, dy: 8 },
            { dx: -12, dy: -12 },
            { dx: 12, dy: -12 }
          ];

          const isOverlayLike = (el: Element): boolean => {
            const cs = window.getComputedStyle(el as HTMLElement);
            const pos = cs.position;
            const zi = parseInt(cs.zIndex || '0', 10);
            const r = (el as HTMLElement).getBoundingClientRect();
            // heuristics: full-screen fixed modal-ish things
            return (
              (pos === 'fixed' || pos === 'sticky') &&
              zi >= 1000 &&
              r.width >= window.innerWidth * 0.6 &&
              r.height >= window.innerHeight * 0.3
            );
          };

          for (const c of candidates) {
            const el0 = document.elementFromPoint(x + c.dx, y + c.dy);
            if (!el0) continue;

            const best = pickBest(el0);
            if (!best) continue;

            // If this is obviously overlay-like and we are trying to capture icons,
            // keep searching nearby points.
            if ((type === 'inline-svg-icon' || type === 'hamburger-icon') && isOverlayLike(best)) {
              continue;
            }

            const r = (best as HTMLElement).getBoundingClientRect();
            if (r.width > 3 && r.height > 3) {
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            }
          }

          return null;
        },
        cx,
        cy,
        String(nte.type || '')
      );

      if (!rect) return null;
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      };
    } catch {
      return null;
    }
  };

  const captureDirectClip = async (nte: any, pad: number, tag = 'DIRECT'): Promise<Buffer | null> => {
    // Refresh rect at capture time to avoid stale coords
    const fresh = await refreshRectFromPoint(nte);
    const useRect = fresh || nte.rect;

    if (!useRect || useRect.width <= 5 || useRect.height <= 5) return null;

    const clipRaw: Rect = {
      x: useRect.x - pad,
      y: useRect.y - pad,
      width: useRect.width + pad * 2,
      height: useRect.height + pad * 2
    };
    const clip = clampClipToViewport(clipRaw);
    if (clip.width <= 5 || clip.height <= 5) return null;

    try {
      const buf = (await page.screenshot({ type: 'png', clip })) as Buffer;
      nte.elementScreenshot = buf;
      // Update stored rect with fresh one (helps downstream)
      if (fresh) nte.rect = fresh;

      console.log(`[NonText-Capture] ${nte.label} → ${tag} clip (${clip.width}x${clip.height})`);
      return buf;
    } catch (err: any) {
      console.log(
        `[NonText-Capture] ${nte.label} → ${tag} clip FAILED: ${err?.message?.substring(0, 80) || 'unknown'}`
      );
      return null;
    }
  };

  for (const nte of nonTextElements || []) {
    const dedupeKey = `${nte.type}_${nte.label.toLowerCase()}_${nte.href || nte.src || ''}`;
    if (
      allNonTextElements.some(
        (e: any) => `${e.type}_${e.label.toLowerCase()}_${e.href || e.src || ''}` === dedupeKey
      )
    ) {
      continue;
    }

    try {
      const cssFilter = nte.cssFilter || '';

      /**
       * IMPORTANT:
       * Always DIRECT crop for inline-svg-icon / hamburger-icon (even if src exists),
       * using fresh rect. This fixes keepCookies=false cases where layout changes.
       */
      const isInlineOrHamburger =
        (nte.type === 'inline-svg-icon' || nte.type === 'hamburger-icon') &&
        nte.rect &&
        nte.rect.width > 5 &&
        nte.rect.height > 5;

      if (isInlineOrHamburger) {
        const pad = 20;
        const buf = await captureDirectClip(nte, pad, 'FORCE DIRECT');
        if (buf) await writeDebugPng(nte.label, 'ELEM', buf);
        else console.log(`[NonText-Capture] ${nte.label} → FORCE DIRECT clip produced no buffer`);

        allNonTextElements.push(nte);
        continue;
      }

      // Original behavior preserved for src-based assets
      const isBgImage = nte.type === 'icon-bg-image' || nte.type === 'ui-control';

      if (nte.src) {
        const srcFile = nte.src?.split('/').pop()?.replace(/['"]/g, '') || '';

        const resolvedBg = await page.evaluate((href: string, src: string, nteType: string) => {
          const toHex = (c: string) => {
            const m = c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return null;
            return `#${parseInt(m[1]).toString(16).padStart(2, '0')}${parseInt(m[2])
              .toString(16)
              .padStart(2, '0')}${parseInt(m[3]).toString(16).padStart(2, '0')}`.toUpperCase();
          };

          let target: Element | null = null;
          if (href && nteType !== 'icon-bg-image') {
            const links = document.querySelectorAll('a');
            for (const a of links) {
              if ((a as HTMLAnchorElement).href === href) {
                if (src) {
                  const img = a.querySelector('img');
                  if (img && (img as HTMLImageElement).src.includes(src)) {
                    target = a;
                    break;
                  }
                } else {
                  target = a;
                  break;
                }
              }
            }
          }
          if (!target && src) {
            const els = document.querySelectorAll('a, button, div');
            for (const el of els) {
              const cs = window.getComputedStyle(el);
              if (cs.backgroundImage && cs.backgroundImage.includes(src)) {
                target = el;
                break;
              }
            }
          }

          if (!target) return '#FFFFFF';

          let current: Element | null = target;
          while (current && current !== document.documentElement) {
            const cs = window.getComputedStyle(current);
            const bg = cs.backgroundColor;
            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
              const hex = toHex(bg);
              if (hex) return hex;
            }
            current = current.parentElement;
          }

          const bodyBg = window.getComputedStyle(document.body).backgroundColor;
          const hex = toHex(bodyBg);
          return hex || '#FFFFFF';
        }, nte.href || '', srcFile, nte.type);

        const stickyInfo = await page.evaluate((href: string, src: string, nteType: string) => {
          const toHex = (c: string) => {
            const m = c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return null;
            return `#${parseInt(m[1]).toString(16).padStart(2, '0')}${parseInt(m[2])
              .toString(16)
              .padStart(2, '0')}${parseInt(m[3]).toString(16).padStart(2, '0')}`.toUpperCase();
          };

          const getEffectiveBg = (startEl: Element | null): { color: string | null; source: string } => {
            let el = startEl;
            while (el && el !== document.documentElement) {
              const cs = window.getComputedStyle(el);
              const bg = cs.backgroundColor;
              if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                const hex = toHex(bg);
                const tag = el.tagName.toLowerCase();
                const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
                const cls = (el as HTMLElement).className ? `.${String((el as HTMLElement).className).split(' ')[0]}` : '';
                return { color: hex, source: `${tag}${id}${cls}` };
              }
              el = el.parentElement;
            }
            return { color: null, source: 'none' };
          };

          let target: Element | null = null;
          if (href && nteType !== 'icon-bg-image') {
            const links = document.querySelectorAll('a');
            for (const a of links) {
              if ((a as HTMLAnchorElement).href === href) {
                if (src) {
                  const img = a.querySelector('img');
                  if (img && (img as HTMLImageElement).src.includes(src)) {
                    target = a;
                    break;
                  }
                } else {
                  target = a;
                  break;
                }
              }
            }
          }
          if (!target && src) {
            const els = document.querySelectorAll('a, button, div');
            for (const el of els) {
              const cs = window.getComputedStyle(el);
              if (cs.backgroundImage && cs.backgroundImage.includes(src)) {
                target = el;
                break;
              }
            }
          }

          if (!target) return { hasStickyVariant: false, normalBg: null, stickyBg: null, debug: 'no target found' };

          let stickyAncestor: HTMLElement | null = null;
          let el: Element | null = target;
          while (el && el !== document.documentElement) {
            const htmlEl = el as HTMLElement;
            const cs = window.getComputedStyle(el);
            if (htmlEl.id === 'bar' || cs.position === 'sticky' || cs.position === 'fixed' || htmlEl.dataset.sticky !== undefined) {
              stickyAncestor = htmlEl;
              break;
            }
            el = el.parentElement;
          }

          if (!stickyAncestor) return { hasStickyVariant: false, normalBg: null, stickyBg: null, debug: 'no sticky ancestor' };

          const normalInfo = getEffectiveBg(target);

          const hadSticky = stickyAncestor.classList.contains('sticky');
          const hadIn = stickyAncestor.classList.contains('in');
          const hadScrolled = stickyAncestor.classList.contains('scrolled');

          if (!hadSticky) {
            stickyAncestor.classList.add('sticky');
            stickyAncestor.classList.add('in');
            stickyAncestor.classList.add('scrolled');

            const targetCs = window.getComputedStyle(target);
            const isStillVisible =
              targetCs.display !== 'none' &&
              targetCs.visibility !== 'hidden' &&
              targetCs.opacity !== '0' &&
              (target as HTMLElement).offsetWidth > 0;

            const sticky = isStillVisible ? getEffectiveBg(target) : { color: null, source: 'hidden' };

            stickyAncestor.classList.remove('sticky');
            if (!hadIn) stickyAncestor.classList.remove('in');
            if (!hadScrolled) stickyAncestor.classList.remove('scrolled');

            const debug = `normal=${normalInfo.color}@${normalInfo.source} sticky=${sticky.color}@${sticky.source} visible=${isStillVisible}`;

            if (isStillVisible && normalInfo.color && sticky.color && normalInfo.color !== sticky.color) {
              return { hasStickyVariant: true, normalBg: normalInfo.color, stickyBg: sticky.color, debug };
            }
            return { hasStickyVariant: false, normalBg: null, stickyBg: null, debug };
          }

          return { hasStickyVariant: false, normalBg: null, stickyBg: null, debug: 'already sticky' };
        }, nte.href || '', srcFile, nte.type);

        console.log(`[Sticky-Debug] ${nte.label}: ${(stickyInfo as any).debug || 'no debug'}`);

        const bgColor = resolvedBg || '#FFFFFF';
        if (resolvedBg && resolvedBg !== '#FFFFFF') {
          nte.bgColor = resolvedBg;
        }

        const origW = nte.rect?.width || 60;
        const origH = nte.rect?.height || 60;
        const minSize = 60;
        const scale = origW < minSize || origH < minSize ? Math.ceil(minSize / Math.min(origW, origH)) : 1;

        const renderW = Math.round(origW * scale);
        const renderH = Math.round(origH * scale);
        const containerW = renderW + 20;
        const containerH = renderH + 20;

        const captureWithBg = async (bg: string): Promise<Buffer | null> => {
          const ready = await page.evaluate(
            (src: string, filter: string, isBg: boolean, rW: number, rH: number, cW: number, cH: number, bgHex: string) => {
              try {
                const old = document.getElementById('__nontext_temp');
                if (old) old.remove();

                const container = document.createElement('div');
                container.id = '__nontext_temp';
                container.style.cssText = `
                  position: fixed; top: 0; left: 0; z-index: 999999;
                  width: ${cW}px; height: ${cH}px;
                  background: ${bgHex};
                  display: flex; align-items: center; justify-content: center;
                `;

                if (isBg) {
                  const inner = document.createElement('div');
                  inner.style.cssText = `
                    width: ${rW}px; height: ${rH}px;
                    background-image: url('${src}');
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    ${filter ? `filter: ${filter};` : ''}
                  `;
                  container.appendChild(inner);
                } else {
                  const img = document.createElement('img');
                  img.src = src;
                  img.style.cssText = `
                    width: ${rW}px; height: ${rH}px;
                    object-fit: contain;
                    ${filter ? `filter: ${filter};` : ''}
                  `;
                  container.appendChild(img);
                }

                document.body.appendChild(container);
                return true;
              } catch {
                return false;
              }
            },
            nte.src,
            cssFilter,
            isBgImage,
            renderW,
            renderH,
            containerW,
            containerH,
            bg
          );

          if (!ready) return null;

          await sleep(400);

          await page.evaluate(() => {
            const c = document.getElementById('__nontext_temp');
            const img = c?.querySelector('img') as HTMLImageElement | null;
            if (img && (!img.complete || img.naturalWidth === 0)) {
              const s = img.src;
              img.src = '';
              img.src = s;
            }
          });

          await sleep(200);

          const clip: Rect = { x: 0, y: 0, width: containerW, height: containerH };
          const buf = (await page.screenshot({ type: 'png', clip })) as Buffer;

          await page.evaluate(() => {
            const el = document.getElementById('__nontext_temp');
            if (el) el.remove();
          });

          return buf;
        };

        const primaryBuf = await captureWithBg(bgColor);
        if (primaryBuf) {
          nte.elementScreenshot = primaryBuf;
          nte.screenshotBgColor = bgColor;
          console.log(`[NonText-Capture] ${nte.label} → OK bg=${bgColor} (${containerW}x${containerH})`);
          await writeDebugPng(nte.label, 'ELEM', primaryBuf);
        }

        if ((stickyInfo as any)?.hasStickyVariant && (stickyInfo as any)?.stickyBg) {
          const stickyBg = (stickyInfo as any).stickyBg as string;
          const stickyBuf = await captureWithBg(stickyBg);
          if (stickyBuf) {
            nte.stickyScreenshot = stickyBuf;
            nte.stickyBgColor = stickyBg;
            nte.normalBgColor = (stickyInfo as any).normalBg;
            console.log(`[NonText-Capture] ${nte.label} → STICKY variant bg=${stickyBg}`);
            await writeDebugPng(nte.label, 'STICKY', stickyBuf);
          }
        }
      } else {
        // No src: direct crop (and refresh rect to avoid stale coords)
        if (
          (nte.type === 'ui-control' || nte.type === 'inline-svg-icon' || nte.type === 'hamburger-icon') &&
          nte.rect &&
          nte.rect.width > 5 &&
          nte.rect.height > 5
        ) {
          const pad = nte.type === 'inline-svg-icon' || nte.type === 'hamburger-icon' ? 20 : 4;
          const buf = await captureDirectClip(nte, pad, 'DIRECT');
          if (buf) await writeDebugPng(nte.label, 'ELEM', buf);
          else console.log(`[NonText-Capture] ${nte.label} → no src, clip too small/failed`);
        } else {
          console.log(`[NonText-Capture] ${nte.label} → no src, skip`);
        }
      }
    } catch (err: any) {
      console.log(`[NonText-Capture] ${nte.label} → FAILED: ${err?.message?.substring(0, 120)}`);
    }

    allNonTextElements.push(nte);
  }
}
