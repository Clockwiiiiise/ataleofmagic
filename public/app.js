/* ══════════════════════════════════════════
   学院论坛 · 前端逻辑
   匿名发帖（支持图片）· 用户名评论 · 自定义头像
   ══════════════════════════════════════════ */
(function () {
  "use strict";

  // ---------- 用户名 ----------
  const FALLBACK_NAMES = ["追光者", "夜航星", "拾贝人", "观云客", "听风者", "逐月人", "拾光者", "巡星人"];
  function genName() {
    const n = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
    return n + "_" + Math.floor(1000 + Math.random() * 9000);
  }
  let username = localStorage.getItem("xueyuan_username") || localStorage.getItem("xingyu_username") || "";
  if (!username) {
    username = genName();
  }
  localStorage.setItem("xueyuan_username", username);
  let avatarUrl = localStorage.getItem("xueyuan_avatar") || "";
  let avatarData = localStorage.getItem("xueyuan_avatar_data") || "";

  const usernameInput = document.getElementById("usernameInput");
  const userAvatar = document.getElementById("userAvatar");
  const avatarBtn = document.getElementById("avatarBtn");
  const avatarInput = document.getElementById("avatarInput");
  usernameInput.value = username;
  renderUser();

  usernameInput.addEventListener("change", () => {
    const next = usernameInput.value.trim().slice(0, 24);
    username = next || genName();
    usernameInput.value = username;
    localStorage.setItem("xueyuan_username", username);
    renderUser();
    toast("用户名已更新 ✅");
    if (avatarUrl) syncAvatar();  // 头像跟着新名字重新绑定
  });

  function renderUser() {
    if (avatarUrl) {
      userAvatar.textContent = "";
      userAvatar.style.background = `url("${avatarUrl}") center/cover no-repeat`;
    } else {
      userAvatar.textContent = username.charAt(0).toUpperCase();
      userAvatar.style.background = avatarColor(username);
      userAvatar.style.backgroundSize = "";
      userAvatar.style.backgroundPosition = "";
    }
  }

  // 根据用户名生成头像渐变色
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function avatarColor(s) {
    const h = hashStr(s);
    const a = h % 360, b = (a + 60 + (h % 80)) % 360;
    return `linear-gradient(135deg, hsl(${a},55%,52%), hsl(${b},60%,42%))`;
  }

  // ---------- 头像上传 ----------
  avatarBtn.addEventListener("click", () => avatarInput.click());

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files && avatarInput.files[0];
    avatarInput.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("请选择图片文件", true);
    try {
      const dataUrl = await cropSquare(file, 160, 0.85);
      const res = await api("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: username, avatar: dataUrl }),
      });
      avatarUrl = res.avatar;
      avatarData = dataUrl;
      localStorage.setItem("xueyuan_avatar", avatarUrl);
      localStorage.setItem("xueyuan_avatar_data", avatarData);
      renderUser();
      toast("头像已更新");
      loadPosts();
    } catch (e) {
      toast("头像上传失败：" + e.message, true);
    }
  });

  async function syncAvatar() {
    if (!avatarData) return;
    try {
      const res = await api("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: username, avatar: avatarData }),
      });
      avatarUrl = res.avatar;
      localStorage.setItem("xueyuan_avatar", avatarUrl);
      renderUser();
    } catch (e) {
      /* 忽略：只影响绑定新用户名后的头像 */
    }
  }

  // ---------- 图片处理 ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片读取失败")); };
      img.src = url;
    });
  }

  async function compressImage(file, maxSide = 1600, quality = 0.82) {
    const img = await loadImage(file);
    let { width: w, height: h } = img;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    w = Math.round(w * scale); h = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  }

  async function cropSquare(file, size = 160, quality = 0.85) {
    const img = await loadImage(file);
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", quality);
  }

  // ---------- 发帖图片选择 ----------
  let pendingImages = [];   // [{ dataUrl }]
  const MAX_IMAGES = 3;
  const pickImages = document.getElementById("pickImages");
  const postImages = document.getElementById("postImages");
  const postPreview = document.getElementById("postPreview");

  pickImages.addEventListener("click", () => postImages.click());

  postImages.addEventListener("change", async () => {
    const files = Array.from(postImages.files || []);
    postImages.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) return toast(`最多上传 ${MAX_IMAGES} 张图片`, true);
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 8 * 1024 * 1024) { toast("「" + file.name + "」超过 8MB，已跳过", true); continue; }
      try {
        pendingImages.push({ dataUrl: await compressImage(file) });
      } catch (e) {
        toast("图片处理失败：" + file.name, true);
      }
    }
    renderPreview();
  });

  function renderPreview() {
    postPreview.innerHTML = "";
    pendingImages.forEach((item, idx) => {
      const box = el("div", "preview-item");
      const img = el("img");
      img.src = item.dataUrl;
      img.alt = "待上传图片";
      const btn = el("button", "remove", "✕");
      btn.type = "button";
      btn.addEventListener("click", () => {
        pendingImages.splice(idx, 1);
        renderPreview();
      });
      box.appendChild(img);
      box.appendChild(btn);
      postPreview.appendChild(box);
    });
  }

  // ---------- 工具 ----------
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  let toastTimer;
  function toast(msg, isError) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }
  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  // 大图查看
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  lightbox.addEventListener("click", () => (lightbox.hidden = true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") lightbox.hidden = true;
  });
  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.hidden = false;
  }

  // ---------- 帖子列表 ----------
  const postList = document.getElementById("postList");
  const emptyTip = document.getElementById("emptyTip");

  async function loadPosts() {
    try {
      const { posts } = await api("/api/posts");
      postList.innerHTML = "";
      emptyTip.hidden = posts.length > 0;
      posts.forEach((p) => postList.appendChild(renderPost(p)));
    } catch (e) {
      toast("加载失败：" + e.message, true);
    }
  }

  function renderPost(post) {
    const card = el("article", "post-card");
    card.appendChild(el("h3", "post-title", post.title));
    card.appendChild(el("p", "post-content", post.content));

    // 帖子图片
    if (Array.isArray(post.images) && post.images.length) {
      const grid = el("div", "post-images");
      post.images.forEach((src) => {
        const img = el("img");
        img.src = src;
        img.alt = "帖子配图";
        img.loading = "lazy";
        img.addEventListener("click", () => openLightbox(src));
        grid.appendChild(img);
      });
      card.appendChild(grid);
    }

    const meta = el("div", "post-meta");
    meta.appendChild(el("span", "anony-tag", "匿名同学"));
    meta.appendChild(el("span", "", fmtTime(post.createdAt)));
    const cmtBtn = el("button", "btn btn-ghost");
    cmtBtn.type = "button";
    cmtBtn.textContent = `评论 (${(post.comments || []).length})`;
    meta.appendChild(cmtBtn);
    card.appendChild(meta);

    const panel = el("div", "comments");
    cmtBtn.addEventListener("click", () => panel.classList.toggle("open"));

    function renderComments() {
      panel.innerHTML = "";
      (post.comments || []).forEach((c) => {
        const row = el("div", "comment");
        const av = el("span", "avatar");
        if (c.avatar) {
          av.style.backgroundImage = `url("${c.avatar}")`;
        } else {
          av.textContent = c.author.charAt(0).toUpperCase();
          av.style.background = avatarColor(c.author);
        }
        row.appendChild(av);
        const body = el("div", "comment-body");
        const line = el("div");
        line.appendChild(el("span", "comment-author", c.author));
        line.appendChild(el("span", "comment-time", fmtTime(c.createdAt)));
        body.appendChild(line);
        body.appendChild(el("p", "comment-text", c.content));
        row.appendChild(body);
        panel.appendChild(row);
      });
      // 评论表单
      const form = el("form", "comment-form");
      const input = el("input");
      input.type = "text";
      input.maxLength = 2000;
      input.placeholder = `以「${username}」的身份评论…`;
      const send = el("button", "btn btn-primary", "发送");
      send.type = "submit";
      form.appendChild(input);
      form.appendChild(send);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = input.value.trim();
        if (!content) return;
        send.disabled = true;
        try {
          const { comment } = await api(`/api/posts/${post.id}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ author: username, content }),
          });
          post.comments.push(comment);
          renderComments();
          panel.classList.add("open");
          cmtBtn.textContent = `评论 (${post.comments.length})`;
        } catch (err) {
          toast(err.message, true);
        } finally {
          send.disabled = false;
        }
      });
      panel.appendChild(form);
    }
    renderComments();
    card.appendChild(panel);
    return card;
  }

  // ---------- 发布帖子 ----------
  const publishBtn = document.getElementById("publishBtn");
  document.getElementById("postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("postTitle");
    const content = document.getElementById("postContent");
    if (!title.value.trim() || !content.value.trim()) return;

    publishBtn.disabled = true;
    const oldText = publishBtn.textContent;
    publishBtn.textContent = "发布中…";
    try {
      // 先上传图片
      const urls = [];
      for (const item of pendingImages) {
        const { url } = await api("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: item.dataUrl }),
        });
        urls.push(url);
      }
      await api("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.value.trim(),
          content: content.value.trim(),
          images: urls,
        }),
      });
      title.value = "";
      content.value = "";
      pendingImages = [];
      renderPreview();
      toast("发布成功，心声已誊写到羊皮纸上");
      loadPosts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast(err.message, true);
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = oldText;
    }
  });

  loadPosts();
  // 自动刷新（评论面板打开时不打断）
  setInterval(() => {
    if (!document.querySelector(".comments.open")) loadPosts();
  }, 30000);
})();
