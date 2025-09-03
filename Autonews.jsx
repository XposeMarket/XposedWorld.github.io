import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

// --- Lightweight UI primitives (shadcn-like minimal replacements) ---
const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl shadow-xl border border-white/10 bg-white/5 backdrop-blur p-4 ${className}`}>{children}</div>
);
const Button = ({ children, className = "", ...props }) => (
  <button className={`px-4 py-2 rounded-2xl shadow-md border border-white/10 hover:brightness-110 active:scale-95 transition ${className}`} {...props}>{children}</button>
);
const Badge = ({ children }) => (
  <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">{children}</span>
);

// --- Demo tickers (client-side; swap for server/edge for production limits) ---
async function fetchPrices() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true", { cache: "no-store" });
    if (!res.ok) throw new Error("price fetch failed");
    return await res.json();
  } catch (e) {
    return null;
  }
}

// --- Utilities ---
const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pct = (n) => `${(n ?? 0).toFixed(2)}%`;

// Fake RSS items placeholder while you wire your backend
const sampleStories = [
  { id: "ex1", source: "CoinDesk", topic: "Crypto", title: "Bitcoin holds $60k as miners rotate; ETH eyes upgrade", byline: "Wire", url: "#", summary: "Market sideways as macro stays mixed. On-chain shows miner outflows cool.", image: "https://images.unsplash.com/photo-1641260587932-f7bd6e2dbe0c?q=80&w=1600&auto=format&fit=crop" , ts: Date.now()-3600_000 },
  { id: "ex2", source: "Reuters", topic: "US Politics", title: "House panel advances digital asset bill", byline: "Capitol Bureau", url: "#", summary: "Measure would clarify stablecoin oversight; final text still in flux.", image: "https://images.unsplash.com/photo-1555967522-37949fc21dcb?q=80&w=1600&auto=format&fit=crop", ts: Date.now()-7200_000 },
  { id: "ex3", source: "Al Jazeera", topic: "World", title: "Global markets react to rate path shift", byline: "Economy Desk", url: "#", summary: "Emerging markets rally as dollar softens; crypto tracks risk-on.", image: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=1600&auto=format&fit=crop", ts: Date.now()-10800_000 },
];

export default function AutoNews() {
  const [prices, setPrices] = useState(null);
  const [filter, setFilter] = useState("All");
  const [stories, setStories] = useState(sampleStories);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await fetchPrices();
      if (!alive) return;
      setPrices(data);
    })();
    const id = setInterval(async () => {
      const data = await fetchPrices();
      if (!alive) return;
      setPrices(data);
    }, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const filtered = useMemo(() => (
    filter === "All" ? stories : stories.filter(s => s.topic === filter)
  ), [filter, stories]);

  async function generateWithGrok(topic) {
    // This calls your backend route which wraps the xAI API securely.
    // Create /api/generate (Next.js, Express, etc.). See README in chat.
    try {
      setLoading(true); setStatus("Thinking with Grok…");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic })
      });
      if (!res.ok) throw new Error("Generate failed");
      const item = await res.json();
      // Expected shape: { id, source, topic, title, byline, url, summary, image, ts }
      setStories((old) => [{ ...item }, ...old]);
      setStatus("Draft published");
    } catch (e) {
      console.error(e); setStatus("Failed to generate");
    } finally { setLoading(false); }
  }

  async function autopostLatestToX() {
    try {
      setStatus("Posting to X…");
      const top = stories[0];
      const res = await fetch("/api/autopost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storyId: top?.id }) });
      if (!res.ok) throw new Error("X post failed");
      setStatus("Posted to X ✅");
    } catch (e) { console.error(e); setStatus("X post failed"); }
  }

  return (
    <div className="min-h-screen text-white" style={{ background: "radial-gradient(1200px 800px at 20% -10%, rgba(61,9,121,.35), transparent), radial-gradient(1000px 600px at 80% 10%, rgba(0,212,255,.25), transparent), #0a0b10 url('https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2400&auto=format&fit=crop') center/cover fixed" }}>
      <header className="sticky top-0 z-50 backdrop-blur bg-black/40 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="text-2xl font-black tracking-wide">AutoNews<span className="text-cyan-300">.AI</span></div>
          <div className="ml-auto flex items-center gap-2">
            <input value={topic} onChange={(e)=>setTopic(e.target.value)} placeholder="Give Grok a topic… (e.g., ‘Bitcoin ETF flows today’)" className="w-80 px-3 py-2 rounded-xl bg-white/10 border border-white/10 outline-none" />
            <Button onClick={()=>generateWithGrok(topic)} disabled={!topic || loading} className="bg-cyan-500/20">Generate</Button>
            <Button onClick={autopostLatestToX} className="bg-fuchsia-500/20">AutoPost X</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left rail: Markets + Filters */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Markets Snapshot</h3>
              <Badge>Live</Badge>
            </div>
            <div className="space-y-2 text-sm">
              {prices ? (
                <>
                  {Object.entries(prices).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <div className="uppercase tracking-wide">{k}</div>
                      <div className="text-right">
                        <div>{fmt.format(v.usd)}</div>
                        <div className={`text-xs ${v.usd_24h_change >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(v.usd_24h_change)}</div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="opacity-70">Loading prices…</div>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold mb-3">Topics</h3>
            <div className="flex flex-wrap gap-2">
              {["All", "Crypto", "US Politics", "World", "Regulation", "Opinion"].map(t => (
                <Button key={t} onClick={()=>setFilter(t)} className={`${filter===t? 'bg-white/20': 'bg-white/10'}`}>{t}</Button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold mb-2">Automation Status</h3>
            <div className="text-sm opacity-90 min-h-6">{status || "Idle"}</div>
            <p className="text-xs opacity-70 mt-2">This demo writes new stories client-side from your /api routes. In production, drive this from a cron or queue.</p>
          </Card>
        </div>

        {/* Main feed */}
        <div className="lg:col-span-2 space-y-6">
          {filtered.map(item => (
            <article key={item.id} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="md:col-span-2 p-0 overflow-hidden">
                <div className="relative h-48 md:h-60 w-full overflow-hidden">
                  <img src={item.image} alt="cover" className="w-full h-full object-cover"/>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <Badge>{item.topic}</Badge>
                    <Badge>{item.source}</Badge>
                  </div>
                </div>
                <div className="p-4">
                  <h2 className="text-xl font-bold leading-snug">{item.title}</h2>
                  <p className="text-sm opacity-80 mt-1">{new Date(item.ts).toLocaleString()} • {item.byline}</p>
                  <p className="mt-3 opacity-95">{item.summary}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <a href={item.url} className="text-cyan-300 hover:underline">Read source</a>
                    <span className="opacity-40">•</span>
                    <button onClick={()=>navigator.clipboard.writeText(`${item.title} ${location.origin}`)} className="text-fuchsia-300 hover:underline">Copy share text</button>
                  </div>
                </div>
              </Card>
              <Card>
                <h3 className="font-semibold">TL;DR</h3>
                <p className="text-sm opacity-90 mt-1">{item.summary}</p>
              </Card>
            </article>
          ))}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 pb-10 pt-2 opacity-80 text-sm">
        <div className="flex items-center justify-between">
          <div>© {new Date().getFullYear()} AutoNews.AI — Grok‑assisted reporting. Links out to sources.</div>
          <div className="text-xs">Built with ❤️ — replace demo data via /api</div>
        </div>
      </footer>
    </div>
  );
}
