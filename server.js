// Tiny static file server for local development. No dependencies.
//   npm start            -> http://localhost:5173
//   PORT=3000 npm start  -> http://localhost:3000
// If you change the port, add the new address to GYM_CORS_ORIGINS when you start the backend.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;
const SERVE = new Set(['index.html', 'styles.css', 'app.js', 'i18n.js', 'config.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (!SERVE.has(name)) {
    if (path.extname(name)) { res.writeHead(404); return res.end('Not found'); }
    name = 'index.html'; // any other page path opens the app
  }
  fs.readFile(path.join(ROOT, name), (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
})
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use, probably by an earlier run of this server.`);
      console.error('Stop that one, or pick another port: PORT=3000 npm start');
      console.error('On Windows PowerShell: $env:PORT=3000; npm start');
    } else {
      console.error(err.message);
    }
    process.exit(1);
  })
  .listen(PORT, () => {
    console.log(`Foundry gym UI is running. Open http://localhost:${PORT}`);
    console.log('It expects the backend at http://localhost:8080 (see config.js).');
    console.log('Leave this window open. Press Ctrl+C to stop.');
  });
