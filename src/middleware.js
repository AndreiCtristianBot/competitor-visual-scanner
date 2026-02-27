import express from 'express';
export function setupMiddleware(app) {
    // CORS flexible pentru development
    app.use((req, res, next) => {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:3003'
        ];
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        }
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.header('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS')
            return res.sendStatus(200);
        next();
    });
    // Static serving, body parsers
    app.use(express.static('public'));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
}
//# sourceMappingURL=middleware.js.map