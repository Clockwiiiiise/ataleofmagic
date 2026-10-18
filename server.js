/**
 * 学院论坛 —— 匿名发帖 + 用户名评论 + 图片上传（纯 Node.js，零依赖）
 * 启动：node server.js  （默认端口 3000）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
// 数据目录：本地默认 ./data；云平台可用 DATA_DIR 指向持久磁盘
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ---------- 目录准备 ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- 数据存储 ----------
let db = { posts: [], avatars: {} };
if (fs.existsSync(DB_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.posts = Array.isArray(raw.posts) ? raw.posts : [];
    db.avatars = raw.avatars && typeof raw.avatars === 'object' ? raw.avatars : {};
  } catch (e) {
    console.error('数据文件损坏，使用空数据库:', e.message);
  }
}
function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- 工具 ----------
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('内容过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
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
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- 静态文件 ----------
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
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err3, html) => {
          if (err3) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found');
          }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(html);
        });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.jpg' || ext === '.png' || ext === '.webp' ? 'public, max-age=86400' : 'no-cache',
      });
      res.end(data);
    });
  });
}

// ---------- 图片保存 ----------
function saveDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw new Error('图片格式不支持');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) throw new Error('单张图片不能超过 8MB');
  const name = genId() + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { url: '/uploads/' + name, size: buf.length };
}

// 给评论补上头像（读接口统一注入）
function withAvatars(post) {
  return {
    ...post,
    comments: (post.comments || []).map((c) => ({
      ...c,
      avatar: db.avatars[c.author] || null,
    })),
  };
}

// ---------- API ----------
async function handleApi(req, res, urlObj) {
  const p = urlObj.pathname;
  const method = req.method;

  if (p === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true, uptime: Math.floor(process.uptime()), posts: db.posts.length });
  }

  // 帖子列表
  if (p === '/api/posts' && method === 'GET') {
    const posts = [...db.posts].sort((a, b) => b.createdAt - a.createdAt).map(withAvatars);
    return sendJson(res, 200, { posts });
  }

  // 发布匿名帖（可带图片）
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
    if (!title || !content) return sendJson(res, 400, { error: '标题和内容不能为空' });

    const images = Array.isArray(body.images)
      ? body.images
          .filter((u) => typeof u === 'string' && /^\/uploads\/[\w.-]+$/.test(u))
          .slice(0, 3)
      : [];

    const post = { id: genId(), title, content, images, createdAt: Date.now(), comments: [] };
    db.posts.push(post);
    save();
    return sendJson(res, 201, { post: withAvatars(post) });
  }

  // 单篇帖子
  const postMatch = p.match(/^\/api\/posts\/([\w-]+)$/);
  if (postMatch && method === 'GET') {
    const post = db.posts.find((x) => x.id === postMatch[1]);
    if (!post) return sendJson(res, 404, { error: '帖子不存在' });
    return sendJson(res, 200, { post: withAvatars(post) });
  }

  // 发表评论
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
    const author = clean(body.author, 24) || '匿名同学';
    const content = clean(body.content, 2000);
    if (!content) return sendJson(res, 400, { error: '评论内容不能为空' });
    const comment = { id: genId(), author, content, createdAt: Date.now() };
    post.comments.push(comment);
    save();
    return sendJson(res, 201, { comment: { ...comment, avatar: db.avatars[author] || null } });
  }

  // 上传帖子图片（返回可访问网址）
  if (p === '/api/upload' && method === 'POST') {
    let raw;
    try {
      raw = await readBody(req, 12 * 1024 * 1024);
    } catch (e) {
      return sendJson(res, 413, { error: '图片过大（上限约 8MB）' });
    }
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return sendJson(res, 400, { error: 'JSON 格式错误' });
    }
    try {
      const { url, size } = saveDataUrl(body.data);
      return sendJson(res, 201, { url, size });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // 设置头像
  if (p === '/api/avatar' && method === 'POST') {
    let raw;
    try {
      raw = await readBody(req, 1024 * 1024);
    } catch (e) {
      return sendJson(res, 413, { error: '头像图片过大' });
    }
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return sendJson(res, 400, { error: 'JSON 格式错误' });
    }
    const author = clean(body.author, 24);
    if (!author) return sendJson(res, 400, { error: '缺少用户名' });
    try {
      const { url } = saveDataUrl(body.avatar);
      db.avatars[author] = url;
      save();
      return sendJson(res, 200, { ok: true, avatar: url });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 学院论坛已启动: http://localhost:${PORT}`);
  console.log(`   数据文件: ${DB_FILE}`);
  console.log(`   图片目录: ${UPLOAD_DIR}`);
});
