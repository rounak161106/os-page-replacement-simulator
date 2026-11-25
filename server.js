import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname);
const PORT = Number(process.env.PORT) || 3456;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const ALLOWED_COMMANDS = new Set([
  'NEXT',
  'PREV',
  'PLAY',
  'PAUSE',
  'TOGGLE_PLAY',
  'RESET',
  'GOTO_STEP',
  'SET_SPEED',
  'SET_ALGO',
  'SET_FRAMES',
  'LOAD_PRESET',
  'SWITCH_VIEW',
  'TOGGLE_CLASS_VIEW',
  'RUN_BELADY_PROOF',
  'REQUEST_STATE'
]);

const MAX_SESSIONS = 120;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const sessions = new Map();

function sanitizeRoomCode(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (cleaned.length < 4 || cleaned.length > 8) return null;
  return cleaned;
}

function getOrCreateSession(code) {
  let session = sessions.get(code);
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) {
      let oldestCode = null;
      let oldestAt = Infinity;
      for (const [k, s] of sessions.entries()) {
        if (s.hosts.size === 0 && s.controllers.size === 0 && s.updatedAt < oldestAt) {
          oldestAt = s.updatedAt;
          oldestCode = k;
        }
      }
      if (oldestCode) sessions.delete(oldestCode);
    }
    session = {
      code,
      hosts: new Map(),
      controllers: new Map(),
      latestState: null,
      updatedAt: Date.now()
    };
    sessions.set(code, session);
  }
  session.updatedAt = Date.now();
  return session;
}

function sendSseEvent(res, eventName, data) {
  try {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (_) {
    return false;
  }
}

function broadcastPresence(session) {
  const payload = {
    code: session.code,
    hostOnline: session.hosts.size > 0,
    remoteCount: session.controllers.size,
    state: session.latestState
  };
  for (const res of session.hosts.values()) {
    sendSseEvent(res, 'session', payload);
  }
  for (const res of session.controllers.values()) {
    sendSseEvent(res, 'session', payload);
  }
}

function isVirtualInterface(name) {
  return /vethernet|wsl|hyper-v|vmware|virtualbox|vbox|docker|loopback|tailscale|zerotier|hamachi|bluetooth/i.test(name);
}

function scoreInterface(name, addr) {
  if (isVirtualInterface(name)) return 0;
  if (/wi-?fi|wlan|wireless|airport/i.test(name)) return 4;
  if (/ethernet|eth\d|en\d|lan/i.test(name)) return 3;
  if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return 2;
  return 1;
}

export function getLanAddresses() {
  const ifaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, list] of Object.entries(ifaces)) {
    if (!Array.isArray(list)) continue;
    for (const info of list) {
      if (info.family !== 'IPv4' || info.internal) continue;
      candidates.push({
        name,
        address: info.address,
        priority: scoreInterface(name, info.address),
        isVirtual: isVirtualInterface(name)
      });
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  const physical = candidates.filter((c) => !c.isVirtual);
  return physical.length > 0 ? physical : candidates;
}

function readJsonBody(req, maxBytes = 32768) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/server-info') {
    const addresses = getLanAddresses();
    const primary = addresses[0]?.address || '127.0.0.1';
    sendJson(res, 200, {
      ok: true,
      port: PORT,
      primaryIp: primary,
      lanUrls: addresses.map((a) => ({
        name: a.name,
        address: a.address,
        url: `http://${a.address}:${PORT}`
      })),
      localUrl: `http://localhost:${PORT}`
    });
    return true;
  }

  const remoteMatch = pathname.match(/^\/api\/remote\/([A-Za-z0-9_-]{4,8})\/(events|command|state)$/);
  if (!remoteMatch) {
    return false;
  }

  const code = sanitizeRoomCode(remoteMatch[1]);
  const action = remoteMatch[2];
  if (!code) {
    sendJson(res, 400, { ok: false, error: 'Room code must be 4-8 alphanumeric characters.' });
    return true;
  }

  if (req.method === 'GET' && action === 'events') {
    const role = parsedUrl.searchParams.get('role') === 'controller' ? 'controller' : 'host';
    const clientId = String(parsedUrl.searchParams.get('clientId') || `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`).slice(0, 48);

    const session = getOrCreateSession(code);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 1500\n\n');

    const pool = role === 'controller' ? session.controllers : session.hosts;
    pool.set(clientId, res);

    broadcastPresence(session);
    if (role === 'controller' && session.hosts.size > 0) {
      for (const hostRes of session.hosts.values()) {
        sendSseEvent(hostRes, 'command', { type: 'REQUEST_STATE', payload: {}, clientId, ts: Date.now() });
      }
    }

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_) {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      pool.delete(clientId);
      session.updatedAt = Date.now();
      broadcastPresence(session);
    });

    return true;
  }

  if (req.method === 'POST' && action === 'command') {
    let body;
    try {
      body = await readJsonBody(req, 4096);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
      return true;
    }

    const type = String(body?.type || '').trim();
    if (!ALLOWED_COMMANDS.has(type)) {
      sendJson(res, 400, { ok: false, error: 'Unsupported remote command.' });
      return true;
    }

    const session = getOrCreateSession(code);
    const cmdEvent = {
      type,
      payload: body?.payload && typeof body.payload === 'object' ? body.payload : {},
      clientId: String(body?.clientId || 'phone').slice(0, 48),
      ts: Date.now()
    };

    let delivered = 0;
    for (const hostRes of session.hosts.values()) {
      if (sendSseEvent(hostRes, 'command', cmdEvent)) {
        delivered += 1;
      }
    }

    sendJson(res, 200, {
      ok: true,
      delivered,
      hostOnline: session.hosts.size > 0
    });
    return true;
  }

  if (req.method === 'POST' && action === 'state') {
    let body;
    try {
      body = await readJsonBody(req, 32768);
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
      return true;
    }

    const session = getOrCreateSession(code);
    session.latestState = body?.state && typeof body.state === 'object' ? body.state : null;

    let notified = 0;
    for (const ctrlRes of session.controllers.values()) {
      if (sendSseEvent(ctrlRes, 'state', session.latestState)) {
        notified += 1;
      }
    }

    sendJson(res, 200, {
      ok: true,
      notified,
      remoteCount: session.controllers.size
    });
    return true;
  }

  sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  return true;
}

async function serveStaticFile(req, res, parsedUrl) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let relPath = decodeURIComponent(parsedUrl.pathname);
  if (relPath === '/' || relPath === '/remote' || relPath === '/remote/') {
    relPath = '/index.html';
  }

  const safePath = path.resolve(ROOT_DIR, `.${relPath}`);
  if (safePath !== ROOT_DIR && !safePath.startsWith(ROOT_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const baseName = path.basename(safePath);
  if (baseName.startsWith('.') || baseName === 'server.js' || baseName === 'package.json' || baseName === 'start-remote.bat') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  try {
    const stat = await fs.stat(safePath);
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const data = await fs.readFile(safePath);
    res.end(data);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [code, s] of sessions.entries()) {
    if (s.hosts.size === 0 && s.controllers.size === 0 && s.updatedAt < cutoff) {
      sessions.delete(code);
    }
  }
}, 30 * 60 * 1000).unref();

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (parsedUrl.pathname.startsWith('/api/')) {
    const handled = await handleApi(req, res, parsedUrl);
    if (!handled) {
      sendJson(res, 404, { ok: false, error: 'Endpoint not found' });
    }
    return;
  }

  await serveStaticFile(req, res, parsedUrl);
});

server.listen(PORT, '0.0.0.0', () => {
  const addrs = getLanAddresses();
  const primary = addrs[0]?.address || '127.0.0.1';
  console.log(`\nFrameLab Projector & Same-Wi-Fi Remote Server running on port ${PORT}`);
  console.log(`  Projector (This PC)    : http://localhost:${PORT}`);
  console.log(`  Phone Remote (SameWiFi): http://${primary}:${PORT}/remote`);
  if (addrs.length > 1) {
    console.log(`  Alternate Adapters     : ${addrs.slice(1).map((a) => `${a.name} (${a.address})`).join(', ')}`);
  }
  console.log('  Press Ctrl+C to stop.\n');
});
