// Tiny static file server for local development. No dependencies.
//   npm start            -> http://localhost:5173
//   PORT=3000 npm start  -> http://localhost:3000
// If you change the port, add the new address to GYM_CORS_ORIGINS when you start the backend.
//
// It also forwards every /api/ request to the backend (default http://127.0.0.1:8080, change it with
// API_PROXY=http://host:port). With window.FOUNDRY_API_BASE = window.location.origin in config.js the browser only
// ever talks to this server, so the backend can listen on localhost of the same machine and stay closed to the world.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BACKEND = new URL(process.env.API_PROXY || 'http://127.0.0.1:8080');
const PORT = Number(process.env.PORT) || 5173;
const SERVE = new Set(['index.html', 'styles.css', 'app.js', 'i18n.js', 'config.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

/* Pass an /api/ request on to the backend and stream the answer back (cookies included). */
function proxy(req, res) {
  const headers = Object.assign({}, req.headers, { host: BACKEND.host });
  // A page calling its own server is not a cross-site request, so do not present it to the backend as one.
  delete headers.origin;
  headers['x-forwarded-for'] = (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'] + ', ' : '') + req.socket.remoteAddress;
  const up = http.request({ hostname: BACKEND.hostname, port: BACKEND.port || 80, path: req.url, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'The backend is not reachable. Is it running on ' + BACKEND.host + '?' }));
  });
  req.pipe(up);
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxy(req, res);
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
    console.log('/api/ requests are forwarded to ' + BACKEND.origin + ' (set API_PROXY to change).');
    console.log('Without the line "window.FOUNDRY_API_BASE = window.location.origin" in config.js the page calls the backend directly instead.');
    console.log('Leave this window open. Press Ctrl+C to stop.');
  });
