// ===== AutoNews — Supabase Integration + WebLLM Drafts =====

// Create Supabase client from globals set in HTML
const sb = (() => {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON) {
    console.warn("Missing Supabase config. Edit the <script> in your HTML and set window.SUPABASE_URL and window.SUPABASE_ANON.");
  }
  return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON);
})();

// ---------- Utilities ----------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
function setSession(s){ localStorage.setItem('autonews_session', JSON.stringify(s)); }
function getSession(){ try { return JSON.parse(localStorage.getItem('autonews_session')); } catch { return null; } }
function toTags(str){ return (str||"").split(/[\s,]+/g).map(t=>t.replace(/^#/,'').trim().toLowerCase()).filter(Boolean); }
function nowISO(){ return new Date().toISOString(); }

// Simple Markdown → HTML for previews/content_html
function mdToHtml(md) {
  if (!md) return "";
  const noFM = md.replace(/^---[\s\S]*?---\n/, ""); // strip YAML front-matter if present
  return noFM
    .replace(/^###### (.*)$/gm, "<h6>$1</h6>")
    .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
    .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .split(/\n{2,}/).map(p => `<p>${p}</p>`).join("\n");
}

// ---------- Header / Footer ----------
async function renderHeader(){
  const el = document.getElementById("site-header");
  if(!el) return;

  // Get session + role
  const { data: { session } } = await sb.auth.getSession();
  let email = session?.user?.email || null;
  let role = "guest";

  if (email) {
    const normalized = (email || '').trim().toLowerCase();
    const { data: prof } = await sb
      .from('user_profiles')
      .select('role')
      .ilike('email', normalized)
      .maybeSingle();
    role = prof?.role || "user";
    setSession({ email, role, ts: Date.now() });
  } else {
    localStorage.removeItem('autonews_session');
  }

  el.innerHTML = `
    <header>
      <div class="wrap row">
        <div class="brand"><a href="index.html" style="text-decoration:none;color:inherit">Xposed<span>.World</span></a></div>

        <!-- Desktop nav -->
        <nav class="nav ml-auto">
          <a href="index.html">Home</a>
          <a href="${email ? "account.html" : "login.html"}">${email ? "Account" : "Login"}</a>
          ${role === "admin" ? `<a href="admin.html">Admin</a>` : ""}
          ${email ? `<button id="btnLogout" title="Sign out">Logout</button>` : ""}
        </nav>

        <!-- Mobile burger -->
        <button class="burger ml-auto" id="burgerBtn" aria-label="Open menu">☰</button>
        <div class="mobile-nav" id="mobileNav" role="menu">
          <a href="index.html">Home</a>
          <a href="${email ? "account.html" : "login.html"}">${email ? "Account" : "Login"}</a>
          ${role === "admin" ? `<a href="admin.html">Admin</a>` : ""}
          ${email ? `<button id="mLogout">Logout</button>` : ""}
        </div>
      </div>
    </header>
  `;

  const btn = document.getElementById("btnLogout");
  if(btn){
    btn.onclick = async ()=>{
      await sb.auth.signOut();
      localStorage.removeItem('autonews_session');
      location.href="index.html";
    };
  }
  const mBtn = document.getElementById("mLogout");
  if(mBtn){
    mBtn.onclick = async ()=>{
      await sb.auth.signOut();
      localStorage.removeItem('autonews_session');
      location.href="index.html";
    };
  }

  // Toggle mobile dropdown
  const burger = document.getElementById("burgerBtn");
  const mnav = document.getElementById("mobileNav");
  if(burger && mnav){
    burger.onclick = () => {
      const show = mnav.style.display === "block" ? "none" : "block";
      mnav.style.display = show;
    };
    document.addEventListener("click", (e)=>{
      if(!mnav.contains(e.target) && e.target !== burger){ mnav.style.display = "none"; }
    });
  }
}

function renderFooter(){
  const el = document.getElementById("site-footer");
  if(!el) return;
  el.innerHTML = `
    <footer class="wrap" style="padding:8px 16px 24px">
      <div class="row" style="justify-content:space-between">
        <div>© ${new Date().getFullYear()} Xposed.World</div>
        <div class="mut">Powered by XposeMarket</div>
      </div>
    </footer>
  `;
}

// ---------- Markets (SPY, DIA, NVDA, BTC, ETH) rotation ----------
async function fetchStocks(){
  try{
    const r = await fetch("https://financialmodelingprep.com/api/v3/quote/SPY,DIA,NVDA?apikey=demo", {cache:"no-store"});
    if(!r.ok) throw new Error("fmp failed");
    const j = await r.json();
    return j.map(x => ({
      key: x.symbol,
      label: (x.symbol==="SPY"?"S&P 500 (SPY)": x.symbol==="DIA"?"Dow (DIA)":"NVIDIA (NVDA)"),
      price: x.price,
      changePercent: x.changesPercentage
    }));
  } catch(e){ console.warn(e); return []; }
}
async function fetchCoins(){
  try{
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",{cache:"no-store"});
    if(!r.ok) throw new Error("cg fail");
    const j = await r.json();
    return [
      { key:"BTC", label:"Bitcoin", price:j.bitcoin.usd, changePercent:j.bitcoin.usd_24h_change },
      { key:"ETH", label:"Ethereum", price:j.ethereum.usd, changePercent:j.ethereum.usd_24h_change },
    ];
  }catch(e){ console.warn(e); return []; }
}
async function loadMarkets(){
  const [stocks, coins] = await Promise.all([fetchStocks(), fetchCoins()]);
  return [...stocks, ...coins];
}
function rotateMarkets(containerId="prices"){
  const box = document.getElementById(containerId);
  if(!box) return;
  const fmt = (n)=> new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n);
  let items = []; let i = 0;
  async function tick(){
    if(items.length===0){
      box.textContent = "Loading prices…";
      items = await loadMarkets();
      if(items.length===0){ box.textContent = "Prices unavailable."; return; }
    }
    const it = items[i % items.length]; i++;
    const color = (it.changePercent>=0) ? "#86efac" : "#fda4af";
    box.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div style="text-transform:uppercase">${it.label}</div>
        <div style="text-align:right">
          <div>${fmt(it.price)}</div>
          <div style="color:${color};font-size:12px">${(it.changePercent??0).toFixed(2)}%</div>
        </div>
      </div>`;
  }
  tick();
  setInterval(tick, 5000);
}

// ---------- Supabase: posts helpers (now status-aware) ----------
async function dbLoadPosts({ from=0, to=4, topic=null, tag=null }={}){
  let q = sb.from('posts')
      .select('*')
      .eq('status','published')
      .order('ts', { ascending:false })
      .range(from, to);
  if(topic && topic!=="All") q = q.eq('topic', topic);
  if(tag) q = q.contains('tags', [tag]);
  const { data, error } = await q;
  if(error){ console.warn(error); return []; }
  return data || [];
}
async function dbGetPost(id){
  const { data, error } = await sb.from('posts').select('*').eq('id', id).maybeSingle();
  if(error) throw error;
  return data;
}
async function dbInsertPost(post){
  const { error } = await sb.from('posts').insert(post);
  if(error) throw error;
}
async function dbUpdatePost(id, updates){
  const { error } = await sb.from('posts').update(updates).eq('id', id);
  if(error) throw error;
}
async function dbDeletePost(id){
  const { error } = await sb.from('posts').delete().eq('id', id);
  if(error) throw error;
}

// ---------- Favorites helpers ----------
async function getUserId(){
  const { data: { user } } = await sb.auth.getUser();
  return user?.id || null;
}
// Cache per page view
let FAVORITES_SET = new Set();
let FAVORITES_READY = false;

async function loadMyFavoritesSet(){
  const uid = await getUserId();
  FAVORITES_SET = new Set();
  FAVORITES_READY = false;
  if(!uid){ FAVORITES_READY = true; return; }
  const { data, error } = await sb.from('favorites').select('post_id').eq('user_id', uid).limit(10000);
  if(!error && data){
    data.forEach(r => FAVORITES_SET.add(r.post_id));
  }
  FAVORITES_READY = true;
}
async function isFavorited(postId){
  if(!FAVORITES_READY) await loadMyFavoritesSet();
  return FAVORITES_SET.has(postId);
}
async function toggleFavorite(postId){
  const uid = await getUserId();
  if(!uid){ alert("Please log in to save favorites."); return { ok:false, liked:false }; }
  const liked = FAVORITES_SET.has(postId);
  if(liked){
    const { error } = await sb.from('favorites').delete().eq('user_id', uid).eq('post_id', postId);
    if(!error){ FAVORITES_SET.delete(postId); return { ok:true, liked:false }; }
    else{ alert(error.message); return { ok:false, liked:true }; }
  }else{
    const { error } = await sb.from('favorites').insert({ user_id: uid, post_id: postId });
    if(!error){ FAVORITES_SET.add(postId); return { ok:true, liked:true }; }
    else{
      if((error?.message||'').toLowerCase().includes('duplicate')){ FAVORITES_SET.add(postId); return { ok:true, liked:true }; }
      alert(error.message); return { ok:false, liked:false };
    }
  }
}
async function getFavoriteCountsFor(postIds=[]){
  if(postIds.length===0) return {};
  const { data, error } = await sb.from('favorites').select('post_id').in('post_id', postIds).limit(5000);
  if(error){ console.warn(error); return {}; }
  const map = {};
  data.forEach(r => { map[r.post_id] = (map[r.post_id]||0)+1; });
  return map;
}

// ---------- Home feed (5-post paging + tags) ----------
async function renderHome(){
  renderFooter();
  await renderHeader();
  rotateMarkets("prices");

  const topicsEl = document.getElementById("topics");
  const tagsEl = document.getElementById("tags");
  const storiesEl = document.getElementById("stories");

  const topics = ["All","Crypto","US Politics","World","Regulation","Opinion"];
  let topicFilter = "All";
  let tagFilter = null;
  let pageSize = 5;
  let loaded = []; // accumulated posts

  function listTags(all){
    const s = new Set();
    (all||[]).forEach(p => (p.tags||[]).forEach(t => s.add(t)));
    return [...s].sort();
  }

  async function refreshTags(){
    const first = await dbLoadPosts({ from:0, to:49 });
    tagsEl && (tagsEl.innerHTML = listTags(first).map(t=>`<button data-t="${t}">#${t}</button>`).join(""));
    $$("#tags button").forEach(b => {
      b.onclick = async ()=>{ tagFilter = b.getAttribute("data-t"); loaded = []; await drawStories(true); };
    });
    if(tagsEl){
      const clear = document.createElement("button");
      clear.textContent = "Clear tags";
      clear.onclick = async ()=>{ tagFilter=null; loaded=[]; await drawStories(true); };
      tagsEl.appendChild(clear);
    }
  }

  function drawTopics(){
    if(!topicsEl) return;
    topicsEl.innerHTML = "";
    topics.forEach(t=>{
      const b = document.createElement("button");
      b.textContent = t;
      if(t===topicFilter) b.style.background="rgba(255,255,255,.18)";
      b.onclick = async ()=>{ topicFilter=t; loaded=[]; await drawStories(true); drawTopics(); };
      topicsEl.appendChild(b);
    });
  }

  function storyCardHTML(item, countsMap, liked){
    const count = countsMap[item.id] || 0;
    const likeCls = liked ? "heart-btn liked" : "heart-btn";
    const bodyPreview = item.content_html
      ? item.content_html.replace(/<[^>]*>/g,'').slice(0,180)
      : (item.content||"").split("\n")[0].slice(0,180);
    return `
      <article class="story" style="margin:18px 0 26px">
        <div class="imgwrap"><img src="${asImageUrl(item.image)}" alt="cover"></div>
        <div>
          <div class="row" style="gap:8px;margin-bottom:6px">
            <span class="badge">${item.topic}</span>
            ${(item.tags||[]).slice(0,3).map(t=>`<span class="badge">#${t}</span>`).join("")}
          </div>
          <h2 style="margin:6px 0 4px"><a href="post.html?id=${encodeURIComponent(item.id)}" style="color:#e9eef7;text-decoration:none">${item.title}</a></h2>
          <div class="mut" style="font-size:14px">${new Date(item.ts).toLocaleString()} • ${item.byline||"AutoNews Desk"}</div>
          <p style="margin-top:8px">${bodyPreview}...</p>
          <div style="margin-top:8px" class="row">
            <a href="post.html?id=${encodeURIComponent(item.id)}">Read article</a>
            <button class="${likeCls}" data-like="${item.id}" style="margin-left:auto">
              <span class="heart">♥</span> <span class="cnt">${count}</span>
            </button>
          </div>
        </div>
      </article>`;
  }

  async function wireHearts(scope){
    $$('button[data-like]', scope).forEach(btn=>{
      btn.onclick = async ()=>{
        const pid = btn.getAttribute('data-like');
        const wasLiked = btn.classList.contains('liked');
        const cntEl = btn.querySelector('.cnt');
        const current = parseInt(cntEl.textContent || "0", 10);
        btn.classList.toggle('liked', !wasLiked);
        cntEl.textContent = String(Math.max(0, current + (wasLiked ? -1 : +1)));
        const res = await toggleFavorite(pid);
        if(!res.ok){
          btn.classList.toggle('liked', wasLiked);
          cntEl.textContent = String(current);
        }
      };
    });
  }

  async function drawStories(reset=false){
    const from = loaded.length;
    const to = from + pageSize - 1;
    const next = await dbLoadPosts({ from, to, topic: topicFilter, tag: tagFilter });
    if(reset) storiesEl.innerHTML = "";
    loaded = reset ? next : loaded.concat(next);

    await loadMyFavoritesSet();
    const countsMap = await getFavoriteCountsFor(next.map(p=>p.id));
    const html = next.map(item => storyCardHTML(item, countsMap, FAVORITES_SET.has(item.id))).join("");
    const frag = document.createElement('div');
    frag.innerHTML = html;
    storiesEl.appendChild(frag);
    await wireHearts(frag);

    const moreId = "loadMore";
    const prev = document.getElementById(moreId);
    if(prev) prev.remove();
    if(next.length === pageSize){
      const more = document.createElement("div");
      more.id = moreId;
      more.style.marginTop = "12px";
      more.innerHTML = `<a href="#" class="badge">Load more</a>`;
      more.onclick = async (e)=>{ e.preventDefault(); await drawStories(false); };
      storiesEl.appendChild(more);
    }
  }

  // Realtime refresh on posts changes
  sb.channel('posts-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, async () => {
      loaded = [];
      await drawStories(true);
      await refreshTags();
    })
    .subscribe();

  await refreshTags();
  drawTopics();
  await drawStories(true);
}

// ---------- Login page ----------
async function renderLogin(){
  renderFooter();
  await renderHeader();

  const tabBtns = $$(".tabbtn");
  const panes = $$(".tabpane");
  tabBtns.forEach((btn,idx)=> btn.onclick=()=>{
    tabBtns.forEach(b=>b.classList.remove("primary"));
    panes.forEach(p=>p.style.display="none");
    btn.classList.add("primary"); panes[idx].style.display="block";
  });
  if(tabBtns[0]) tabBtns[0].click();

  $("#loginForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const email = $("#loginEmail").value.trim();
    const pw = $("#loginPass").value;
    try{
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if(error) throw error;
      const { data: prof } = await sb.from('user_profiles').select('role').eq('email', email).maybeSingle();
      setSession({ email, role: prof?.role || 'user', ts: Date.now() });
      alert("Signed in!");
      location.href = "account.html";
    }catch(err){ alert(err.message); }
  });

  $("#regForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const email = $("#regEmail").value.trim();
    const pw = $("#regPass").value;
    try{
      const { error } = await sb.auth.signUp({ email, password: pw });
      if(error) throw error;
      const { data: prof } = await sb.from('user_profiles').select('role').eq('email', email).maybeSingle();
      setSession({ email, role: prof?.role || 'user', ts: Date.now() });
      alert("Account created.");
      location.href = "account.html";
    }catch(err){ alert(err.message); }
  });
}

// ---------- WebLLM (in-browser) ----------
let webllmEngine = null;
let webllmImporting = null;

async function ensureWebLLM(modelId="Llama-3-8B-Instruct-q4f16_1-MLC"){
  if(webllmEngine) return webllmEngine;
  if(!webllmImporting){
    webllmImporting = (async ()=>{
      const statusEl = document.getElementById("webllmStatus");
      const webllm = await import("https://esm.run/@mlc-ai/web-llm"); // CDN import
      const { CreateMLCEngine } = webllm;

      const engine = await CreateMLCEngine(
        modelId,
        {
          initProgressCallback: (p)=>{
            if(statusEl){
              const pct = Math.floor((p.progress || 0) * 100);
              statusEl.textContent = `Model: ${p.text || 'loading'} ${isFinite(pct)? pct:0}%`;
            }
          }
        }
      );
      if(statusEl) statusEl.textContent = "Model ready";
      return engine;
    })();
  }
  webllmEngine = await webllmImporting;
  return webllmEngine;
}

function buildDraftPrompt({ topic, tone='confident, clear', audience='general', sourcesText='' }){
  const sources = (sourcesText||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const srcList = sources.map((u,i)=>`[${i+1}] ${u}`).join("\n") || "(none)";

  const system = `
You are a meticulous news writer. House style:
- SEO title (<=60 chars), Meta description (<=155).
- TL;DR: 3–5 bullets.
- Body: 900–1400 words, H2/H3 subheads every 2–4 paragraphs, professional but slightly click-baity (no lies).
- Cover both pros and cons.
- NO fabricated quotes. Use direct quotes ONLY if contained in Provided Sources; otherwise paraphrase neutrally.
- Inline citations like [1], [2] that refer to "Sources" section at end with titles + URLs.
- Voice: ${tone}. Audience: ${audience}.
  `.trim();

  const user = `
Topic: ${topic}

Provided Sources (authoritative; only quote from here):
${srcList}
  `.trim();

  return { system, user };
}

async function generateWithWebLLM({ topic, tone, audience, sources }){
  const engine = await ensureWebLLM();
  const { system, user } = buildDraftPrompt({ topic, tone, audience, sourcesText: sources });

  const chunks = await engine.chat.completions.create({
    messages: [
      { role:"system", content: system },
      { role:"user",   content: user }
    ],
    temperature: 0.7,
    stream: true
  });

  // Stream to a buffer
  let md = "";
  for await (const ch of chunks) {
    md += ch.choices?.[0]?.delta?.content || "";
  }
  if(!md.trim()) throw new Error("Model returned empty draft");
  return md.trim();
}

// ---------- Admin page ----------
async function renderAdmin(){
  renderFooter();
  await renderHeader();

  // Require admin
  const { data: { session } } = await sb.auth.getSession();
  const email = session?.user?.email;
  if(!email){ alert("Please log in."); location.href="login.html"; return; }
  const { data: prof } = await sb.from('user_profiles').select('role').eq('email', email).maybeSingle();
  if((prof?.role || "user") !== "admin"){ alert("Admin only."); location.href="login.html"; return; }

  const form = $("#postForm");
  const listEl = $("#postList");

  // ====== AI Draft Generator bindings ======
  const draftForm = $("#draftForm");
  const draftNotice = $("#draftNotice");
  const btnLoadModel = $("#btnLoadModel");

  btnLoadModel.addEventListener("click", async ()=>{
    try{
      draftNotice.textContent = "Loading model…";
      await ensureWebLLM(); // will update #webllmStatus
      draftNotice.textContent = "Model ready.";
    }catch(e){
      draftNotice.textContent = "Failed to load model.";
    }
  });

  draftForm.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fd = new FormData(draftForm);
    const topic = (fd.get("topic")||"").toString().trim();
    const tone = (fd.get("tone")||"").toString().trim();
    const audience = (fd.get("audience")||"").toString().trim();
    const sources = (fd.get("sources")||"").toString();

    if(!topic){ draftNotice.textContent = "Enter a topic."; return; }

    try{
      draftNotice.textContent = "Generating draft…";
      const md = await generateWithWebLLM({ topic, tone, audience, sources });

      // Extract fields from md
      const title = (md.match(/SEO title:\s*(.*)/i)?.[1] || topic).replace(/["'#]/g,"").trim();
      const meta = (md.match(/Meta description:\s*(.*)/i)?.[1] || "").slice(0,155);
      const tldr = (md.match(/TL;DR[\s\S]*?(?=\n\n|$)/i)?.[0] || "").trim();

      const html = mdToHtml(md);

      // Save as DRAFT in posts table
      const { error, data } = await sb.from("posts").insert({
        title, image: null, topic: "World", tags: [],
        byline: "AutoNews Desk",
        author_email: email,
        status: "draft",
        content_md: md,
        content_html: html,
        ts: nowISO()
      }).select().single();

      if(error) throw error;
      draftNotice.textContent = "Draft created.";
      await loadDrafts(); // refresh drafts panel
    }catch(err){
      console.error(err);
      draftNotice.textContent = "Error: " + (err.message || "generation failed");
    }
  });

  // ====== Manual Post publish (unchanged, but sets status=published) ======
  form.onsubmit = async (e)=>{
    e.preventDefault();

    // 1) Get file (if any) and optional URL
    const fileInput = document.getElementById("imageFile");
    const urlField  = document.getElementById("image");
    let imageUrl = (urlField.value || "").trim() || null;

    // 2) If a file is selected, upload it to Supabase Storage
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const path = `posts/${Date.now()}_${file.name}`;

      const up = await sb.storage.from("images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (up.error) {
        alert("Image upload failed: " + up.error.message);
        return;
      }
      // 3) Get a public URL for the uploaded file
      const { data } = sb.storage.from("images").getPublicUrl(path);
      imageUrl = data?.publicUrl || imageUrl;
      console.log('upload result:', up);
      console.log('public url:', imageUrl);
    }

    const post = {
      title: document.getElementById("title").value.trim(),
      image: imageUrl,
      topic: document.getElementById("topic").value,
      tags: toTags(document.getElementById("tags").value),
      byline: "AutoNews Desk",
      author_email: (await sb.auth.getSession()).data.session.user.email,
      content: document.getElementById("content").value.trim(),
      status: "published",
      ts: nowISO()
    };

    if (!post.title || !post.content) { alert("Title and Article are required."); return; }

    try {
      await dbInsertPost(post);
      alert("Post published!");
      form.reset();
      await drawList();
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // ====== Admin: Drafts panel ======
  async function loadDrafts(){
    const el = $("#draftList");
    if(!el) return;

    const { data, error } = await sb
      .from("posts")
      .select("id, created_at, ts, title, content_md, content_html")
      .eq("status","draft")
      .order("ts", { ascending: false });

    if (error) { el.innerHTML = `<div class="mut">Error loading drafts</div>`; return; }
    if (!data?.length) { el.innerHTML = `<div class="mut">No drafts yet</div>`; return; }

    el.innerHTML = data.map(p => `
      <div class="item" data-id="${p.id}">
        <div class="row">
          <strong>${p.title || "(untitled)"} </strong>
          <span class="mut">• ${new Date(p.ts || p.created_at).toLocaleString()}</span>
        </div>
        <div class="post-preview">${p.content_html || mdToHtml(p.content_md || "")}</div>
        <div class="actions" style="margin-top:8px">
          <button class="edit">✏️ Edit</button>
          <button class="approve">✅ Publish</button>
          <button class="reject">🗑️ Reject</button>
        </div>
      </div>
    `).join("");

    // bind buttons
    el.querySelectorAll(".item").forEach(node => {
      const id = node.getAttribute("data-id");
      node.querySelector(".approve")?.addEventListener("click", async () => {
        node.querySelector(".approve").disabled = true;
        await dbUpdatePost(id, { status:"published", ts: nowISO(), published_at: nowISO() });
        await loadDrafts();
        await drawList();
      });
      node.querySelector(".reject")?.addEventListener("click", async () => {
        node.querySelector(".reject").disabled = true;
        await dbUpdatePost(id, { status:"rejected", ts: nowISO() });
        await loadDrafts();
      });
      node.querySelector(".edit")?.addEventListener("click", async () => openEditModal(id));
    });
  }

  // ====== Admin: All Posts table (published only) ======
  async function drawList(){
    const posts = await dbLoadPosts({ from:0, to:49 });
    listEl.innerHTML = `
      <tr><th>Date</th><th>Title</th><th>Topic</th><th>Tags</th><th>Actions</th></tr>
      ${posts.map(p=>`
        <tr>
          <td>${new Date(p.ts).toLocaleString()}</td>
          <td><a href="post.html?id=${encodeURIComponent(p.id)}">${p.title}</a></td>
          <td>${p.topic}</td>
          <td>${(p.tags||[]).map(t=>`#${t}`).join(" ")}</td>
          <td><button class="danger" data-del="${p.id}">Delete</button></td>
        </tr>
      `).join("")}
    `;
    $$("button[data-del]").forEach(b=>{
      b.onclick = async ()=>{
        if(confirm("Delete this post?")){
          await dbDeletePost(b.getAttribute("data-del"));
          await drawList();
        }
      };
    });
  }

  sb.channel('posts-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, async ()=>{
      await loadDrafts();
      await drawList();
    })
    .subscribe();

  rotateMarkets("prices");
  await loadDrafts();
  await drawList();

  // ====== Edit Modal Wireup ======
  modal.init();
}

// ---------- Edit Modal helpers ----------
const modal = {
  root: null, title: null, closeBtn: null, md: null, preview: null, saveBtn: null, publishBtn: null, postId: null,
  init() {
    this.root = document.getElementById("editModal");
    this.title = document.getElementById("editTitle");
    this.closeBtn = document.getElementById("editClose");
    this.md = document.getElementById("editMd");
    this.preview = document.getElementById("editPreview");
    this.saveBtn = document.getElementById("saveEdits");
    this.publishBtn = document.getElementById("publishEdits");

    this.closeBtn?.addEventListener("click", () => this.hide());
    this.root?.addEventListener("click", (e) => { if (e.target === this.root) this.hide(); });
    this.md?.addEventListener("input", () => { this.preview.innerHTML = mdToHtml(this.md.value); });
    this.saveBtn?.addEventListener("click", async () => {
      await saveEdits(this.postId, this.md.value);
      this.preview.innerHTML = mdToHtml(this.md.value);
    });
    this.publishBtn?.addEventListener("click", async () => {
      await saveEdits(this.postId, this.md.value);
      await dbUpdatePost(this.postId, { status:"published", ts: nowISO(), published_at: nowISO() });
      this.hide();
    });
  },
  show() { this.root.classList.remove("hidden"); this.root.setAttribute("aria-hidden","false"); },
  hide() { this.root.classList.add("hidden"); this.root.setAttribute("aria-hidden","true"); this.postId=null; }
};

async function openEditModal(id) {
  const { data, error } = await sb.from("posts")
    .select("id, title, content_md, content_html")
    .eq("id", id).maybeSingle();

  if (error || !data) return;

  modal.postId = id;
  modal.title.textContent = `Edit: ${data.title || "(untitled)"}`;
  modal.md.value = data.content_md || "";
  modal.preview.innerHTML = data.content_html || mdToHtml(data.content_md || "");
  modal.show();
}

async function saveEdits(id, newMd) {
  const newHtml = mdToHtml(newMd);
  const { error } = await sb.from("posts")
    .update({ content_md: newMd, content_html: newHtml, ts: nowISO() })
    .eq("id", id);
  if (error) alert("Save failed: " + error.message);
}

// ---------- Article page ----------
async function renderPost(){
  renderFooter();
  await renderHeader();

  const id = new URLSearchParams(location.search).get("id");
  const view = $("#postView");
  try{
    const post = await dbGetPost(id);
    if(!post){ view.innerHTML = `<div class="card">Article not found.</div>`; return; }

    await loadMyFavoritesSet();
    const liked = FAVORITES_SET.has(post.id);
    const { postCount } = await (async ()=>{
      const m = await getFavoriteCountsFor([post.id]);
      return { postCount: m[post.id] || 0 };
    })();

    const bodyHTML = post.content_html
      ? post.content_html
      : (post.content||"").split("\n\n").map(par=>`<p>${par.replace(/\n/g,"<br>")}</p>`).join("");

    view.innerHTML = `
      <article class="card">
        <div class="imgwrap" style="height:300px;margin-bottom:12px"><img src="${asImageUrl(post.image)}" alt="cover"></div>
        <div class="row" style="justify-content:space-between;align-items:center">
          <div>
            <h1 style="font-size:32px;margin:6px 0">${post.title}</h1>
            <div class="mut" style="font-size:14px">${new Date(post.ts).toLocaleString()} • ${post.byline||"AutoNews Desk"}</div>
            <div class="chips" style="margin:8px 0">${(post.tags||[]).map(t=>`<span class="badge">#${t}</span>`).join("")}</div>
          </div>
          <button class="heart-btn ${liked?'liked':''}" data-like="${post.id}">
            <span class="heart">♥</span> <span class="cnt">${postCount}</span>
          </button>
        </div>
        <hr>
        <div class="content" style="font-size:18px">${bodyHTML}</div>
        <hr>
        <div class="row" style="justify-content:space-between">
          <a href="index.html">← Back to Home</a>
          <button id="copyBtn">Copy share text</button>
        </div>
      </article>
    `;
    $("#copyBtn").onclick = ()=>{ navigator.clipboard.writeText(`${post.title} — ${location.href}`); };

    // Wire heart
    const btn = $('button[data-like]');
    if(btn){
      btn.onclick = async ()=>{
        const wasLiked = btn.classList.contains('liked');
        const cntEl = btn.querySelector('.cnt');
        const current = parseInt(cntEl.textContent || "0", 10);
        btn.classList.toggle('liked', !wasLiked);
        cntEl.textContent = String(Math.max(0, current + (wasLiked ? -1 : +1)));
        const res = await toggleFavorite(post.id);
        if(!res.ok){
          btn.classList.toggle('liked', wasLiked);
          cntEl.textContent = String(current);
        }
      };
    }
  }catch(e){
    view.innerHTML = `<div class="card">Error loading article.</div>`;
  }
}

// ---------- Account page (favorites list) ----------
async function renderAccount(){
  renderFooter();
  await renderHeader();

  const { data: { session } } = await sb.auth.getSession();
  const email = session?.user?.email;
  if(!email){ alert("Please log in."); location.href="login.html"; return; }

  const acctMeta = $("#acctMeta");
  acctMeta.textContent = `Signed in as ${email}`;

  const favList = $("#favList");
  const favMore = $("#favMore");
  const favCount = $("#favCount");

  const uid = await getUserId();
  let pageSize = 12;
  let offset = 0;

  async function loadFavoritesPage(from=0, limit=pageSize){
    const { data: favRows, error } = await sb
      .from('favorites')
      .select('post_id, created_at', { count: 'exact' })
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if(error){ favList.innerHTML = `<div class="mut">Error loading favorites.</div>`; return { rows:[], count:0 }; }

    const ids = (favRows||[]).map(r => r.post_id);
    if(ids.length === 0) return { rows:[], count: 0 };

    const { data: posts, error: pErr } = await sb
      .from('posts')
      .select('*')
      .in('id', ids)
      .eq('status','published');

    if(pErr){ console.warn(pErr); return { rows:[], count: (favRows||[]).length }; }

    const postMap = Object.fromEntries((posts||[]).map(p=>[p.id,p]));
    const rows = (favRows||[]).map(r => postMap[r.post_id]).filter(Boolean);
    return { rows, count: (favRows||[]).length };
  }

  function cardRow(p){
    return `
      <article class="row" style="gap:12px;align-items:center;margin:8px 0;padding:10px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.03)">
        <div class="imgwrap" style="height:68px;width:120px;border-radius:10px;overflow:hidden">
          <img src="${p.image || 'https://picsum.photos/1200/630?blur=2'}" alt="cover">
        </div>
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:8px">
            <span class="badge">${p.topic}</span>
            ${(p.tags||[]).slice(0,3).map(t=>`<span class="badge">#${t}</span>`).join("")}
          </div>
          <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            <a href="post.html?id=${encodeURIComponent(p.id)}" style="color:#e9eef7;text-decoration:none;font-weight:600">${p.title}</a>
          </div>
          <div class="mut" style="font-size:12px">${new Date(p.ts).toLocaleString()} • ${p.byline||"AutoNews Desk"}</div>
        </div>
        <button class="heart-btn liked" data-like="${p.id}">
          <span class="heart">♥</span> <span class="cnt">—</span>
        </button>
      </article>
    `;
  }

  async function drawNext(){
    const { rows } = await loadFavoritesPage(offset, pageSize);
    if(offset === 0){
      favList.innerHTML = rows.length ? "" : `<div class="mut">No favorites yet. Tap ♥ on any article to save it here.</div>`;
    }
    const countsMap = await getFavoriteCountsFor(rows.map(p=>p.id));

    const frag = document.createElement('div');
    frag.innerHTML = rows.map(cardRow).join("");
    $$('button[data-like]', frag).forEach(btn=>{
      const pid = btn.getAttribute('data-like');
      const cntEl = btn.querySelector('.cnt');
      cntEl.textContent = String(countsMap[pid] || 0);
      btn.onclick = async ()=>{
        const wasLiked = btn.classList.contains('liked');
        const current = parseInt(cntEl.textContent || "0", 10);
        btn.classList.toggle('liked', !wasLiked);
        cntEl.textContent = String(Math.max(0, current + (wasLiked ? -1 : +1)));
        const res = await toggleFavorite(pid);
        if(!res.ok){
          btn.classList.toggle('liked', wasLiked);
          cntEl.textContent = String(current);
        } else {
          if(wasLiked){ btn.closest('article')?.remove(); }
        }
      };
    });
    favList.appendChild(frag);

    offset += rows.length;
    const { count } = await sb.from('favorites').select('post_id', { count: 'exact', head:true }).eq('user_id', uid);
    favCount.textContent = `${count||0} saved`;
    favMore.innerHTML = rows.length === pageSize
      ? `<a href="#" class="badge" id="loadMoreFavs">Load more</a>`
      : ``;

    $("#loadMoreFavs")?.addEventListener('click', async (e)=>{
      e.preventDefault(); await drawNext();
    });
  }

  await drawNext();
}

// ---------- Boot per page ----------
document.addEventListener("DOMContentLoaded", async () => {
  const pageAttr = document.body.getAttribute("data-page");
  await renderHeader();
  renderFooter();
  if(pageAttr==="home") await renderHome();
  if(pageAttr==="login") await renderLogin();
  if(pageAttr==="admin") await renderAdmin();
  if(pageAttr==="post") await renderPost();
  if(pageAttr==="account") await renderAccount();
});

// Helper: image URLs and storage
function asImageUrl(v){
  const fallback = 'https://picsum.photos/1200/630?blur=2';
  if (!v) return fallback;
  if (/^https?:\/\//i.test(v)) return `${v}?v=${Date.now()}`;
  const { data } = sb.storage.from('images').getPublicUrl(v);
  return data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : fallback;
}
