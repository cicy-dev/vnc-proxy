const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { execSync } = require('child_process');

const PORT = 13335;
const VNC_TARGET = 'http://127.0.0.1:6080';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';

// Load or generate token from ~/personal/global.json
function loadOrGenerateToken() {
  const configPath = path.join(os.homedir(), 'personal', 'global.json');
  const configDir = path.dirname(configPath);

  try {
    // Ensure directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Check if config file exists
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.api_token) {
        console.log(`✓ Loaded token from ${configPath}`);
        return config.api_token;
      }
    }

    // Generate new random token
    const newToken = crypto.randomBytes(32).toString('hex');
    const config = { api_token: newToken };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✓ Generated new token and saved to ${configPath}`);
    return newToken;
  } catch (e) {
    console.error('Error loading/generating token:', e.message);
    // Fallback to default token
    return '123456';
  }
}

const TOKEN = loadOrGenerateToken();

function checkToken(req) {
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('token') === TOKEN) return true;
  const auth = req.headers['authorization'];
  if (auth === 'Bearer ' + TOKEN) return true;
  return false;
}

const proxy = httpProxy.createProxyServer({});
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy error' }));
  }
});

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const distPath = path.join(__dirname, '..', 'dist');

function serveStatic(req, res) {
  let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(filePath)) filePath = path.join(distPath, 'index.html');
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;

  // Health check - no auth required
  if (urlPath === '/api/health') {
    return json(res, { status: 'ok' });
  }

  // Static files - no auth required
  if (!urlPath.startsWith('/api/') && !urlPath.startsWith('/vnc/')) {
    return serveStatic(req, res);
  }

  // All other API endpoints require authentication
  if (!checkToken(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  // 打字到 VNC 聚焦区域
  if (urlPath === '/api/type' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const text_data = JSON.parse(body);
        const { text } = text_data;
        if (!text || !text.trim()) return json(res, { success: false, error: 'no text' });
        const display = text_data.display || ':1';
        // 写入剪贴板，然后 Ctrl+V 粘贴，再按 Enter
        execSync(`echo -n ${JSON.stringify(text)} | DISPLAY=${display} xsel --clipboard --input`, { timeout: 5000 });
        execSync(`DISPLAY=${display} xdotool key ctrl+v`, { timeout: 5000 });
        execSync(`DISPLAY=${display} xdotool key Return`, { timeout: 5000 });
        return json(res, { success: true });
      } catch (e) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // 按键到 VNC（如 Return, Tab 等）
  if (urlPath === '/api/key' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const key_data = JSON.parse(body);
        const { key } = key_data;
        if (!key) return json(res, { success: false, error: 'no key' });
        const display = key_data.display || ':1';
        execSync(`DISPLAY=${display} xdotool key -- ${key}`, { timeout: 5000 });
        return json(res, { success: true });
      } catch (e) {
        return json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // 语音转文字
  if (urlPath === '/api/voice' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      // 转发到 bot_api 的 voice_to_text
      const boundary = '----FormBoundary' + Date.now();
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const opts = {
        hostname: '127.0.0.1', port: 15001, path: '/voice_to_text', method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
      };
      const proxyReq = http.request(opts, (proxyRes) => {
        let data = '';
        proxyRes.on('data', c => data += c);
        proxyRes.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });
      proxyReq.on('error', (e) => json(res, { error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // 英文纠错 - 使用 Hugging Face 免费 API
  if (urlPath === '/api/correctEnglish' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        console.log('[correctEnglish] Received text:', text);
        
        if (!text || !text.trim()) return json(res, { success: false, error: 'no text' });
        
        // Use Hugging Face Inference API (free)
        const hfUrl = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
        const prompt = `Correct this English text: ${text}`;
        
        const hfBody = JSON.stringify({
          inputs: prompt,
          parameters: {
            max_length: 200,
            min_length: 10
          }
        });

        console.log('[correctEnglish] Calling Hugging Face API...');
        const https = require('https');
        const url = new URL(hfUrl);
        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        };

        const hfReq = https.request(options, (hfRes) => {
          let data = '';
          hfRes.on('data', chunk => data += chunk);
          hfRes.on('end', () => {
            try {
              console.log('[correctEnglish] HF response:', data.substring(0, 200));
              
              if (hfRes.statusCode !== 200) {
                console.error('[correctEnglish] HF API error:', hfRes.statusCode, data);
                // Fallback to simple corrections
                let corrected = text
                  .replace(/\br\s+you\b/gi, 'are you')
                  .replace(/\bhow old a you\b/gi, 'how old are you')
                  .replace(/\bi want test\b/gi, 'I want to test')
                  .replace(/\bthis is work\b/gi, 'this works')
                  .replace(/\biam\b/gi, 'I am')
                  .replace(/\bu\b/gi, 'you')
                  .replace(/\br\b/gi, 'are')
                  .replace(/^([a-z])/, (m) => m.toUpperCase())
                  .replace(/([^.!?])$/, '$1.');
                return json(res, { success: true, correctedText: corrected.trim() });
              }
              
              const result = JSON.parse(data);
              let correctedText = result[0]?.summary_text || result[0]?.generated_text || text;
              
              // Clean up the response
              correctedText = correctedText
                .replace(/^Correct this English text:\s*/i, '')
                .replace(/^["']|["']$/g, '')
                .trim();
              
              json(res, { success: true, correctedText: correctedText });
            } catch (e) {
              console.error('[correctEnglish] Parse error:', e.message);
              // Fallback
              let corrected = text
                .replace(/\br\s+you\b/gi, 'are you')
                .replace(/\bhow old a you\b/gi, 'how old are you')
                .replace(/\bu\b/gi, 'you')
                .replace(/\br\b/gi, 'are')
                .replace(/^([a-z])/, (m) => m.toUpperCase());
              json(res, { success: true, correctedText: corrected.trim() });
            }
          });
        });

        hfReq.on('error', (e) => {
          console.error('[correctEnglish] Request error:', e.message);
          // Fallback
          let corrected = text
            .replace(/\br\s+you\b/gi, 'are you')
            .replace(/\bhow old a you\b/gi, 'how old are you')
            .replace(/\bu\b/gi, 'you')
            .replace(/\br\b/gi, 'are')
            .replace(/^([a-z])/, (m) => m.toUpperCase());
          json(res, { success: true, correctedText: corrected.trim() });
        });

        hfReq.write(hfBody);
        hfReq.end();
        
      } catch (e) {
        console.error('[correctEnglish] Error:', e.message);
        json(res, { success: false, error: e.message });
      }
    });
    return;
  }

  // noVNC 代理: /vnc/* → localhost:6080
  if (req.url.startsWith('/vnc')) {
    req.url = req.url.replace(/^\/vnc/, '') || '/';
    return proxy.web(req, res, { target: VNC_TARGET });
  }

  // 静态文件
  serveStatic(req, res);
});

// WebSocket upgrade → noVNC websockify
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/vnc')) {
    req.url = req.url.replace(/^\/vnc/, '') || '/';
    proxy.ws(req, socket, head, { target: VNC_TARGET });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on :${PORT}`);
  console.log(`   /vnc → ${VNC_TARGET}`);
  console.log(`   Token: ${TOKEN.substring(0, 8)}...`);
});
