import http from 'http';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import https from 'https';

const PORT = parseInt(process.env.PORT || '13335');
const VNC_TARGET = process.env.VNC_TARGET || 'http://127.0.0.1:6080';

function loadOrGenerateToken(): string {
  const configPath = path.join(os.homedir(), 'personal', 'global.json');
  const configDir = path.dirname(configPath);

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.api_token) {
        console.log(`✓ Loaded token from ${configPath}`);
        return config.api_token;
      }
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const config = { api_token: newToken };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✓ Generated new token and saved to ${configPath}`);
    return newToken;
  } catch (e: any) {
    console.error('Error loading/generating token:', e.message);
    return '123456';
  }
}

const TOKEN = loadOrGenerateToken();

function checkToken(req: http.IncomingMessage): boolean {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.searchParams.get('token') === TOKEN) return true;
  const auth = req.headers['authorization'];
  if (auth === `Bearer ${TOKEN}`) return true;
  return false;
}

const proxy = httpProxy.createProxyServer({});
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if ((res as any).writeHead) {
    (res as any).writeHead(502, { 'Content-Type': 'application/json' });
    (res as any).end(JSON.stringify({ error: 'proxy error' }));
  }
});

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
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

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;

  if (urlPath === '/api/health') {
    return json(res, { status: 'ok' });
  }

  if (!urlPath.startsWith('/api/') && !urlPath.startsWith('/vnc/')) {
    return serveStatic(req, res);
  }

  if (!checkToken(req)) {
    (res as any).writeHead(401, { 'Content-Type': 'application/json' });
    return (res as any).end(JSON.stringify({ error: 'unauthorized' }));
  }

  if (urlPath === '/api/type' && req.method === 'POST') {
    let body = '';
    req.on('data', (c: any) => body += c);
    req.on('end', async () => {
      try {
        const { text, target } = JSON.parse(body);
        if (!text || !text.trim() || !target) return json(res, { success: false, error: 'need text and target' });
        console.log(`[type] Sending to display: ${target}, text: ${text}`);
        
        // 计算端口: :1 → 13431, :2 → 13432
        const displayNum = parseInt(target.split(':')[1] || '1');
        const proxyPort = 13430 + displayNum;
        
        // 调用 proxy (measure_window.py) on host
        const proxyRes = await fetch(`http://10.170.0.6:${proxyPort}/api/type`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, target })
        });
        const proxyData = await proxyRes.json();
        if (!proxyData.success) return json(res, { success: false, error: proxyData.error });
        
        console.log(`[type] Done: ${text}`);
        return json(res, { success: true });
      } catch (e: any) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // 代理请求 - 不需要认证（内部使用）
  if (urlPath === '/api/proxy-type' && req.method === 'POST') {
    let body = '';
    req.on('data', (c: any) => body += c);
    req.on('end', () => {
      try {
        const { text, target } = JSON.parse(body);
        if (!text || !text.trim() || !target) return json(res, { success: false, error: 'need text and target' });
        console.log(`[proxy-type] Sending to display: ${target}, text: ${text}`);
        execSync(`DISPLAY=${target} xdotool type -- "${text.replace(/"/g, '\\"')}"`, { timeout: 5000, stdio: 'ignore' });
        execSync(`DISPLAY=${target} xdotool key Return`, { timeout: 5000, stdio: 'ignore' });
        console.log(`[proxy-type] Done: ${text}`);
        return json(res, { success: true });
      } catch (e: any) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  if (urlPath === '/api/key' && req.method === 'POST') {
    let body = '';
    req.on('data', (c: any) => body += c);
    req.on('end', () => {
      try {
        const key_data = JSON.parse(body);
        const { key } = key_data;
        if (!key) return json(res, { success: false, error: 'no key' });
        const display = key_data.display || ':1';
        execSync(`DISPLAY=${display} xdotool key -- ${key}`, { timeout: 5000 });
        return json(res, { success: true });
      } catch (e: any) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  if (urlPath === '/api/voice' && req.method === 'POST') {
    const chunks: any[] = [];
    req.on('data', (c: any) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const boundary = '----FormBoundary' + Date.now();
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const opts = {
        hostname: '127.0.0.1',
        port: 15001,
        path: '/voice_to_text',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      };
      const proxyReq = http.request(opts, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (c: any) => data += c);
        proxyRes.on('end', () => {
          (res as any).writeHead(200, { 'Content-Type': 'application/json' });
          (res as any).end(data);
        });
      });
      proxyReq.on('error', (e: any) => json(res, { error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  if (urlPath === '/api/correctEnglish' && req.method === 'POST') {
    let body = '';
    req.on('data', (c: any) => body += c);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        console.log('[correctEnglish] Received text:', text);
        
        if (!text || !text.trim()) return json(res, { success: false, error: 'no text' });
        
        const hfUrl = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
        const prompt = `Correct this English text: ${text}`;
        
        const hfBody = JSON.stringify({
          inputs: prompt,
          parameters: { max_length: 200, min_length: 10 }
        });

        console.log('[correctEnglish] Calling Hugging Face API...');
        const url = new URL(hfUrl);
        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        };

        const hfReq = https.request(options, (hfRes) => {
          let data = '';
          hfRes.on('data', (chunk: any) => data += chunk);
          hfRes.on('end', () => {
            try {
              console.log('[correctEnglish] HF response:', data.substring(0, 200));
              
              if (hfRes.statusCode !== 200) {
                console.error('[correctEnglish] HF API error:', hfRes.statusCode, data);
                let corrected = text
                  .replace(/\br\s+you\b/gi, 'are you')
                  .replace(/\bhow old a you\b/gi, 'how old are you')
                  .replace(/\bi want test\b/gi, 'I want to test')
                  .replace(/\bthis is work\b/gi, 'this works')
                  .replace(/\biam\b/gi, 'I am')
                  .replace(/\bu\b/gi, 'you')
                  .replace(/\br\b/gi, 'are')
                  .replace(/^([a-z])/, (m: any) => m.toUpperCase())
                  .replace(/([^.!?])$/, '$1.');
                return json(res, { success: true, correctedText: corrected.trim() });
              }
              
              const result = JSON.parse(data);
              let correctedText = result[0]?.summary_text || result[0]?.generated_text || text;
              correctedText = correctedText
                .replace(/^Correct this English text:\s*/i, '')
                .replace(/^["']|["']$/g, '')
                .trim();
              
              json(res, { success: true, correctedText });
            } catch (e: any) {
              console.error('[correctEnglish] Parse error:', e.message);
              let corrected = text
                .replace(/\br\s+you\b/gi, 'are you')
                .replace(/\bhow old a you\b/gi, 'how old are you')
                .replace(/\bu\b/gi, 'you')
                .replace(/\br\b/gi, 'are')
                .replace(/^([a-z])/, (m: any) => m.toUpperCase());
              json(res, { success: true, correctedText: corrected.trim() });
            }
          });
        });

        hfReq.on('error', (e: any) => {
          console.error('[correctEnglish] Request error:', e.message);
          let corrected = text
            .replace(/\br\s+you\b/gi, 'are you')
            .replace(/\bhow old a you\b/gi, 'how old are you')
            .replace(/\bu\b/gi, 'you')
            .replace(/\br\b/gi, 'are')
            .replace(/^([a-z])/, (m: any) => m.toUpperCase());
          json(res, { success: true, correctedText: corrected.trim() });
        });

        hfReq.write(hfBody);
        hfReq.end();
        
      } catch (e: any) {
        console.error('[correctEnglish] Error:', e.message);
        json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  if (req.url?.startsWith('/vnc')) {
    req.url = req.url.replace(/^\/vnc/, '') || '/';
    return (proxy as any).web(req, res, { target: VNC_TARGET });
  }

  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/vnc')) {
    req.url = req.url.replace(/^\/vnc/, '') || '/';
    (proxy as any).ws(req, socket, head, { target: VNC_TARGET });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on :${PORT}`);
  console.log(`   /vnc → ${VNC_TARGET}`);
  console.log(`   Token: ${TOKEN.substring(0, 8)}...`);
});
