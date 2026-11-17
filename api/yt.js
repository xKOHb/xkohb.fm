// Vercel serverless function: GET /api/yt?q=Артист – Название
// Возвращает до 6 видео YouTube: {ok:true, items:[{id,title,author,len}]}
// Без настроек ищет через страницу результатов YouTube.
// Надёжнее: добавь в Vercel (Settings → Environment Variables) ключ YT_API_KEY от YouTube Data API v3.
const dec = s => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const toSec = t => { const p = String(t || "").split(":").map(Number); if (p.some(isNaN)) return 0; return p.reduce((a, b) => a * 60 + b, 0); };
const iso = d => { const m = String(d || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };

function walk(o, out) {
  if (!o || typeof o !== "object" || out.length >= 8) return;
  if (o.videoRenderer && o.videoRenderer.videoId) {
    const v = o.videoRenderer, run = a => (a && a.runs ? a.runs.map(r => r.text).join("") : (a && a.simpleText) || "");
    out.push({ id: v.videoId, title: run(v.title), author: run(v.ownerText || v.longBylineText), len: toSec(v.lengthText && v.lengthText.simpleText) });
  }
  for (const k in o) walk(o[k], out);
}
function parseResults(html) {
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/) || html.match(/ytInitialData"\]\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return [];
  const out = []; walk(JSON.parse(m[1]), out); return out;
}
async function viaApi(q, key) {
  const s = await (await fetch("https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&q=" + encodeURIComponent(q) + "&key=" + key)).json();
  const ids = (s.items || []).map(i => i.id && i.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const d = await (await fetch("https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=" + ids.join(",") + "&key=" + key)).json();
  const len = {}; (d.items || []).forEach(v => len[v.id] = iso(v.contentDetails && v.contentDetails.duration));
  return s.items.filter(i => i.id && i.id.videoId).map(i => ({ id: i.id.videoId, title: dec(i.snippet.title), author: dec(i.snippet.channelTitle), len: len[i.id.videoId] || 0 }));
}
async function viaPage(q) {
  const r = await fetch("https://www.youtube.com/results?hl=en&sp=EgIQAQ%3D%3D&search_query=" + encodeURIComponent(q), {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "accept-language": "en-US,en;q=0.9", cookie: "CONSENT=YES+1; SOCS=CAI" }
  });
  return parseResults(await r.text());
}
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const q = String((req.query && req.query.q) || "").trim().slice(0, 150);
  if (q.length < 3) return res.status(400).json({ ok: false, why: "short" });
  try {
    let items = [];
    if (process.env.YT_API_KEY) { try { items = await viaApi(q, process.env.YT_API_KEY); } catch (e) {} }
    if (!items.length) items = await viaPage(q);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ ok: true, items: items.slice(0, 6) });
  } catch (e) {
    return res.status(200).json({ ok: false, items: [] });
  }
};
module.exports._parse = parseResults;
