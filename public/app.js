/* ============ 星语 · 前端逻辑 ============ */
(function () {
  "use strict";

  // ---------- 用户名管理（localStorage） ----------
  const FALLBACK_NAMES = ["追光者", "夜航星", "拾贝人", "观云客", "听风者", "逐月人", "拾光者", "巡星人"];
  function genName() {
    const n = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
    return n + "_" + Math.floor(1000 + Math.random() * 9000);
  }
  let username = localStorage.getItem("xingyu_username") || "";
  const usernameInput = document.getElementById("usernameInput");
  const userAvatar = document.getElementById("userAvatar");
  if (!username) {
    username = genName();
    localStorage.setItem("xingyu_username", username);
  }
  usernameInput.value = username;
  renderUser();

  usernameInput.addEventListener("input", () => {
    username = usernameInput.value.trim().slice(0, 24) || genName();
    if (usernameInput.value.trim()) localStorage.setItem("xingyu_username", username);
  });
  usernameInput.addEventListener("change", () => {
    if (!usernameInput.value.trim()) {
      username = genName();
      usernameInput.value = username;
    }
    localStorage.setItem("xingyu_username", username);
    renderUser();
    toast("用户名已更新 ✅");
  });

  function renderUser() {
    userAvatar.textContent = username.charAt(0).toUpperCase();
    userAvatar.style.background = avatarColor(username);
  }

  // 根据用户名哈希生成头像渐变色
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function avatarColor(s) {
    const h = hashStr(s);
    const a = h % 360, b = (a + 60 + (h % 80)) % 360;
    return `linear-gradient(135deg, hsl(${a},70%,55%), hsl(${b},75%,45%))`;
  }

  // ---------- 工具 ----------
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text; // textContent 防止 XSS
    return node;
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
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
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }
  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
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

    const meta = el("div", "post-meta");
    const tag = el("span", "anony-tag", "🕶️ 匿名星友");
    meta.appendChild(tag);
    meta.appendChild(el("span", "", fmtTime(post.createdAt)));
    const cmtBtn = el("button", "btn btn-ghost");
    cmtBtn.type = "button";
    cmtBtn.textContent = `💬 评论 (${(post.comments || []).length})`;
    meta.appendChild(cmtBtn);
    card.appendChild(meta);

    // 评论面板
    const panel = el("div", "comments");
    cmtBtn.addEventListener("click", () => {
      panel.classList.toggle("open");
      cmtBtn.textContent = `💬 评论 (${post.comments.length})`;
    });

    function renderComments() {
      panel.innerHTML = "";
      post.comments.forEach((c) => {
        const row = el("div", "comment");
        const av = el("span", "avatar", c.author.charAt(0).toUpperCase());
        av.style.background = avatarColor(c.author);
        row.appendChild(av);
        const body = el("div", "comment-body");
        const authorLine = el("div");
        authorLine.appendChild(el("span", "comment-author", c.author));
        authorLine.appendChild(el("span", "comment-time", fmtTime(c.createdAt)));
        body.appendChild(authorLine);
        body.appendChild(el("p", "comment-text", c.content));
        row.appendChild(body);
        panel.appendChild(row);
      });
    }
    renderComments();

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
        cmtBtn.textContent = `💬 评论 (${post.comments.length})`;
        input.value = "";
      } catch (err) {
        toast(err.message, true);
      } finally {
        send.disabled = false;
      }
    });
    panel.appendChild(form);
    card.appendChild(panel);
    return card;
  }

  // ---------- 发布帖子 ----------
  document.getElementById("postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("postTitle");
    const content = document.getElementById("postContent");
    if (!title.value.trim() || !content.value.trim()) return;
    try {
      await api("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.value.trim(), content: content.value.trim() }),
      });
      title.value = "";
      content.value = "";
      toast("发布成功，你的秘密已随星而起 🌠");
      loadPosts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast(err.message, true);
    }
  });

  loadPosts();
  setInterval(loadPosts, 30000); // 每 30 秒自动刷新
})();
