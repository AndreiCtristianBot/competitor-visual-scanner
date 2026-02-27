export function scanViewportChunk(currentLoopIndex, strategy) {
    const _dbg = [];
    const toHex = (val) => {
        if (!val || val === 'transparent' || val === 'rgba(0, 0, 0, 0)')
            return null;
        if (val.startsWith('#')) {
            if (val.length === 4)
                return `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}`.toUpperCase();
            return val.toUpperCase();
        }
        if (val.startsWith('rgba')) {
            const parts = val.match(/[\d.]+/g);
            if (parts && parts.length === 4 && parseFloat(parts[3]) < 0.05)
                return null;
        }
        const m = val.match(/rgba?\(?\s*(\d+),\s*(\d+),\s*(\d+)/);
        if (!m)
            return null;
        return `#${parseInt(m[1]).toString(16).padStart(2, '0')}${parseInt(m[2]).toString(16).padStart(2, '0')}${parseInt(m[3]).toString(16).padStart(2, '0')}`.toUpperCase();
    };
    const scrollY = (() => {
        const scroller = document.querySelector('#scroller, [data-scroll-container], .scroll-container');
        if (scroller) {
            const t = window.getComputedStyle(scroller).transform;
            if (t && t !== 'none') {
                const matrix = t.match(/matrix.*\((.+)\)/);
                if (matrix) {
                    const v = matrix[1].split(', ');
                    return Math.abs(parseFloat(v[5] || v[13] || '0'));
                }
            }
        }
        return window.scrollY;
    })();
    const isElementViewportVisible = (el, minRatio = 0.02, minW = 8, minH = 8) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0)
            return false;
        const left = Math.max(0, r.left), top = Math.max(0, r.top);
        const right = Math.min(vw, r.right), bottom = Math.min(vh, r.bottom);
        const iw = Math.max(0, right - left), ih = Math.max(0, bottom - top);
        return iw >= minW && ih >= minH && (iw * ih) / Math.max(1, r.width * r.height) >= minRatio;
    };
    const isRectViewportVisible = (rect, minRatio = 0.02, minW = 8, minH = 8) => {
        if (rect.width <= 0 || rect.height <= 0)
            return false;
        const left = Math.max(0, rect.x), top = Math.max(0, rect.y);
        const right = Math.min(vw, rect.x + rect.width), bottom = Math.min(vh, rect.y + rect.height);
        const iw = Math.max(0, right - left), ih = Math.max(0, bottom - top);
        return iw >= minW && ih >= minH && (iw * ih) / Math.max(1, rect.width * rect.height) >= minRatio;
    };
    const detectMediaOverlapForRect = (rect, contextEl) => {
        if (!contextEl || rect.width < 4 || rect.height < 4)
            return false;
        const overlapsEnough = (a, b) => {
            const left = Math.max(a.x, b.left), top = Math.max(a.y, b.top);
            const right = Math.min(a.x + a.width, b.right), bottom = Math.min(a.y + a.height, b.bottom);
            return (Math.max(0, right - left) * Math.max(0, bottom - top)) / Math.max(1, a.width * a.height) >= 0.25;
        };
        const isMediaCarrier = (node) => {
            if (['IMG', 'VIDEO', 'PICTURE', 'CANVAS'].includes(node.tagName))
                return true;
            const s = window.getComputedStyle(node);
            if (s.backgroundImage && s.backgroundImage !== 'none' && s.backgroundImage.includes('url'))
                return true;
            return !!node.querySelector('img, picture, video, canvas');
        };
        const containers = [];
        if (contextEl.parentElement)
            containers.push(contextEl.parentElement);
        if (contextEl.parentElement?.parentElement)
            containers.push(contextEl.parentElement.parentElement);
        const section = contextEl.closest('section');
        if (section)
            containers.push(section);
        for (const container of containers) {
            for (const sib of Array.from(container.querySelectorAll('*'))) {
                if (sib === contextEl || sib.contains(contextEl) || contextEl.contains(sib))
                    continue;
                const ss = window.getComputedStyle(sib);
                if (ss.display === 'none' || ss.visibility === 'hidden' || ss.opacity === '0')
                    continue;
                if (!isMediaCarrier(sib))
                    continue;
                if (overlapsEnough(rect, sib.getBoundingClientRect()))
                    return true;
            }
        }
        return false;
    };
    const resolveRealColorStructural = (el) => {
        let current = el;
        let hasImage = false;
        while (current) {
            const style = window.getComputedStyle(current);
            if (style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url'))
                hasImage = true;
            if (current.parentElement) {
                for (const sib of current.parentElement.children) {
                    if (sib === current)
                        continue;
                    const ss = window.getComputedStyle(sib);
                    const isOverlay = ss.position === 'absolute' || ss.position === 'fixed' || parseInt(ss.zIndex) < 0;
                    if (isOverlay || sib.tagName === 'PICTURE' || sib.tagName === 'IMG') {
                        if (['IMG', 'VIDEO', 'PICTURE'].includes(sib.tagName))
                            hasImage = true;
                        if (ss.backgroundImage?.includes('url'))
                            hasImage = true;
                        if (sib.querySelector('img, picture, video'))
                            hasImage = true;
                    }
                }
            }
            if (hasImage)
                return 'IMAGE';
            const hex = toHex(style.backgroundColor);
            if (hex)
                return hex;
            current = current.parentElement;
        }
        return hasImage ? 'IMAGE' : '#FFFFFF';
        // Cookie modals (e.g., Cookiebot) often include logos/SVGs and gradient faders that can
        // trick structural image detection. For those cases, prefer the first non-transparent
        // background-color found while walking up the ancestor chain, ignoring bg images/icons.
        const resolveSolidBgOnly = (el) => {
            let current = el;
            while (current) {
                const style = window.getComputedStyle(current);
                const hex = toHex(style.backgroundColor);
                if (hex)
                    return hex;
                current = current.parentElement;
            }
            return null;
        };
    };
    const detectStructuralImageBackground = (el) => {
        const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4;
        let current = el;
        let levels = 0;
        while (current && levels < 8) {
            const style = window.getComputedStyle(current);
            if (style.backgroundImage && style.backgroundImage !== 'none' && style.backgroundImage.includes('url'))
                return true;
            if (current.parentElement) {
                const currentRect = current.getBoundingClientRect();
                const found = Array.from(current.parentElement.children).some(sib => {
                    if (sib === current)
                        return false;
                    const ss = window.getComputedStyle(sib);
                    const positioned = ss.position === 'absolute' || ss.position === 'fixed';
                    const negZ = parseInt(ss.zIndex) < 0;
                    if (!overlaps(currentRect, sib.getBoundingClientRect()))
                        return false;
                    if (['IMG', 'VIDEO', 'PICTURE', 'CANVAS'].includes(sib.tagName))
                        return positioned || negZ;
                    if ((positioned || negZ) && ss.backgroundImage?.includes('url'))
                        return true;
                    if (sib.querySelector('img, picture, video, canvas')) {
                        const ns = window.getComputedStyle(sib);
                        return ns.position === 'absolute' || ns.position === 'fixed' || parseInt(ns.zIndex) < 0;
                    }
                    return false;
                });
                if (found)
                    return true;
            }
            current = current.parentElement;
            levels++;
        }
        return false;
    };
    const detectOverlappingMediaSiblings = (el) => {
        if (!el)
            return false;
        const targetRect = el.getBoundingClientRect();
        if (targetRect.width < 4 || targetRect.height < 4)
            return false;
        const overlapsEnough = (a, b) => {
            const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
            const right = Math.min(a.right, b.right), bottom = Math.min(a.bottom, b.bottom);
            return (Math.max(0, right - left) * Math.max(0, bottom - top)) / Math.max(1, a.width * a.height) >= 0.25;
        };
        const isMediaCarrier = (node) => {
            if (['IMG', 'VIDEO', 'PICTURE', 'CANVAS'].includes(node.tagName))
                return true;
            const s = window.getComputedStyle(node);
            if (s.backgroundImage && s.backgroundImage !== 'none' && s.backgroundImage.includes('url'))
                return true;
            return !!node.querySelector('img, picture, video, canvas');
        };
        const containers = [];
        if (el.parentElement)
            containers.push(el.parentElement);
        if (el.parentElement?.parentElement)
            containers.push(el.parentElement.parentElement);
        for (const container of containers) {
            for (const sib of Array.from(container.children)) {
                if (sib === el || sib.contains(el) || el.contains(sib))
                    continue;
                const ss = window.getComputedStyle(sib);
                if (ss.display === 'none' || ss.visibility === 'hidden' || ss.opacity === '0')
                    continue;
                if (!isMediaCarrier(sib))
                    continue;
                if (overlapsEnough(targetRect, sib.getBoundingClientRect()))
                    return true;
            }
        }
        return false;
    };
    const hasPseudoMediaOverlay = (el) => {
        let current = el;
        for (let i = 0; i < 4 && current; i++) {
            const bef = window.getComputedStyle(current, '::before');
            const aft = window.getComputedStyle(current, '::after');
            const hasPseudoBg = (cs) => !!(cs.backgroundImage && cs.backgroundImage !== 'none' &&
                (cs.backgroundImage.includes('url') || cs.backgroundImage.includes('gradient')));
            if (hasPseudoBg(bef) || hasPseudoBg(aft))
                return true;
            current = current.parentElement;
        }
        return false;
    };
    const isOverlayLikeText = (el) => {
        let current = el;
        for (let i = 0; i < 4 && current; i++) {
            const s = window.getComputedStyle(current);
            const z = parseInt(s.zIndex);
            if (s.position === 'absolute' || s.position === 'fixed' || s.position === 'sticky')
                return true;
            if (!isNaN(z) && z > 0)
                return true;
            current = current.parentElement;
        }
        return hasPseudoMediaOverlay(el);
    };
    const hasOpaqueModalAncestor = (el) => {
        let current = el;
        for (let i = 0; i < 8 && current; i++) {
            const s = window.getComputedStyle(current);
            const role = (current.getAttribute('role') || '').toLowerCase();
            const ariaModal = (current.getAttribute('aria-modal') || '').toLowerCase() === 'true';
            const idClass = `${current.id || ''} ${current.className || ''}`.toLowerCase();
            const looksCookieDialog = /cookie|consent|cybot|cookiebot|onetrust|usercentrics/.test(idClass);
            const isDialogLike = role === 'dialog' || ariaModal || looksCookieDialog;
            if (isDialogLike) {
                const bgHex = toHex(s.backgroundColor);
                const r = current.getBoundingClientRect();
                const coversArea = r.width > 240 && r.height > 100;
                if (bgHex && coversArea)
                    return true;
            }
            current = current.parentElement;
        }
        return false;
    };
    // ── Detect text inside section with full-bleed <picture>/<img> ──
    const isInFullBleedImageSection = (el) => {
        if (!el)
            return false;
        const section = el.closest('section');
        if (!section)
            return false;
        const sectionRect = section.getBoundingClientRect();
        if (sectionRect.width < 100 || sectionRect.height < 100)
            return false;
        const sectionArea = sectionRect.width * sectionRect.height;
        const mediaEls = section.querySelectorAll('picture, img, video');
        for (const media of mediaEls) {
            const mediaRect = media.getBoundingClientRect();
            const mediaArea = mediaRect.width * mediaRect.height;
            if (mediaArea / sectionArea >= 0.4 && mediaRect.width > sectionRect.width * 0.5)
                return true;
        }
        return false;
    };
    const finalSection = document.querySelector('#final');
    const getVisualBackgroundAtPoint = (x, y, textNode, gridMode) => {
        const skipFinal = textNode ? !!(textNode.parentElement?.closest('#main')) : false;
        for (const el of document.elementsFromPoint(x, y)) {
            const s = window.getComputedStyle(el);
            if (s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none')
                continue;
            if (skipFinal && finalSection && (el === finalSection || finalSection.contains(el)))
                continue;
            const hex = toHex(s.backgroundColor);
            const hasBg = s.backgroundImage && s.backgroundImage !== 'none' && s.backgroundImage.includes('url');
            if (gridMode) {
                if (['IMG', 'VIDEO', 'CANVAS', 'PICTURE'].includes(el.tagName))
                    return 'IMAGE_STACKED';
                if (hex)
                    return hex;
                if (hasBg)
                    return 'IMAGE_STACKED';
                continue;
            }
            if (textNode) {
                const isAnc = el.contains(textNode) || el === textNode.parentElement;
                if (!isAnc) {
                    if (['IMG', 'VIDEO', 'CANVAS', 'PICTURE'].includes(el.tagName)) {
                        const textParent = textNode.parentElement;
                        if (textParent) {
                            let tp = textParent;
                            let shared = false;
                            for (let i = 0; i < 4 && tp; i++) {
                                if (tp.contains(el)) {
                                    const tag = tp.tagName.toLowerCase();
                                    if (tag !== 'main' && tag !== 'body' && tag !== 'html' && tp.id !== 'scroller' && tp.id !== 'main')
                                        shared = true;
                                    break;
                                }
                                tp = tp.parentElement;
                            }
                            if (shared)
                                return 'IMAGE_STACKED';
                        }
                        continue;
                    }
                    if (hex || hasBg)
                        return 'OCCLUDED';
                }
                if (isAnc) {
                    if (['IMG', 'VIDEO', 'CANVAS', 'PICTURE'].includes(el.tagName))
                        return 'IMAGE_STACKED';
                    const bef = window.getComputedStyle(el, '::before');
                    const aft = window.getComputedStyle(el, '::after');
                    const chkImg = (cs) => cs.backgroundImage && cs.backgroundImage !== 'none' && (cs.backgroundImage.includes('url') || cs.backgroundImage.includes('gradient'));
                    const aftHex = toHex(aft.backgroundColor);
                    if (aftHex)
                        return aftHex;
                    if (chkImg(aft))
                        return 'IMAGE_STACKED';
                    if (hex)
                        return hex;
                    if (chkImg(s))
                        return 'IMAGE_STACKED';
                    const befHex = toHex(bef.backgroundColor);
                    if (befHex)
                        return befHex;
                    if (chkImg(bef))
                        return 'IMAGE_STACKED';
                }
            }
        }
        return 'TRANSPARENT';
    };
    const resolveSolidBgOnly = (el) => {
        let current = el;
        while (current) {
            const cs = window.getComputedStyle(current);
            // ignoră elemente invizibile
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') {
                current = current.parentElement;
                continue;
            }
            // ia doar culoare solidă (nu gradient / url)
            const bg = cs.backgroundColor;
            const hex = toHex(bg);
            // acceptă doar culori opace/semnificative
            if (hex && hex !== '#00000000' && hex !== '#FFFFFF00' && hex !== '#000000') {
                // opțional: ignoră transparent / aproape transparent
                const m = bg.match(/rgba?\(([^)]+)\)/);
                if (m) {
                    const parts = m[1].split(',').map((p) => p.trim());
                    const a = parts.length === 4 ? parseFloat(parts[3]) : 1;
                    if (!Number.isNaN(a) && a < 0.15) {
                        current = current.parentElement;
                        continue;
                    }
                }
                return hex;
            }
            current = current.parentElement;
        }
        return null;
    };
    const resolveEffectiveBg = (centerX, centerY, node, parent) => {
        let bg = getVisualBackgroundAtPoint(centerX, centerY, node, false);
        const allowHorizontalOverlayPromotion = isInFullBleedImageSection(parent) || hasPseudoMediaOverlay(parent);
        const inCookieModal = !!parent.closest('#CybotCookiebotDialog, [id*="CybotCookiebotDialog" i], [class*="CybotCookiebot" i], [id*="cookiebot" i], [class*="cookiebot" i]');
        // If text is inside an opaque consent/modal layer, prefer that layer color
        // instead of the hero image behind it.
        if (inCookieModal || hasOpaqueModalAncestor(parent)) {
            const modalColor = inCookieModal ? resolveSolidBgOnly(parent) : resolveRealColorStructural(parent);
            if (modalColor) {
                if (bg === 'IMAGE_STACKED' ||
                    bg === 'IMAGE' ||
                    bg === 'TRANSPARENT' ||
                    bg === '#FFFFFF' ||
                    bg === null)
                    return modalColor;
            }
        }
        if (bg === 'OCCLUDED') {
            if (strategy === 'HORIZONTAL_APP' &&
                allowHorizontalOverlayPromotion &&
                isElementViewportVisible(parent, 0.08, 16, 10) &&
                isOverlayLikeText(parent) &&
                detectOverlappingMediaSiblings(parent))
                return 'IMAGE_STACKED';
            return null;
        }
        if (strategy === 'HORIZONTAL_APP' && bg && bg !== 'TRANSPARENT' && bg !== 'IMAGE_STACKED') {
            if (allowHorizontalOverlayPromotion &&
                isElementViewportVisible(parent, 0.08, 16, 10) &&
                isOverlayLikeText(parent) &&
                detectOverlappingMediaSiblings(parent))
                return 'IMAGE_STACKED';
        }
        const canUseWhiteFallback = strategy !== 'HORIZONTAL_APP';
        if (bg === 'TRANSPARENT' || (bg === '#FFFFFF' && canUseWhiteFallback)) {
            // Cookie/consent modals are opaque overlays; do not promote to IMAGE_STACKED
            // from underlying hero image.
            if (hasOpaqueModalAncestor(parent)) {
                const structuralModal = resolveRealColorStructural(parent);
                if (structuralModal && structuralModal !== 'IMAGE')
                    return structuralModal;
            }
            if (detectStructuralImageBackground(parent))
                return 'IMAGE_STACKED';
            const structural = resolveRealColorStructural(parent);
            if (structural === 'IMAGE')
                return 'IMAGE_STACKED';
            if (bg === 'TRANSPARENT')
                return structural;
        }
        return bg;
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const localBgs = {};
    const localImgs = {};
    const viewTextNodes = [];
    let localTotalScore = 0;
    let visibleContentString = '';
    // ── Detect cookie/consent dialog bounding rect ──
    // If a cookie dialog is visible and covers part of the viewport,
    // any text visually hidden behind it should NOT be reported.
    const cookieDialogRect = (() => {
        const sel = '#CybotCookiebotDialog, [id*="onetrust" i][role="dialog"], [id*="usercentrics" i], [id*="cookie" i][role="dialog"], [id*="consent" i][role="dialog"]';
        for (const el of document.querySelectorAll(sel)) {
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')
                continue;
            const r = el.getBoundingClientRect();
            if (r.width > 200 && r.height > 100 && r.bottom > 0 && r.top < vh) {
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            }
        }
        return null;
    })();
    const isOccludedByCookieDialog = (rect) => {
        if (!cookieDialogRect)
            return false;
        // Check if the CENTER of the text rect falls inside the cookie dialog
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        return cx >= cookieDialogRect.x && cx <= cookieDialogRect.x + cookieDialogRect.width &&
            cy >= cookieDialogRect.y && cy <= cookieDialogRect.y + cookieDialogRect.height;
    };
    const mainEl = document.querySelector('#main');
    const mainTransform = mainEl ? window.getComputedStyle(mainEl).transform : 'none';
    const mainIsTransformed = !!(mainTransform && mainTransform !== 'none');
    // ── Probe: is "Open gallery" text present in DOM at all? ──
    const galleryProbe = document.querySelectorAll('.open-gallery, [class*="gallery"], p');
    let galleryFound = false;
    galleryProbe.forEach(el => {
        const txt = (el.textContent || '').trim();
        if (/open gallery/i.test(txt) && txt.length < 30) {
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            galleryFound = true;
            _dbg.push(`[GALLERY-PROBE] loop=${currentLoopIndex} text="${txt}" tag=${el.tagName} class="${el.className}"` +
                ` rect=(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)})` +
                ` vis=${cs.visibility} disp=${cs.display} opacity=${cs.opacity}` +
                ` inVP=${r.x < vw && r.x + r.width > 0 && r.y < vh && r.y + r.height > 0}` +
                ` fullBleed=${isInFullBleedImageSection(el)}`);
        }
    });
    if (!galleryFound) {
        _dbg.push(`[GALLERY-PROBE] loop=${currentLoopIndex} "Open gallery" NOT FOUND in DOM`);
    }
    for (let y = 0; y < vh; y += 150) {
        for (let x = 0; x < vw; x += 150) {
            const c = getVisualBackgroundAtPoint(x, y, null, true);
            if (c === 'IMAGE_STACKED' || c === 'IMAGE') {
                localImgs['CSS-BG'] = (localImgs['CSS-BG'] || 0) + 1;
                visibleContentString += 'IMG';
                localTotalScore++;
            }
            else if (c && c !== 'TRANSPARENT') {
                localBgs[c] = (localBgs[c] || 0) + 1;
                localTotalScore++;
            }
        }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const processedTextKeys = new Set();
    const processedArrowKeys = new Set();
    const normalizeTextForKey = (t) => t.toLowerCase().replace(/\s+/g, ' ').trim();
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent)
            continue;
        const barAnchor = parent.closest('#bar a');
        const isTopBarTarget = !!(barAnchor && (barAnchor.matches('a.book') ||
            barAnchor.matches('a.info')));
        if (parent.closest('[pnl], #booking, #menu, #mobile'))
            continue;
        if (parent.closest('#scrollbar, header, nav'))
            continue;
        if (parent.closest('#bar') && !isTopBarTarget)
            continue;
        const text = (node.textContent || '').trim();
        if (text.length < 1)
            continue;
        if (!/[\p{L}\p{N}]/u.test(text))
            continue;
        const normalizedText = normalizeTextForKey(text);
        const isGalleryDbg = /gallery/i.test(text);
        let rect = { x: 0, y: 0, width: 0, height: 0 };
        try {
            const range = document.createRange();
            range.selectNode(node);
            const rr = range.getBoundingClientRect();
            if (rr.width < 1 || rr.height < 1) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-WALK] "${text}" SKIP: rect ${Math.round(rr.width)}x${Math.round(rr.height)}`);
                continue;
            }
            const PAD = 4;
            rect = { x: Math.max(0, rr.x - PAD), y: Math.max(0, rr.y - PAD), width: rr.width + PAD * 2, height: rr.height + PAD * 2 };
        }
        catch {
            const cr = parent.getBoundingClientRect();
            rect = { x: cr.x, y: cr.y, width: cr.width, height: cr.height };
        }
        const posKey = `${text}_${Math.round(rect.x)}_${Math.round(rect.y)}`;
        if (processedTextKeys.has(posKey))
            continue;
        // Skip text that is visually occluded by cookie dialog (but keep text INSIDE the dialog)
        const isInsideCookieDialog = !!parent.closest('#CybotCookiebotDialog, [id*="onetrust" i], [id*="usercentrics" i], [id*="cookie" i][role="dialog"], [id*="consent" i][role="dialog"]');
        if (!isInsideCookieDialog && isOccludedByCookieDialog(rect)) {
            if (isGalleryDbg)
                _dbg.push(`[GALLERY-WALK] "${text}" SKIP: occluded by cookie dialog`);
            continue;
        }
        const interLeft = Math.max(0, rect.x);
        const interTop = Math.max(0, rect.y);
        const interRight = Math.min(vw, rect.x + rect.width);
        const interBottom = Math.min(vh, rect.y + rect.height);
        const interW = Math.max(0, interRight - interLeft);
        const interH = Math.max(0, interBottom - interTop);
        const visibleRatio = (interW * interH) / Math.max(1, rect.width * rect.height);
        const visible = rect.width > 0 && rect.height > 0 && interW >= 12 && interH >= 10 && visibleRatio >= 0.35;
        if (!visible) {
            if (isGalleryDbg)
                _dbg.push(`[GALLERY-WALK] "${text}" SKIP: not visible rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}) iw=${Math.round(interW)} ih=${Math.round(interH)} ratio=${visibleRatio.toFixed(2)}`);
            continue;
        }
        const cs = getComputedStyle(parent);
        if (cs.visibility === 'hidden' || cs.display === 'none') {
            if (isGalleryDbg)
                _dbg.push(`[GALLERY-WALK] "${text}" SKIP: vis=${cs.visibility} disp=${cs.display}`);
            continue;
        }
        if (cs.opacity === '0') {
            const inFullBleed = isInFullBleedImageSection(parent);
            if (!inFullBleed) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-WALK] "${text}" SKIP: opacity=0 fullBleed=false`);
                continue;
            }
            parent.style.setProperty('opacity', '1', 'important');
            if (isGalleryDbg)
                _dbg.push(`[GALLERY-WALK] "${text}" RESCUE: opacity=0 but fullBleed=true → forced 1`);
        }
        if (strategy === 'HORIZONTAL_APP' && !isElementViewportVisible(parent, 0.02, 8, 8)) {
            if (isGalleryDbg)
                _dbg.push(`[GALLERY-WALK] "${text}" SKIP: not viewport-visible (HORIZ check)`);
            continue;
        }
        visibleContentString += text.substring(0, 5);
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        let effectiveBg = resolveEffectiveBg(centerX, centerY, node, parent);
        if (effectiveBg === null) {
            const inBelnordFooter = !!parent.closest('.footer-desktop, .footer-desktop-home, .footer-item');
            if (inBelnordFooter) {
                const fallbackBg = getVisualBackgroundAtPoint(centerX, centerY, null, true);
                if (fallbackBg && fallbackBg !== 'TRANSPARENT')
                    effectiveBg = fallbackBg;
            }
        }
        // ── Full-bleed image section override ──
        if (effectiveBg !== null && effectiveBg !== 'IMAGE_STACKED') {
            if (isInFullBleedImageSection(parent)) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-WALK] "${text}" OVERRIDE bg=${effectiveBg} → IMAGE_STACKED (fullBleed)`);
                effectiveBg = 'IMAGE_STACKED';
            }
        }
        if (effectiveBg === null) {
            if (isInFullBleedImageSection(parent)) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-WALK] "${text}" OVERRIDE bg=null → IMAGE_STACKED (fullBleed)`);
                effectiveBg = 'IMAGE_STACKED';
            }
        }
        const isInFinal = !!parent.closest('#final');
        // Guardrail for HORIZONTAL_APP:
        // only keep IMAGE_STACKED if text is clearly overlaying media.
        if (strategy === 'HORIZONTAL_APP' && effectiveBg === 'IMAGE_STACKED') {
            const inFullBleed = isInFullBleedImageSection(parent);
            const overlayLike = isOverlayLikeText(parent) || isOverlayLikeText(parent.parentElement);
            const mediaOverlap = detectMediaOverlapForRect(rect, parent) ||
                detectMediaOverlapForRect(rect, parent.parentElement);
            if (!(inFullBleed || (overlayLike && mediaOverlap))) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-WALK] "${text}" SKIP: IMAGE_STACKED without strong overlay evidence`);
                continue;
            }
        }
        if (isGalleryDbg) {
            _dbg.push(`[GALLERY-WALK] "${text}" FOUND loop=${currentLoopIndex} bg=${effectiveBg} color=${toHex(cs.color)}` +
                ` rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)})` +
                ` opacity=${cs.opacity} pos=${cs.position}`);
        }
        if (effectiveBg !== null) {
            viewTextNodes.push({
                text: text.substring(0, 100), tagName: parent.tagName.toLowerCase(),
                textColor: toHex(cs.color),
                fontFamily: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(),
                fontWeight: cs.fontWeight, fontSize: cs.fontSize,
                effectiveBg, rect, captureIndex: currentLoopIndex,
                hasArrow: false, isInFinal,
                isStaticBehindMain: isInFinal && mainIsTransformed
            });
            processedTextKeys.add(posKey);
            // Prevent fallback pass from adding same text again in the same loop.
            processedTextKeys.add(`fb_text_${normalizedText}_${currentLoopIndex}`);
        }
        else {
            if (isGalleryDbg)
                _dbg.push(`[GALLERY-WALK] "${text}" DROPPED: bg=null after all checks`);
        }
    }
    // ── HORIZONTAL_APP fallback: overlay labels ──
    if (strategy === 'HORIZONTAL_APP') {
        const clampRectToViewport = (rect) => {
            const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
            return { x: x0, y: y0, width: Math.max(0, Math.min(vw, rect.x + rect.width) - x0), height: Math.max(0, Math.min(vh, rect.y + rect.height) - y0) };
        };
        const buildEstimatedTextRect = (el, cs, text) => {
            const base = el.getBoundingClientRect();
            const fontSize = Math.max(10, parseFloat(cs.fontSize || '16') || 16);
            const estW = Math.max(80, Math.min(420, text.length * fontSize * 0.62));
            // Use the VISIBLE portion of the element (clamped to viewport)
            const visLeft = Math.max(0, base.left);
            const visRight = Math.min(vw, base.right);
            const visTop = Math.max(0, base.top);
            const visBottom = Math.min(vh, base.bottom);
            const visW = Math.max(1, visRight - visLeft);
            const visH = Math.max(1, visBottom - visTop);
            // Cap estimated height to visible height (element may be short like 36px)
            const estH = Math.max(20, Math.min(visH, fontSize * 1.8));
            // Center text horizontally on visible portion
            let x = visLeft + (visW - Math.min(estW, visW)) / 2;
            const align = (cs.textAlign || '').toLowerCase();
            if (align.includes('left') || align.includes('start'))
                x = visLeft + 8;
            if (align.includes('right') || align.includes('end'))
                x = visRight - estW - 8;
            // Position text vertically within visible area
            const y = visH > estH * 2.5 ? (visBottom - estH - 8) : (visTop + (visH - estH) / 2);
            return clampRectToViewport({ x, y, width: Math.min(estW, visW), height: estH });
        };
        const getTightTextRect = (el) => {
            const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            while (tw.nextNode()) {
                const n = tw.currentNode;
                if (!(n.textContent || '').trim())
                    continue;
                try {
                    const r = document.createRange();
                    r.selectNodeContents(n);
                    for (const cr of Array.from(r.getClientRects())) {
                        if (cr.width < 1 || cr.height < 1)
                            continue;
                        minX = Math.min(minX, cr.x);
                        minY = Math.min(minY, cr.y);
                        maxX = Math.max(maxX, cr.x + cr.width);
                        maxY = Math.max(maxY, cr.y + cr.height);
                    }
                }
                catch { }
            }
            if (!isFinite(minX))
                return null;
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        };
        const overlayCandidates = document.querySelectorAll('section p, section a, section span, section button');
        for (const el of overlayCandidates) {
            if (el.closest('[pnl], #booking, #menu, #mobile, #bar, #scrollbar, header, nav'))
                continue;
            const cs = window.getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none')
                continue;
            // Skip invisible-text trick elements: font:0/0, fontSize:0, text-indent:-9999
            const fSize = parseFloat(cs.fontSize);
            const isInvisibleFont = fSize === 0 || cs.font?.includes('0/0') || cs.font?.includes('0 /');
            const isTextIndentHidden = parseInt(cs.textIndent) < -9000;
            const isColorTransparent = cs.color === 'transparent' || cs.color === 'rgba(0, 0, 0, 0)';
            if (isInvisibleFont || isTextIndentHidden) {
                const rawT = (el.textContent || '').trim();
                if (/gallery/i.test(rawT))
                    _dbg.push(`[GALLERY-FB] "${rawT}" SKIP: invisible font trick (font=${cs.font?.substring(0, 30)} textIndent=${cs.textIndent})`);
                continue;
            }
            const rawText = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (rawText.length < 3 || rawText.length > 48 || !/[A-Za-z]/.test(rawText))
                continue;
            const isGalleryDbg = /gallery/i.test(rawText);
            let textColor = toHex(cs.color);
            if (!textColor) {
                const inFB = isInFullBleedImageSection(el);
                if (inFB) {
                    textColor = '#FFFFFF';
                    if (isGalleryDbg)
                        _dbg.push(`[GALLERY-FB] "${rawText}" textColor=null → fallback #FFFFFF (fullBleed, css.color=${cs.color})`);
                }
                else {
                    if (isGalleryDbg)
                        _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: textColor=null (color=${cs.color})`);
                    continue;
                }
            }
            const parent = el.parentElement || el;
            const inFullBleed = isInFullBleedImageSection(el);
            const isOverlay = isOverlayLikeText(el) || (parent ? isOverlayLikeText(parent) : false) || inFullBleed;
            if (!isOverlay) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: not overlay, not fullBleed`);
                continue;
            }
            if (cs.opacity === '0' && inFullBleed) {
                el.style.setProperty('opacity', '1', 'important');
            }
            // Deduplicate fallback by TEXT CONTENT (not position) — same text on same loop = 1 entry
            const textDedupeKey = `fb_text_${normalizeTextForKey(rawText)}_${currentLoopIndex}`;
            if (processedTextKeys.has(textDedupeKey))
                continue;
            const rr = getTightTextRect(el);
            const PAD = 4;
            let rect;
            let hasRealTextRect = false;
            if (rr && rr.width > 4 && rr.height > 4) {
                hasRealTextRect = true;
                rect = clampRectToViewport({ x: rr.x - PAD, y: rr.y - PAD, width: rr.width + PAD * 2, height: rr.height + PAD * 2 });
            }
            else {
                // Text nodes have 0x0 rect (CSS-rendered text) — estimate where the text appears.
                // Use buildEstimatedTextRect which positions text at the visual center/bottom of element.
                rect = buildEstimatedTextRect(el, cs, rawText);
                if (isGalleryDbg) {
                    const elRect = el.getBoundingClientRect();
                    _dbg.push(`[GALLERY-FB] "${rawText}" textRect=null, elRect=(${Math.round(elRect.x)},${Math.round(elRect.y)},${Math.round(elRect.width)}x${Math.round(elRect.height)}) → estimated=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)})`);
                }
            }
            // If we already have a real text rect, do not replace it with an estimated visible rect.
            // That can produce false-positive crops from texture-only areas when text is still off-screen.
            if (hasRealTextRect && (rect.width < 8 || rect.height < 8)) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: real text rect is off-screen after clamp`);
                continue;
            }
            // Suspiciously large "real text" boxes are usually line boxes, not glyph bounds.
            // Skip them for short labels and wait for a better frame.
            if (hasRealTextRect && rawText.length <= 40 && (rect.width > 520 || rect.height > 180)) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: suspicious real text box ${Math.round(rect.width)}x${Math.round(rect.height)}`);
                continue;
            }
            // For synthetic rects only: keep a safety re-estimate.
            if (!hasRealTextRect && (rect.width > 420 || rect.height > 180 || rect.width < 8 || rect.height < 8)) {
                rect = buildEstimatedTextRect(el, cs, rawText);
            }
            if (rect.width < 8 || rect.height < 8)
                continue;
            if (!isRectViewportVisible(rect, 0.08, 16, 10)) {
                if (isGalleryDbg)
                    _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: not vp-visible rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)})`);
                continue;
            }
            // Skip text occluded by cookie dialog (but not text inside the dialog)
            if (!el.closest('#CybotCookiebotDialog, [id*="onetrust" i], [id*="usercentrics" i], [id*="cookie" i][role="dialog"], [id*="consent" i][role="dialog"]')) {
                if (isOccludedByCookieDialog(rect)) {
                    if (isGalleryDbg)
                        _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: occluded by cookie dialog`);
                    continue;
                }
            }
            let effectiveBg;
            if (inFullBleed) {
                effectiveBg = 'IMAGE_STACKED';
            }
            else {
                const hasMediaOverlap = detectMediaOverlapForRect(rect, el) || detectMediaOverlapForRect(rect, parent);
                if (!hasMediaOverlap) {
                    if (isGalleryDbg)
                        _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: no media overlap`);
                    continue;
                }
                effectiveBg = resolveEffectiveBg(rect.x + rect.width / 2, rect.y + rect.height / 2, el.firstChild || el, el);
                if (!effectiveBg || effectiveBg !== 'IMAGE_STACKED') {
                    if (isGalleryDbg)
                        _dbg.push(`[GALLERY-FB] "${rawText}" SKIP: bg=${effectiveBg}`);
                    continue;
                }
            }
            const isInFinal = !!el.closest('#final');
            if (isGalleryDbg)
                _dbg.push(`[GALLERY-FB] "${rawText}" FOUND loop=${currentLoopIndex} bg=${effectiveBg} color=${textColor} fullBleed=${inFullBleed}`);
            viewTextNodes.push({
                text: rawText.substring(0, 100), tagName: el.tagName.toLowerCase(), textColor,
                fontFamily: (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim(),
                fontWeight: cs.fontWeight, fontSize: cs.fontSize, effectiveBg, rect,
                captureIndex: currentLoopIndex, hasArrow: false, isInFinal,
                isStaticBehindMain: isInFinal && mainIsTransformed
            });
            processedTextKeys.add(textDedupeKey);
        }
    }
    // ── Arrow detection ──
    for (const el of document.querySelectorAll('a, div, span, button, li')) {
        if (el.closest('[pnl], #booking, #menu, #mobile'))
            continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
            continue;
        const after = window.getComputedStyle(el, '::after');
        if (!after.backgroundImage?.includes('url'))
            continue;
        const w = parseFloat(after.width), h = parseFloat(after.height);
        if (isNaN(w) || w <= 5 || isNaN(h) || h <= 5)
            continue;
        const pRect = el.getBoundingClientRect();
        let ax, ay;
        if (after.position === 'absolute' || after.position === 'fixed') {
            const r = parseFloat(after.right), t = parseFloat(after.top), l = parseFloat(after.left), b = parseFloat(after.bottom);
            ax = !isNaN(r) ? pRect.right - r - w : !isNaN(l) ? pRect.left + l : pRect.left + (pRect.width - w) / 2;
            ay = !isNaN(t) ? pRect.top + t : !isNaN(b) ? pRect.bottom - b - h : pRect.top + (pRect.height - h) / 2;
        }
        else {
            ax = pRect.right - w;
            ay = pRect.top + (pRect.height - h) / 2;
        }
        const PAD = 10;
        const fRect = { x: Math.max(0, ax - PAD), y: Math.max(0, ay - PAD), width: w + PAD * 2, height: h + PAD * 2 };
        const arrowKey = `ARROW_${Math.round(fRect.x)}_${Math.round(fRect.y)}`;
        const isVisible = fRect.y < vh && (fRect.y + fRect.height) > 0 && fRect.x < vw && (fRect.x + fRect.width) > 0;
        if (!isVisible || processedArrowKeys.has(arrowKey))
            continue;
        const isInFinal = !!el.closest('#final');
        let bg = getVisualBackgroundAtPoint(fRect.x + fRect.width / 2, fRect.y + fRect.height / 2, null, true);
        if (bg === 'TRANSPARENT' || bg === '#FFFFFF')
            bg = 'IMAGE_STACKED';
        viewTextNodes.push({
            text: '[Arrow Icon]', tagName: 'icon', textColor: '#FFFFFF',
            fontFamily: 'N/A', fontWeight: '400', fontSize: '0px', effectiveBg: bg,
            rect: { ...fRect, scrollOffset: scrollY }, captureIndex: currentLoopIndex,
            hasArrow: true, isIconOnly: true, isInFinal,
            isStaticBehindMain: isInFinal && mainIsTransformed
        });
        processedArrowKeys.add(arrowKey);
    }
    // ── Non-text elements ──
    const nonTextElements = [];
    const processedNonTextKeys = new Set();
    // Helper to normalize color values to #RRGGBB hex format
    const normalizeToHex = (color) => {
        if (!color)
            return null;
        const c = color.trim().toLowerCase();
        if (c === 'white' || c === '#fff')
            return '#FFFFFF';
        if (c === 'black' || c === '#000')
            return '#000000';
        // Short hex: #abc → #AABBCC
        const shortHex = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
        if (shortHex)
            return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toUpperCase();
        // Full hex
        if (/^#[0-9a-f]{6}$/i.test(c))
            return c.toUpperCase();
        // rgb(r, g, b) or rgba(r, g, b, a)
        const rgbMatch = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]), g = parseInt(rgbMatch[2]), b = parseInt(rgbMatch[3]);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
        }
        return color.toUpperCase(); // return as-is, uppercased
    };
    const computeFilteredColor = (filterStr) => {
        if (!filterStr || filterStr === 'none')
            return null;
        const fns = [];
        const regex = /(invert|sepia|saturate|hue-rotate|brightness|contrast|grayscale|opacity)\(([^)]+)\)/g;
        let match;
        while ((match = regex.exec(filterStr)) !== null) {
            let val = parseFloat(match[2]);
            if (match[2].includes('%'))
                val /= 100;
            if (match[1] === 'hue-rotate')
                val = parseFloat(match[2]);
            fns.push({ name: match[1], value: val });
        }
        if (!fns.length)
            return null;
        let r = 0, g = 0, b = 0;
        for (const fn of fns) {
            switch (fn.name) {
                case 'invert':
                    r = r * (1 - fn.value) + (255 - r) * fn.value;
                    g = g * (1 - fn.value) + (255 - g) * fn.value;
                    b = b * (1 - fn.value) + (255 - b) * fn.value;
                    break;
                case 'sepia': {
                    const a = fn.value, sr = .393 * r + .769 * g + .189 * b, sg = .349 * r + .686 * g + .168 * b, sb = .272 * r + .534 * g + .131 * b;
                    r = r * (1 - a) + sr * a;
                    g = g * (1 - a) + sg * a;
                    b = b * (1 - a) + sb * a;
                    break;
                }
                case 'saturate': {
                    const s = fn.value, gr = .2126 * r + .7152 * g + .0722 * b;
                    r = gr + s * (r - gr);
                    g = gr + s * (g - gr);
                    b = gr + s * (b - gr);
                    break;
                }
                case 'hue-rotate': {
                    const a = fn.value * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
                    const rr = (.213 + co * .787 - si * .213) * r + (.715 - co * .715 - si * .715) * g + (.072 - co * .072 + si * .928) * b;
                    const gg = (.213 - co * .213 + si * .143) * r + (.715 + co * .285 + si * .140) * g + (.072 - co * .072 - si * .283) * b;
                    const bb = (.213 - co * .213 - si * .787) * r + (.715 - co * .715 + si * .715) * g + (.072 + co * .928 + si * .072) * b;
                    r = rr;
                    g = gg;
                    b = bb;
                    break;
                }
                case 'brightness':
                    r *= fn.value;
                    g *= fn.value;
                    b *= fn.value;
                    break;
                case 'contrast': {
                    const c = fn.value;
                    r = (r - 128) * c + 128;
                    g = (g - 128) * c + 128;
                    b = (b - 128) * c + 128;
                    break;
                }
                case 'grayscale': {
                    const a = fn.value, gr = .2126 * r + .7152 * g + .0722 * b;
                    r = r * (1 - a) + gr * a;
                    g = g * (1 - a) + gr * a;
                    b = b * (1 - a) + gr * a;
                    break;
                }
            }
        }
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    };
    for (const el of document.querySelectorAll('a, button')) {
        if (el.closest('[pnl], #booking, #menu, #mobile'))
            continue;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden')
            continue;
        if (!cs.backgroundImage || cs.backgroundImage === 'none' || !cs.backgroundImage.includes('url'))
            continue;
        const fontSize = parseFloat(cs.fontSize);
        const colorTransparent = cs.color === 'transparent' || cs.color === 'rgba(0, 0, 0, 0)';
        const textIndentHidden = parseInt(cs.textIndent) < -9000;
        const fontZero = fontSize === 0 || cs.font?.includes('0/0') || cs.font?.includes('0 /');
        const overflowHidden = cs.overflow === 'hidden' && (cs.whiteSpace === 'nowrap' || textIndentHidden);
        if (!fontZero && !colorTransparent && !textIndentHidden && !overflowHidden)
            continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 5 || rect.height < 5 || rect.y + rect.height < 0 || rect.y > vh || rect.x + rect.width < 0 || rect.x > vw)
            continue;
        const key = `nontext_bgimg_${Math.round(rect.x)}_${Math.round(rect.y)}`;
        if (processedNonTextKeys.has(key))
            continue;
        const bgMatch = cs.backgroundImage.match(/url\(['"]?([^'")]+)['"]?\)/);
        const bgUrl = bgMatch ? bgMatch[1] : '';
        const isSvg = bgUrl.includes('.svg');
        const bgColor = getVisualBackgroundAtPoint(rect.x + rect.width / 2, rect.y + rect.height / 2, null, true);
        const classes = el.className?.toString() || '';
        let elType = 'icon-bg-image';
        if (classes.includes('season') || classes.includes('toggle'))
            elType = 'ui-control';
        nonTextElements.push({
            type: elType, label: (el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || 'Icon').substring(0, 80),
            tagName: el.tagName, src: bgUrl.substring(0, 200),
            cssFilter: cs.filter !== 'none' ? cs.filter : null,
            estimatedColor: isSvg ? computeFilteredColor(cs.filter) : null,
            bgColor: bgColor || 'TRANSPARENT',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            captureIndex: currentLoopIndex, href: el.href || null
        });
        processedNonTextKeys.add(key);
    }
    for (const img of document.querySelectorAll('a img, button img')) {
        if (img.closest('[pnl], #booking, #menu, #mobile'))
            continue;
        const rect = img.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || rect.y + rect.height < 0 || rect.y > vh || rect.x + rect.width < 0 || rect.x > vw)
            continue;
        const key = `nontext_img_${Math.round(rect.x)}_${Math.round(rect.y)}_${img.src.split('/').pop()}`;
        if (processedNonTextKeys.has(key))
            continue;
        const cs = window.getComputedStyle(img);
        if (cs.display === 'none' || cs.visibility === 'hidden')
            continue;
        if (rect.width <= 2 || rect.height <= 2 || (rect.width > 250 && rect.height > 250))
            continue;
        const parentLink = img.closest('a');
        const isSvg = img.src.includes('.svg');
        const bgColor = getVisualBackgroundAtPoint(rect.x + rect.width / 2, rect.y + rect.height / 2, null, true);
        nonTextElements.push({
            type: (rect.width <= 50 && rect.height <= 50) ? 'social-icon' : 'partner-logo',
            label: img.alt || parentLink?.textContent?.trim() || img.src.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Image',
            tagName: 'IMG', src: img.src.substring(0, 200), alt: img.alt || '',
            cssFilter: cs.filter !== 'none' ? cs.filter : null,
            estimatedColor: isSvg ? computeFilteredColor(cs.filter) : null,
            bgColor: bgColor || 'TRANSPARENT',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            captureIndex: currentLoopIndex, href: parentLink?.href || null,
            imgWidth: rect.width, imgHeight: rect.height, isSvg
        });
        processedNonTextKeys.add(key);
    }
    // ── Cookie consent toggles (e.g., Cookiebot sliders) as non-text UI controls ──
    for (const slider of document.querySelectorAll('#CybotCookiebotDialog .CybotCookiebotDialogBodyLevelButtonSlider, [id*="cookiebot" i] .CybotCookiebotDialogBodyLevelButtonSlider')) {
        const cs = window.getComputedStyle(slider);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')
            continue;
        const rect = slider.getBoundingClientRect();
        if (rect.width < 12 || rect.height < 10)
            continue;
        if (rect.y + rect.height < 0 || rect.y > vh || rect.x + rect.width < 0 || rect.x > vw)
            continue;
        const key = `nontext_cookie_slider_${Math.round(rect.x)}_${Math.round(rect.y)}_${Math.round(rect.width)}_${Math.round(rect.height)}`;
        if (processedNonTextKeys.has(key))
            continue;
        const knobStyle = window.getComputedStyle(slider, '::before');
        let estimatedColor = toHex(knobStyle.backgroundColor) || toHex(knobStyle.borderColor);
        if (!estimatedColor && knobStyle.content && knobStyle.content !== 'none') {
            estimatedColor = '#FFFFFF';
        }
        const sliderBg = toHex(cs.backgroundColor) ||
            getVisualBackgroundAtPoint(rect.x + rect.width / 2, rect.y + rect.height / 2, null, true) ||
            'TRANSPARENT';
        const wrapper = slider.closest('.CybotCookiebotDialogBodyLevelButtonWrapper');
        const labelText = (wrapper?.querySelector('label strong')?.textContent ||
            wrapper?.querySelector('label')?.textContent ||
            'Cookie toggle').replace(/\s+/g, ' ').trim().substring(0, 80);
        nonTextElements.push({
            type: 'ui-control',
            label: labelText || 'Cookie toggle',
            tagName: slider.tagName,
            src: '',
            cssFilter: cs.filter !== 'none' ? cs.filter : null,
            estimatedColor: estimatedColor || null,
            bgColor: sliderBg,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            captureIndex: currentLoopIndex,
            href: null
        });
        processedNonTextKeys.add(key);
    }
    // ── Inline SVG logos in header (e.g., Belnord: header .logo svg with fill:#fff) ──
    for (const svg of document.querySelectorAll('header svg, .logo svg, nav svg, .navbar-brand svg')) {
        const rect = svg.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10 || rect.y + rect.height < 0 || rect.y > vh || rect.x + rect.width < 0 || rect.x > vw)
            continue;
        const key = `nontext_svg_${Math.round(rect.x)}_${Math.round(rect.y)}`;
        if (processedNonTextKeys.has(key))
            continue;
        const cs = window.getComputedStyle(svg);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')
            continue;
        // Skip if inside footer or partner section
        if (svg.closest('.logos, .partners, footer ul, footer'))
            continue;
        // Get fill color from SVG
        let svgFillColor = null;
        const gFill = svg.querySelector('g[fill]');
        if (gFill)
            svgFillColor = gFill.getAttribute('fill');
        if (!svgFillColor) {
            const paths = svg.querySelectorAll('path[fill]');
            if (paths.length > 0)
                svgFillColor = paths[0].getAttribute('fill');
        }
        if (!svgFillColor)
            svgFillColor = svg.getAttribute('fill');
        // Determine bg color at center of SVG
        const bgColor = getVisualBackgroundAtPoint(rect.x + rect.width / 2, rect.y + rect.height / 2, null, true);
        const parentLink = svg.closest('a');
        nonTextElements.push({
            type: 'inline-svg-icon',
            label: svg.querySelector('title')?.textContent?.trim() || parentLink?.textContent?.trim() || 'SVG Logo',
            tagName: 'SVG', src: '',
            cssFilter: null,
            estimatedColor: normalizeToHex(svgFillColor) || null,
            bgColor: bgColor || 'IMAGE_STACKED',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            captureIndex: currentLoopIndex, href: parentLink?.href || null,
            isSvg: true
        });
        processedNonTextKeys.add(key);
    }
    // ── Hamburger menu icons (e.g., Belnord: .hamburger span with background color) ──
    for (const hamburger of document.querySelectorAll('.hamburger, .hamburger-container, [class*="hamburger"], [class*="nav-toggle"], button.menu-toggle')) {
        const rect = hamburger.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10 || rect.y + rect.height < 0 || rect.y > vh || rect.x + rect.width < 0 || rect.x > vw)
            continue;
        const key = `nontext_hamburger_${Math.round(rect.x)}_${Math.round(rect.y)}`;
        if (processedNonTextKeys.has(key))
            continue;
        const cs = window.getComputedStyle(hamburger);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')
            continue;
        // Find the colored spans/lines inside
        let lineColor = null;
        const spans = hamburger.querySelectorAll('span, div, i');
        for (const span of spans) {
            const scs = window.getComputedStyle(span);
            if (scs.backgroundColor && scs.backgroundColor !== 'transparent' && scs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                lineColor = scs.backgroundColor;
                break;
            }
        }
        if (!lineColor) {
            // Check the hamburger element itself
            if (cs.backgroundColor && cs.backgroundColor !== 'transparent' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                lineColor = cs.backgroundColor;
            }
        }
        if (!lineColor)
            continue; // Can't determine color, skip
        const bgColor = getVisualBackgroundAtPoint(rect.x + rect.width / 2, rect.y + rect.height / 2, null, true);
        nonTextElements.push({
            type: 'hamburger-icon',
            label: hamburger.getAttribute('aria-label') || 'Menu',
            tagName: hamburger.tagName, src: '',
            cssFilter: null,
            estimatedColor: normalizeToHex(lineColor),
            bgColor: bgColor || 'IMAGE_STACKED',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            captureIndex: currentLoopIndex, href: null
        });
        processedNonTextKeys.add(key);
    }
    const hasFinalSection = (() => {
        const f = document.querySelector('#final');
        if (!f)
            return false;
        const r = f.getBoundingClientRect();
        return r.top < vh && r.bottom > 0 && r.height > 0;
    })();
    return {
        localBgs, localImgs, viewTextNodes, localTotalScore, nonTextElements,
        visualHash: visibleContentString,
        hasFinalSection,
        hasStaticFinalBehindMain: !!(document.querySelector('#final') && mainIsTransformed),
        debugLog: _dbg
    };
}
//# sourceMappingURL=viewportChunkScanner.js.map