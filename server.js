// Minimal static server. Open by default; set WAR_ROOM_USER + WAR_ROOM_PASS (min 12 chars) to require HTTP Basic Auth.
// Env: PORT (provided by the host).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const USER = process.env.WAR_ROOM_USER, PASS = process.env.WAR_ROOM_PASS;
const PROTECTED = Boolean(USER && PASS);
if ((USER || PASS) && !PROTECTED) { console.error('Set BOTH WAR_ROOM_USER and WAR_ROOM_PASS, or neither.'); process.exit(1); }
if (PROTECTED && PASS.length < 12) { console.error('WAR_ROOM_PASS must be at least 12 characters.'); process.exit(1); }
const sha = (s) => crypto.createHash('sha256').update(s).digest();
const okAuth = (h) => { if (!h?.startsWith('Basic ')) return false; const [u, ...p] = Buffer.from(h.slice(6), 'base64').toString().split(':'); return crypto.timingSafeEqual(sha(u), sha(USER)) & crypto.timingSafeEqual(sha(p.join(':')), sha(PASS)); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const base = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' };
  if (req.url === '/healthz') { res.writeHead(200, base); return res.end('ok'); }
  if (PROTECTED && !okAuth(req.headers.authorization)) { res.writeHead(401, { ...base, 'WWW-Authenticate': 'Basic realm="Auction War Room (private)", charset="UTF-8"' }); return res.end('Authentication required'); }
  let p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith(path.sep) || p === '.') p = path.join(p, 'index.html');
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403, base); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, base); return res.end('Not found'); }
    const hashed = /\/assets\//.test(file);
    res.writeHead(200, { ...base, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ...(hashed ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {}) });
    res.end(buf);
  });
}).listen(process.env.PORT || 3000, () => console.log(PROTECTED ? 'War Room listening (password protected)' : 'War Room listening (OPEN, no password)'));
