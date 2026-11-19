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
    const t = b.tech, L = [];
    const num = v => (typeof v === "number" && isFinite(v) ? v : null);
    const dim = v => (/^\d{1,5}x\d{1,5}$/.test(String(v)) ? String(v) : "");
    const ver = clean(String(t.v || "").replace(/^v/, ""), 8);
    const tz = num(t.tz), dpr = num(t.dpr);
    const add = (ic, arr) => { const j = arr.filter(Boolean).join(" · "); if (j) L.push(ic + " " + j); };
    add("📦", [ver ? "v" + ver : "", clean(t.ua, 40), clean(t.os, 20) + (t.mob ? " (телефон)" : ""),
      dim(t.scr) ? "экран " + dim(t.scr) : "", dim(t.vp) ? "окно " + dim(t.vp) + (dpr && dpr !== 1 ? " ×" + dpr : "") : "",
      clean(t.lang, 10), tz !== null ? "UTC" + (tz >= 0 ? "+" : "") + tz : ""]);
    const up = num(t.up);
    add("🌐", [clean(t.host, 60), clean(t.net, 8) ? "сеть " + clean(t.net, 8) : "", clean(t.th, 12) ? "тема " + clean(t.th, 12) : "", up !== null ? "на странице " + up + " с" : ""]);
    if (typeof t.on === "boolean") {
      const age = num(t.age), tr = num(t.tr);
      let p;
      if (t.on) p = "онлайн" + (age !== null && age >= 0 ? " (последнее сообщение " + age + " с назад" + (age > 15 ? ", связь могла зависнуть" : "") + ")" : "");
      else p = "ОФЛАЙН, заказы и сообщения до ведущего не доходят" + (age === -1 ? " (связи не было с открытия страницы)" : age !== null && age >= 0 ? " (последнее сообщение " + age + " с назад)" : "") + (tr ? ", попыток переподключения: " + tr : "");
      L.push("📡 Панель: " + p);
    }
    if (Array.isArray(t.err)) {
      const e = t.err.slice(-5).map(x => clean(x, 140)).filter(Boolean);
      L.push(e.length ? "⚠️ Ошибки на странице (" + e.length + "):\n" + e.map(x => " • " + x).join("\n") : "✅ Ошибок на странице нет");
    }
    tech = L.join("\n").slice(0, 1100);
  }
  const text = `${KINDS[b.k] || KINDS.other} · ${slug}${nick ? " · " + nick : ""}\n\n${x}${tech ? "\n\n" + tech : ""}`;
  const jobs = [];
  if (token && chat) jobs.push(post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chat, text: text.slice(0, 3800), disable_web_page_preview: true }));
  if (hook) jobs.push(post(hook, { content: text.slice(0, 1900) }));
  const ok = (await Promise.all(jobs)).some(Boolean);
  return res.status(200).json({ ok });
};
