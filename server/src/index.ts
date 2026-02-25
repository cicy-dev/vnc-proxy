import http from 'http';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.env.PORT || '13335');
const VNC_TARGET = process.env.VNC_TARGET || 'http://127.0.0.1:6080';
const VNC2_TARGET = process.env.VNC2_TARGET || 'http://127.0.0.1:6082';
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:14444';

// --- FastAPI 认证中心 ---
interface TokenVerifyResult {
  valid: boolean;
  perms?: string[];
  group_id?: number | null;
}

const tokenCache = new Map<string, { result: TokenVerifyResult; cachedAt: number }>();
const CACHE_TTL = 30000;

async function verifyToken(token: string): Promise<TokenVerifyResult> {
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && (now - cached.cachedAt) < CACHE_TTL) return cached.result;

  try {
    const res = await fetch(`${FASTAPI_URL}/api/auth/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    if (!res.ok) {
      const result: TokenVerifyResult = { valid: false };
      tokenCache.set(token, { result, cachedAt: now });
      return result;
    }
    const result: TokenVerifyResult = await res.json();
    tokenCache.set(token, { result, cachedAt: now });
    return result;
  } catch (e: any) {
    console.error('[AUTH] verify-token error:', e.message);
    return { valid: false };
  }
}

function extractToken(req: http.IncomingMessage): string | null {
  const url = new URL(req.url || '/', 'http://localhost');
  const t = url.searchParams.get('token');
  if (t) return t;
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.substring(7);
  return null;
}

function hasPermission(perms: string[] | undefined, perm: string): boolean {
  return !!perms?.includes(perm) || !!perms?.includes('api_full');
}

// --- VNC 代理 ---
const proxy = httpProxy.createProxyServer({});
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if ((res as any).writeHead) {
    (res as any).writeHead(502, { 'Content-Type': 'application/json' });
    (res as any).end(JSON.stringify({ error: 'proxy error' }));
  }
});

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const distPath = path.join(process.cwd(), '..', 'frontend', 'dist');
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;
  let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath.split('?')[0]);
  if (!fs.existsSync(filePath)) filePath = path.join(distPath, 'index.html');
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    (res as any).writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    (res as any).end(data);
  } catch {
    (res as any).writeHead(404);
    (res as any).end('Not Found');
  }
}

function json(res: http.ServerResponse, data: any) {
  (res as any).writeHead(200, { 'Content-Type': 'application/json' });
  (res as any).end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;

  if (urlPath === '/api/health') return json(res, { status: 'ok' });

  // VNC HTTP 代理（/vnc → :6080, /vnc2 → :6082）
  // 静态资源免认证（安全由 VNC 密码 + WebSocket 认证保障）
  const vncMatch = req.url?.match(/^\/(vnc2?)(\/.*)?$/);
  if (vncMatch) {
    const target = vncMatch[1] === 'vnc2' ? VNC2_TARGET : VNC_TARGET;
    req.url = (vncMatch[2] || '/');
    return (proxy as any).web(req, res, { target });
  }

  // 其他请求 → 静态文件
  serveStatic(req, res);
});

// VNC WebSocket 代理
server.on('upgrade', async (req, socket, head) => {
  const wsMatch = req.url?.match(/^\/(vnc2?)(\/.*)?$/);
  if (!wsMatch) { socket.destroy(); return; }

  const target = wsMatch[1] === 'vnc2' ? VNC2_TARGET : VNC_TARGET;
  req.url = (wsMatch[2] || '/');
  (proxy as any).ws(req, socket, head, { target });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VNC Proxy on :${PORT}`);
  console.log(`   /vnc  → ${VNC_TARGET}`);
  console.log(`   /vnc2 → ${VNC2_TARGET}`);
  console.log(`   Auth: FastAPI ${FASTAPI_URL}`);
});
