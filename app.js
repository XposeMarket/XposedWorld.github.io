
/* AutoNews Lite — static, no-Node site
 * Storage: localStorage
 * Auth: email+password (salted SHA-256). Admin is chosen by email (ADMIN_EMAIL).
 * Posts: stored in localStorage 'autonews_posts'
 * Session: localStorage 'autonews_session' { email, role, ts }
 * IMPORTANT: This is not production-secure. It's meant for offline/static use only.
 */

const ADMIN_EMAIL = "Xposemarket@gmail.com"; // <-- change to your email to be admin

// ---------- Utils ----------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const now = () => Date.now();
function uid(prefix="p"){return prefix+"_"+Math.random().toString(36).slice(2)+Date.now().toString(36)}
function toTitleCase(s){return s.replace(/\S+/g, w => w[0].toUpperCase()+w.slice(1));}

async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function readJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

// ---------- Users & Auth ----------
function loadUsers(){ return readJSON("autonews_users", []); }
function saveUsers(u){ writeJSON("autonews_users", u); }
function currentSession(){ return readJSON("autonews_session", null); }
function setSession(s){ writeJSON("autonews_session", s); }

async function createAccount(email, password){
  email = email.trim().toLowerCase();
  const users = loadUsers();
  if(users.find(u=>u.email===email)) throw new Error("Account already exists.");
  const salt = uid("salt");
  const hash = await sha256Hex(salt+password);
  const role = (email===ADMIN_EMAIL) ? "admin" : "user";
  users.push({ email, salt, hash, role, createdAt: now() });
  saveUsers(users);
  setSession({ email, role, ts: now() });
}

async function login(email, password){
  email = email.trim().toLowerCase();
  const users = loadUsers();
  const user = users.find(u=>u.email===email);
  if(!user) throw new Error("No account for that email.");
  const hash = await sha256Hex(user.salt + password);
  if(hash !== user.hash) throw new Error("Invalid password.");
  setSession({ email, role: user.role, ts: now() });
}

function logout(){
  localStorage.removeItem("autonews_session");
  // do not remove data
}

// ---------- Posts ----------
function loadPosts(){
  const seedIfEmpty = () => {
    const demo = [
      { id: uid(), title:"Bitcoin holds $60k as miners rotate; ETH eyes upgrade", image:"https://images.unsplash.com/photo-1641260587932-f7bd6e2dbe0c?q=80&w=1600&auto=format&fit=crop", topic:"Crypto", tags:["bitcoin","eth","markets"], byline:"AutoNews Desk", author:"system", ts: now()-3600_000, content:"Markets stayed range-bound as miners rotated hash power and fees normalized. On‑chain shows miner outflows cooling, while L2 activity remains strong.\n\nKey drivers:\n- Macro remains mixed as rates path softens\n- Exchange inflows stabilize\n- ETF flows continue to oscillate" },
      { id: uid(), title:"House panel advances digital asset bill", image:"https://images.unsplash.com/photo-1555967522-37949fc21dcb?q=80&w=1600&auto=format&fit=crop", topic:"US Politics", tags:["policy","stablecoins"], byline:"AutoNews Capitol", author:"system", ts: now()-7200_000, content:"The committee advanced a measure to clarify stablecoin oversight; final text remains in flux. Observers expect amendments addressing state charters.\n\nWhat’s next:\n- Full House calendar review\n- Senate working group response" },
      { id: uid(), title:"Global markets react to rate path shift", image:"https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=1600&auto=format&fit=crop", topic:"World", tags:["macro","fx"], byline:"Economy Desk", author:"system", ts: now()-10800_000, content:"EM rallies as dollar softens; crypto tracks risk‑on tone. Commodities mixed as supply headlines fade.\n\nWatch:\n- US CPI next week\n- Oil inventories\n- Asia PMIs" },
    ];
    writeJSON("autonews_posts", demo);
    return demo;
  };
  return readJSON("autonews_posts", null) || seedIfEmpty();
}
function savePosts(posts){ writeJSON("autonews_posts", posts); }
function getPost(id){ return loadPosts().find(p=>p.id===id); }
function deletePost(id){ const posts = loadPosts().filter(p=>p.id!==id); savePosts(posts); }

function listTags(posts){
  const set = new Set();
  posts.forEach(p=> (p.tags||[]).forEach(t=>set.add(t)));
  return [...set].sort();
}

// ---------- Header / Footer ----------
function renderHeader(){
  const s = currentSession();
  const el = document.getElementById("site-header");
  if(!el) return;
  el.innerHTML = `
    <header>
      <div class="wrap row">
        <div class="brand"><a href="index.html" style="text-decoration:none;color:inherit">AutoNews<span>.AI</span></a></div>
        <nav class="nav ml-auto">
          <a href="index.html">Home</a>
          <a href="login.html" id="acctLink">${s? "Account" : "Login"}</a>
          ${s && s.role==="admin" ? `<a href="admin.html">Admin</a>` : ""}
          ${s ? `<button id="btnLogout" title="Sign out">Logout</button>` : ""}
        </nav>
      </div>
    </header>
  `;
  const btn = document.getElementById("btnLogout");
  if(btn) btn.onclick = ()=>{ logout(); location.href="index.html"; };
}

function renderFooter(){
  const el = document.getElementById("site-footer");
  if(!el) return;
  el.innerHTML = `
    <footer class="wrap" style="padding:8px 16px 24px">
      <div class="row" style="justify-content:space-between">
        <div>© ${new Date().getFullYear()} AutoNews.AI — static demo</div>
        <div class="mut">Built for offline use • Data saved in your browser</div>
      </div>
    </footer>
  `;
}

// ---------- Markets (SPY, DIA, NVDA, BTC, ETH) rotate ----------
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
  } catch(e){
    console.warn("Stocks unavailable", e);
    return [];
  }
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
  }catch(e){
    console.warn("Coins unavailable", e);
    return [];
  }
}

async function loadMarkets(){
  const [stocks, coins] = await Promise.all([fetchStocks(), fetchCoins()]);
  return [...stocks, ...coins];
}

function rotateMarkets(containerId="prices"){
  const box = document.getElementById(containerId);
  if(!box) return;
  const fmt = (n)=> new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}).format(n);
  let items = [];
  let i = 0;

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
      </div>
    `;
  }
  tick();
  setInterval(tick, 5000);
}

// ---------- Home feed ----------
function renderHome(){
  renderHeader(); renderFooter();
  rotateMarkets("prices");

  const posts = loadPosts();
  const topicsEl = document.getElementById("topics");
  const storiesEl = document.getElementById("stories");
  const tagsEl = document.getElementById("tags");

  const topics = ["All","Crypto","US Politics","World","Regulation","Opinion"];
  let topicFilter = "All";
  let tagFilter = null;

  function applyFilters(list){
    return list.filter(p => (topicFilter==="All" || p.topic===topicFilter) && (!tagFilter || (p.tags||[]).includes(tagFilter)));
  }

  function drawTopics(){
    topicsEl.innerHTML = "";
    topics.forEach(t=>{
      const b = document.createElement("button");
      b.textContent = t;
      if(t===topicFilter) b.style.background="rgba(255,255,255,.18)";
      b.onclick = ()=>{ topicFilter=t; drawTopics(); drawStories(); };
      topicsEl.appendChild(b);
    });
  }

  function drawTags(){
    const tags = listTags(posts);
    tagsEl.innerHTML = tags.map(t=>`<button data-t="${t}">#${t}</button>`).join("");
    $$("#tags button").forEach(b=>{
      b.onclick = ()=>{ tagFilter = b.getAttribute("data-t"); drawStories(); };
    });
    const clear = document.createElement("button");
    clear.textContent = "Clear tags";
    clear.onclick = ()=>{ tagFilter=null; drawStories(); };
    tagsEl.appendChild(clear);
  }

  function drawStories(){
    const list = applyFilters(posts);
    storiesEl.innerHTML = list.map(item=>`
      <article class="story" style="margin:18px 0 26px">
        <div class="imgwrap"><img src="${item.image}" alt="cover"></div>
        <div>
          <div class="row" style="gap:8px;margin-bottom:6px">
            <span class="badge">${item.topic}</span>
            ${ (item.tags||[]).slice(0,3).map(t=>`<span class="badge">#${t}</span>`).join("") }
          </div>
          <h2 style="margin:6px 0 4px"><a href="post.html?id=${encodeURIComponent(item.id)}">${item.title}</a></h2>
          <div class="mut" style="font-size:14px">${new Date(item.ts).toLocaleString()} • ${item.byline||"AutoNews Desk"}</div>
          <p style="margin-top:8px">${(item.content||"").split("\n")[0].slice(0,180)}...</p>
          <div style="margin-top:8px" class="row">
            <a href="post.html?id=${encodeURIComponent(item.id)}">Read article</a>
          </div>
        </div>
      </article>
    `).join("");
  }

  drawTopics();
  drawTags();
  drawStories();
}

// ---------- Login page ----------
function renderLogin(){
  renderHeader(); renderFooter();
  const tabBtns = $$(".tabbtn");
  const panes = $$(".tabpane");
  tabBtns.forEach((btn,idx)=> btn.onclick=()=>{
    tabBtns.forEach(b=>b.classList.remove("primary"));
    panes.forEach(p=>p.style.display="none");
    btn.classList.add("primary"); panes[idx].style.display="block";
  });
  // default tab
  if(tabBtns[0]) tabBtns[0].click();

  $("#loginForm").onsubmit = async (e)=>{
    e.preventDefault();
    const email = $("#loginEmail").value;
    const pw = $("#loginPass").value;
    try{
      await login(email, pw);
      alert("Signed in!");
      location.href = "index.html";
    }catch(err){ alert(err.message); }
  };

  $("#regForm").onsubmit = async (e)=>{
    e.preventDefault();
    const email = $("#regEmail").value;
    const pw = $("#regPass").value;
    try{
      await createAccount(email, pw);
      alert(`Account created${email.toLowerCase()===ADMIN_EMAIL?' (admin)':''}.`);
      location.href = "index.html";
    }catch(err){ alert(err.message); }
  };
}

// ---------- Admin page ----------
function renderAdmin(){
  renderHeader(); renderFooter();
  const s = currentSession();
  if(!s || s.role!=="admin"){ alert("Admin only."); location.href="login.html"; return; }

  const form = $("#postForm");
  const listEl = $("#postList");

  function toTags(str){
    return (str||"")
      .split(/[\s,]+/g)
      .map(t=>t.replace(/^#/,"").trim().toLowerCase())
      .filter(Boolean);
  }

  function drawList(){
    const posts = loadPosts().sort((a,b)=>b.ts-a.ts);
    listEl.innerHTML = posts.map(p=>`
      <tr>
        <td>${new Date(p.ts).toLocaleString()}</td>
        <td><a href="post.html?id=${encodeURIComponent(p.id)}">${p.title}</a></td>
        <td>${p.topic}</td>
        <td>${(p.tags||[]).map(t=>`#${t}`).join(" ")}</td>
        <td><button class="danger" data-del="${p.id}">Delete</button></td>
      </tr>
    `).join("");
    $$("button[data-del]").forEach(b=>{
      b.onclick = ()=>{ if(confirm("Delete this post?")){ deletePost(b.getAttribute("data-del")); drawList(); } };
    });
  }

  form.onsubmit = (e)=>{
    e.preventDefault();
    const posts = loadPosts();
    const post = {
      id: uid(),
      title: $("#title").value.trim(),
      image: $("#image").value.trim() || "https://picsum.photos/1200/630?blur=2",
      topic: $("#topic").value,
      tags: toTags($("#tags").value),
      byline: "AutoNews Desk",
      author: currentSession()?.email || "admin",
      ts: now(),
      content: $("#content").value.trim()
    };
    if(!post.title || !post.content){ alert("Title and Article are required."); return; }
    posts.unshift(post);
    savePosts(posts);
    alert("Post published!");
    form.reset();
    drawList();
  };

  drawList();
}

// ---------- Article page ----------
function renderPost(){
  renderHeader(); renderFooter();
  const p = new URLSearchParams(location.search);
  const id = p.get("id");
  const post = id ? getPost(id) : null;
  const view = $("#postView");
  if(!post){ view.innerHTML = `<div class="card">Article not found.</div>`; return; }

  const bodyHTML = (post.content||"")
    .split("\n\n").map(par=>`<p>${par.replace(/\n/g,"<br>")}</p>`).join("");

  view.innerHTML = `
    <article class="card">
      <div class="imgwrap" style="height:300px;margin-bottom:12px"><img src="${post.image}" alt="cover"></div>
      <h1 style="font-size:32px;margin:6px 0">${post.title}</h1>
      <div class="mut" style="font-size:14px">${new Date(post.ts).toLocaleString()} • ${post.byline||"AutoNews Desk"}</div>
      <div class="chips" style="margin:8px 0">${(post.tags||[]).map(t=>`<span class="badge">#${t}</span>`).join("")}</div>
      <hr>
      <div class="content" style="font-size:18px">${bodyHTML}</div>
      <hr>
      <div class="row" style="justify-content:space-between">
        <a href="index.html">← Back to Home</a>
        <button id="copyBtn">Copy share text</button>
      </div>
    </article>
  `;
  $("#copyBtn").onclick = ()=>{
    navigator.clipboard.writeText(`${post.title} — ${location.href}`);
  };
}

// ---------- Boot by page ----------
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  renderHeader();
  renderFooter();
  if(page==="home") renderHome();
  if(page==="login") renderLogin();
  if(page==="admin") renderAdmin();
  if(page==="post") renderPost();
});
