const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load environment variables from .env
require('dotenv').config();

const PORT = process.env.PORT || 8888;

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Route Netlify functions
    if (pathname.startsWith('/.netlify/functions/')) {
        const functionName = pathname.replace('/.netlify/functions/', '');
        const functionPath = path.join(__dirname, 'netlify', 'functions', `${functionName}.js`);
        
        if (!fs.existsSync(functionPath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Function ${functionName} not found` }));
            return;
        }

        // Read request body for POST/PUT requests
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                // Clear require cache to reload function code on change for hot-reloading
                delete require.cache[require.resolve(functionPath)];
                const { handler } = require(functionPath);

                const event = {
                    httpMethod: req.method,
                    headers: req.headers,
                    path: pathname,
                    queryStringParameters: parsedUrl.query,
                    body: body
                };

                const response = await handler(event, {});
                
                // Send response
                res.writeHead(response.statusCode || 200, {
                    'Content-Type': 'application/json',
                    ...(response.headers || {})
                });
                res.end(response.body || '');
            } catch (err) {
                console.error(`Error in function ${functionName}:`, err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error', details: err.message }));
            }
        });
        return;
    }

    // Serve static assets from public/
    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    
    // Prevent directory traversal
    const publicDir = path.join(__dirname, 'public');
    if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('File Not Found');
        return;
    }

    // MIME types mapping
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
    console.log(`🚀 SpokenEnglish Local Dev Server running at http://localhost:${PORT}`);
});
