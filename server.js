/**
 * 个人匿名社区网站 — 纯 Node.js 实现（零依赖）
 * 功能：匿名发帖 + 带用户名的评论
 * 启动：node server.js  （默认端口 3000）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ---------- 数据存储 ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let db = { posts: [] };
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(db.posts)) db.posts = [];
  } catch (e) {
    console.error('数据文件损坏，使用空数据库:', e.message);
    db = { posts: [] };
  }
}
function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- 工具函数 ----------
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// 简单清洗：去除控制字符，限制长度
function clean(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

// ---------- 静态文件服务 ----------
function serveStatic(req, res, urlPath) {
  let filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        // SPA 回退到 index.html
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err3, indexData) => {
          if (err3) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found');
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(indexData);
        });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

// ---------- API 路由 ----------
async function handleApi(req, res, urlObj) {
  const p = urlObj.pathname;
  const method = req.method;

  // 帖子列表（含评论）
  if (p === '/api/posts' && method === 'GET') {
    const posts = [...db.posts].sort((a, b) => b.createdAt - a.createdAt);
    return sendJson(res, 200, { posts });
  }

  // 发布匿名帖
  if (p === '/api/posts' && method === 'POST') {
    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      return sendJson(res, 413, { error: e.message });
    }
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return sendJson(res, 400, { error: 'JSON 格式错误' });
    }
    const title = clean(body.title, 80);
    const content = clean(body.content, 5000);
    if (!title || !content) {
      return sendJson(res, 400, { error: '标题和内容不能为空' });
    }
    const post = {
      id: genId(),
      title,
      content,
      createdAt: Date.now(),
      comments: [],
    };
    db.posts.push(post);
    save();
    return sendJson(res, 201, { post });
  }

  // 单篇帖子
  const postMatch = p.match(/^\/api\/posts\/([\w-]+)$/);
  if (postMatch && method === 'GET') {
    const post = db.posts.find((x) => x.id === postMatch[1]);
    if (!post) return sendJson(res, 404, { error: '帖子不存在' });
    return sendJson(res, 200, { post });
  }

  // 发表评论（显示用户名）
  const commentMatch = p.match(/^\/api\/posts\/([\w-]+)\/comments$/);
  if (commentMatch && method === 'POST') {
    const post = db.posts.find((x) => x.id === commentMatch[1]);
    if (!post) return sendJson(res, 404, { error: '帖子不存在' });
    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      return sendJson(res, 413, { error: e.message });
    }
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return sendJson(res, 400, { error: 'JSON 格式错误' });
    }
    const author = clean(body.author, 24) || '匿名访客';
    const content = clean(body.content, 2000);
    if (!content) return sendJson(res, 400, { error: '评论内容不能为空' });
    const comment = { id: genId(), author, content, createdAt: Date.now() };
    post.comments.push(comment);
    save();
    return sendJson(res, 201, { comment });
  }

  return sendJson(res, 404, { error: '接口不存在' });
}

// ---------- 服务器 ----------
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (urlObj.pathname.startsWith('/api/')) {
    handleApi(req, res, urlObj).catch((e) => {
      console.error(e);
      sendJson(res, 500, { error: '服务器内部错误' });
    });
    return;
  }
  serveStatic(req, res, urlObj.pathname);
});

server.listen(PORT, () => {
  console.log(`✅ 网站已启动: http://localhost:${PORT}`);
});
