const express = require('express');
const puppeteer = require('puppeteer');
const tinycolor = require('tinycolor2');
const WCAGContrast = require('wcag-contrast');
const app = express();
const PORT = 3000;

// O singură instanță de browser, gestionată central
let browser; 
let launchingPromise = null;
let lastUseTs = Date.now();
const BROWSER_IDLE_MS = 5 * 60 * 1000; // 5 minute idle => închidere
let idleTimer = null;

app.use(express.static('public')); // Servește fișierele statice din folderul 'public'
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Middleware pentru a înțelege JSON

function scheduleIdleClose() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
        if (browser && Date.now() - lastUseTs >= BROWSER_IDLE_MS) {
            console.log('[Puppeteer] Închidere automată după idle.');
            try { await browser.close(); } catch {}
            browser = null;
        }
    }, BROWSER_IDLE_MS + 2000);
}

// NOUA VERSUNE, MAI ROBUSTĂ, A LUI initializeBrowser
async function initializeBrowser() {
    // Dacă promisiunea de lansare deja există, o așteptăm și returnăm rezultatul ei.
    if (launchingPromise) {
        await launchingPromise;
    }

    // Dacă, după ce am așteptat (sau dacă nu a existat o promisiune),
    // browser-ul este gata, îl returnăm.
    if (browser && browser.isConnected()) {
        return browser;
    }

    // Dacă ajungem aici, înseamnă că trebuie să lansăm un browser nou.
    // Creăm o nouă promisiune și o stocăm.
    console.log('[Puppeteer] Lansare instanță nouă de browser...');
    launchingPromise = new Promise(async (resolve, reject) => {
        try {
            const newBrowser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                ],
                defaultViewport: null
            });

            newBrowser.on('disconnected', () => {
                console.log('[Puppeteer] Browser deconectat.');
                browser = null; // Resetăm variabila globală
            });

            // Setăm variabila globală DOAR după ce lansarea a reușit
            browser = newBrowser;
            resolve(browser);
        } catch (err) {
            console.error('[Puppeteer] Eroare la launch:', err.message);
            browser = null; // Asigurăm starea curată
            reject(err);
        } finally {
            // Resetăm promisiunea DOAR după ce s-a terminat totul
            launchingPromise = null;
        }
    });

    // Așteptăm ca noua promisiune să se termine și returnăm rezultatul
    return await launchingPromise;
}

async function getPage({ incognito = false } = {}) {
    const br = await initializeBrowser();

    if (!br || !br.isConnected()) {
        throw new Error('Nu s-a putut obține o instanță validă de browser.');
    }
    lastUseTs = Date.now();
    scheduleIdleClose();

    if (incognito) {
        const ctx = await br.createIncognitoBrowserContext();
        const page = await ctx.newPage();
        page._ownContext = ctx; // marcăm pentru cleanup ulterior
        return page;
    }
    return await br.newPage();
}

// Aici se întâmplă magia. Extragem date mult mai valoroase.
async function analyzeUrl(url) {
    const page = await getPage({ incognito: false });

    
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Așteptare inteligentă pentru fonturi și elemente dinamice
        await page.evaluate(() => Promise.all([
            document.fonts.ready,
            new Promise(resolve => setTimeout(resolve, 2000)) // O pauză finală pentru scripturi JS
        ]));

        const analysisData = await page.evaluate(async () => {
            // --- ETAPA 1: DEFINIȚII FUNCȚII AJUTĂTOARE ---
            const rgbToHex = (val) => {
                if (!val) return null;
                const hexMatch = val.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
                if (hexMatch) return val.toUpperCase();
                const m = val.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
                if (!m) return null;
                const r = Math.round(parseFloat(m[1])), g = Math.round(parseFloat(m[2])), b = Math.round(parseFloat(m[3]));
                const toHex = (n) => n.toString(16).padStart(2,'0').toUpperCase();
                return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            };

            const isTransparent = (v) => {
                if (!v) return true;
                const val = v.toLowerCase();
                return val === 'transparent' || val === 'rgba(0, 0, 0, 0)' || val === 'rgba(0,0,0,0)';
            };

            const getSolidColor = (element) => {
                if (!element) return null;
                let cs = window.getComputedStyle(element);
                if (!isTransparent(cs.backgroundColor)) return rgbToHex(cs.backgroundColor);
                cs = window.getComputedStyle(element, '::before');
                if (!isTransparent(cs.backgroundColor)) return rgbToHex(cs.backgroundColor);
                cs = window.getComputedStyle(element, '::after');
                if (!isTransparent(cs.backgroundColor)) return rgbToHex(cs.backgroundColor);
                return null;
            };
            
            const effectiveBackgroundForText = (el) => {
                let node = el;
                while (node) {
                    const solidColor = getSolidColor(node);
                    if (solidColor) return solidColor;
                    if (node.tagName === 'HTML') break;
                    node = node.parentElement;
                }
                return '#FFFFFF';
            };
            
            const getVisibleBackgroundColorFromPoint = (x, y) => {
                const elementsStack = document.elementsFromPoint(x, y);
                for (const element of elementsStack) {
                    const solidColor = getSolidColor(element);
                    if (solidColor) return solidColor;
                }
                return null;
            };

            // --- ETAPA 2: INIȚIALIZARE ȘI COLECTARE DATE ---
            const results = {
                textElements: [],
                backgroundColors: {},
                totalSurface: window.innerWidth * window.innerHeight,
                pageMetrics: {
                    scrollWidth: document.body.scrollWidth,
                    scrollHeight: document.body.scrollHeight,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                }
            };

            for (const el of document.querySelectorAll('html, body *')) {
                const cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden') continue;
                
                const rect = el.getBoundingClientRect();
                if (rect.width < 1 || rect.height < 1) continue;

                const hasTextNode = Array.from(el.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0);

                if (hasTextNode) {
                    const textColor = rgbToHex(cs.color);
                    let node = el;
                    let bgColor = null;
                    while (node) {
                        const solidColor = getSolidColor(node);
                        if (solidColor) { bgColor = solidColor; break; }
                        if (node.tagName === 'HTML') break;
                        node = node.parentElement;
                    }
                    bgColor = bgColor || '#FFFFFF';

                    if (textColor) {
                        results.textElements.push({
                            text: el.textContent.trim().substring(0, 100),
                            tagName: el.tagName.toLowerCase(),
                            textColor,
                            bgColor,
                            fontFamily: cs.fontFamily.split(',')[0].trim().replace(/['"]/g, ''),
                            fontSize: parseInt(cs.fontSize, 10),
                            isBold: parseInt(cs.fontWeight, 10) >= 700,
                        });
                    }
                }
            }

            // --- ETAPA 3: ANALIZA SUPRAFEȚEI (CU SCROLL UNIVERSAL) ---
            const { scrollWidth, scrollHeight, viewportWidth, viewportHeight } = results.pageMetrics;
            const hits = new Map();
            const step = 32; // Mărim pasul și mai mult pentru performanță
            
            // Revenim la început
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 500));
            
            let yScroll = 0;
            while (yScroll < scrollHeight) {
                let xScroll = 0;
                while (xScroll < scrollWidth) {
                    // Scanăm viewport-ul curent
                    for (let y = 0; y < viewportHeight; y += step) {
                        for (let x = 0; x < viewportWidth; x += step) {
                            const stack = document.elementsFromPoint(x, y);
                            for (const element of stack) {
                                const solidColor = getSolidColor(element);
                                if (solidColor) {
                                    hits.set(solidColor, (hits.get(solidColor) || 0) + 1);
                                    break;
                                }
                            }
                        }
                    }
                    xScroll += viewportWidth;
                    window.scrollTo(xScroll, yScroll);
                    await new Promise(r => setTimeout(r, 200));
                }
                yScroll += viewportHeight;
                window.scrollTo(0, yScroll);
                await new Promise(r => setTimeout(r, 200));
            }

            const sampleArea = step * step;
            hits.forEach((count, color) => {
                results.backgroundColors[color] = { surface: count * sampleArea };
            });

            return results;
        });
        
        // --- PROCESAREA DATELOR PE SERVER ---
        // Mutăm aici toată logica grea, inclusiv agregarea culorilor și fonturilor
        // --- PROCESAREA DATELOR PE SERVER (VERSIUNEA FINALĂ) ---
        const processResults = (data) => {
            // A) Procesăm culorile de fundal cu normalizare
            const totalSurfaceSampled = Object.values(data.backgroundColors).reduce((sum, stats) => sum + stats.surface, 0);

            const sortedBackgrounds = Object.entries(data.backgroundColors)
                .map(([color, stats]) => ({
                    color,
                    surface: stats.surface,
                    // FIX #2: Normalizăm procentajul pe baza suprafeței eșantionate reale
                    percentage: totalSurfaceSampled > 0 ? ((stats.surface / totalSurfaceSampled) * 100).toFixed(2) : "0.00"
                }))
                .sort((a, b) => b.surface - a.surface);
            
            // B) Agregăm și procesăm datele din textElements
            const colorAggregator = {};
            const fontAggregator = {};
            const contrastIssues = [];

            for (const el of data.textElements) {
                // Agregare culori text
                if (el.textColor && el.textColor !== '#000000') {
                    if (!colorAggregator[el.textColor]) colorAggregator[el.textColor] = { score: 0, elements: new Set() };
                    colorAggregator[el.textColor].score += el.text.length;
                    colorAggregator[el.textColor].elements.add(el.tagName);
                }

                // Agregare fonturi cu filtru
                // FIX #1: Adăugăm un filtru robust pentru a elimina valorile absurde precum "a"
                if (el.fontFamily && el.fontFamily.length > 2 && !el.fontFamily.includes(',')) {
                    fontAggregator[el.fontFamily] = (fontAggregator[el.fontFamily] || 0) + 1;
                }
                
                // Calcul contrast
                const contrastRatio = WCAGContrast.hex(el.textColor, el.bgColor);
                const isLargeText = el.fontSize >= 18.66 || (el.fontSize >= 14 && el.isBold);
                const requiredRatio = isLargeText ? 3 : 4.5;
                
                if (contrastRatio < requiredRatio) {
                    contrastIssues.push({
                        text: el.text,
                        textColor: el.textColor,
                        bgColor: el.bgColor,
                        contrastRatio: contrastRatio.toFixed(2),
                        status: 'FAIL',
                        wcagLevel: 'AA',
                        requiredRatio: `${requiredRatio}:1`
                    });
                }
            }

            const sortedColors = Object.entries(colorAggregator)
                .sort((a, b) => b[1].score - a[1].score)
                .map(([color, stats]) => ({ color, score: stats.score, elements: [...stats.elements].slice(0,5) }));

            const sortedFonts = Object.entries(fontAggregator)
                .sort((a,b) => b[1] - a[1])
                .map(([font, count]) => ({ font, count }));

            // C) Returnăm structura finală
            return {
                url,
                backgrounds: sortedBackgrounds.slice(0, 5),
                colors: sortedColors.slice(0, 5),
                fonts: sortedFonts.slice(0, 5),
                accessibility: {
                    contrastIssues: contrastIssues.slice(0, 10)
                }
            };
        };
        
        return processResults(analysisData);

    } catch (error) {
        console.error(`Eroare la procesarea URL-ului ${url}:`, error.message);
        return { url, error: `Nu am putut analiza acest URL. Motiv: ${error.message.substring(0, 100)}` };
    } finally {
        if (page) await page.close();
    }
}

app.post('/analyze', async (req, res) => {
    const urls = req.body.urls.split(/[\n,]+/).map(u => u.trim()).filter(u => u.startsWith('http'));

    if (urls.length === 0) {
        return res.status(400).json({ error: "Te rog introdu cel puțin un URL valid." });
    }
    
    try {
        await initializeBrowser();
        // Folosim Promise.allSettled pentru a nu opri tot procesul dacă un singur URL eșuează
        const results = await Promise.allSettled(urls.map(url => analyzeUrl(url)));
        
        // Extragem rezultatele, inclusiv erorile individuale
        // NOU ȘI ROBUST
        const finalData = results.map((r, index) => {
            if (r.status === 'fulfilled') {
                return r.value;
            }
            // Dacă promisiunea a fost respinsă, construim un obiect de eroare standardizat
            console.error(`[Eroare la procesare] URL: ${urls[index]}, Motiv: ${r.reason.message}`);
            return {
                url: urls[index],
                error: r.reason.message || 'Eroare necunoscută la procesarea URL-ului.'
            };
        });
        
        res.json(finalData);
    } catch (error) {
        console.error("A apărut o eroare majoră:", error.message);
        res.status(500).json({ error: "Eroare de server la procesarea URL-urilor." });
    }
});

// Pornim serverul doar după ce browser-ul este gata
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    // Nu mai inițializăm aici, o facem la primul request (lazy initialization)
});