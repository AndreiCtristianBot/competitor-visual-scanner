import express from 'express';
import { PORT } from './config.js';
import { setupMiddleware } from './middleware.js';
import { initializeBrowser } from './browserManager.js';
import { analyzeUrl } from './analyzer.js';
const app = express();
setupMiddleware(app);
app.post('/analyze', async (req, res) => {
    try {
        const raw = req.body?.urls ?? '';
        const prefersColorScheme = req.body?.prefersColorScheme ?? 'light';
        // 2. Extragem valoarea din request (default false)
        const keepCookies = req.body?.keepCookies ?? false;
        const prefersReducedMotion = 'no-preference';
        const urls = raw
            .split(/[\n,]+/)
            .map((u) => u.trim())
            .filter((u) => u.startsWith('http'));
        if (!urls.length) {
            return res.status(400).json({ error: "Te rog introdu cel puțin un URL valid." });
        }
        await initializeBrowser();
        const results = await Promise.allSettled(urls.map((url) => 
        // 3. Pasăm keepCookies către funcția de analiză
        analyzeUrl(url, { prefersColorScheme, keepCookies })));
        const finalData = results.map((r, i) => {
            if (r.status === 'fulfilled')
                return r.value;
            console.error(`[Eroare la procesare] URL: ${urls[i]}, Motiv: ${r.reason?.message ?? String(r.reason)}`);
            return {
                url: urls[i],
                error: r.reason?.message ?? String(r.reason ?? 'Eroare necunoscută.')
            };
        });
        return res.json(finalData);
    }
    catch (err) {
        console.error('Eroare majoră:', err?.message ?? err);
        return res.status(500).json({ error: 'Eroare de server la procesarea URL-urilor.' });
    }
});
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
export default app;
//# sourceMappingURL=index.js.map