// Vercel serverless function: POST /api/feedback
// Принимает идею/ошибку со страницы заказов и пересылает разработчику в Telegram (и/или в Discord).
// Настройка в Vercel -> Settings -> Environment Variables:
//   TG_BOT_TOKEN  токен бота от @BotFather      TG_CHAT_ID  id чата, куда слать (твой личный)
//   DISCORD_WEBHOOK  (необязательно) адрес вебхука Discord
// Если ничего не задано, функция отвечает {ok:false, why:"not-configured"} и ничего не отправляет.
const hits = new Map();
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);
const KINDS = { idea: "💡 Идея", bug: "🐞 Ошибка", other: "💬 Сообщение" };

function limited(ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 600000);
  if (a.length >= 5) { hits.set(ip, a); return true; }
  a.push(now); hits.set(ip, a);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some(t => now - t < 600000)) hits.delete(k);
  return false;
}
async function post(url, body, ms) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    return r.ok;
  } catch (e) { return false; } finally { clearTimeout(tm); }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, why: "method" });
  const token = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID, hook = process.env.DISCORD_WEBHOOK;
  if (!(token && chat) && !hook) return res.status(200).json({ ok: false, why: "not-configured" });
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object") return res.status(400).json({ ok: false, why: "bad-body" });
  const x = clean(b.x, 600);
  if (x.length < 5) return res.status(400).json({ ok: false, why: "short" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (limited(ip)) return res.status(429).json({ ok: false, why: "rate" });
  const slug = clean(b.slug, 20) || "?", nick = clean(b.nick, 25);
  let tech = "";
  if (b.tech && typeof b.tech === "object") {
    const t = b.tech;
    tech = ["v" + clean(String(t.v || "").replace(/^v/, ""), 8), clean(t.ua, 40), clean(t.os, 20), t.on === false ? "панель офлайн" : "", Array.isArray(t.err) && t.err.length ? "ошибки: " + t.err.slice(-5).map(e => clean(e, 120)).join(" | ") : ""].filter(Boolean).join(" · ").slice(0, 500);
  }
  const text = `${KINDS[b.k] || KINDS.other} · ${slug}${nick ? " · " + nick : ""}\n\n${x}${tech ? "\n\n[" + tech + "]" : ""}`;
  const jobs = [];
  if (token && chat) jobs.push(post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chat, text: text.slice(0, 3800), disable_web_page_preview: true }));
  if (hook) jobs.push(post(hook, { content: text.slice(0, 1900) }));
  const ok = (await Promise.all(jobs)).some(Boolean);
  return res.status(200).json({ ok });
};
