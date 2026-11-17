// Vercel serverless function: GET /api/meta?url=<ссылка на трек>
// Возвращает {ok:true, title, author, thumb}: название и исполнителя по ссылке (YouTube, Spotify, SoundCloud,
// Яндекс Музыка, Deezer, Apple Music, Bandcamp). Нужна, чтобы в панели и на сайте заказов не светились голые ссылки.
// Работает на сервере, поэтому нет проблем с CORS. Ключи не нужны. Ходит только на хосты из белого списка.
const ALLOW = [
  /(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)spotify\.com$/, /(^|\.)soundcloud\.com$/,
  /^music\.yandex\.(ru|com|by|kz|uz)$/, /(^|\.)deezer\.com$/, /^music\.apple\.com$/, /(^|\.)bandcamp\.com$/
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const dec = s => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function getText(u, ms, headers) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms || 6000);
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: Object.assign({ "user-agent": UA, "accept-language": "en-US,en;q=0.9" }, headers || {}) });
    if (!r.ok) return null;
    return (await r.text()).slice(0, 400000);
  } catch (e) { return null; } finally { clearTimeout(tm); }
}
async function getJson(u, ms, headers) {
  const t = await getText(u, ms, headers);
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}
function og(html, prop) {
  const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']*)["\']', "i"))
    || html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', "i"));
  return m ? dec(m[1]).trim() : "";
}
const ok = (title, author, thumb) => (title ? { ok: true, title: String(title).slice(0, 200), author: String(author || "").slice(0, 120), thumb: thumb || "" } : null);

async function oembed(base, u) {
  const j = await getJson(base + encodeURIComponent(u), 5000);
  return j && j.title ? { title: String(j.title), author: String(j.author_name || ""), thumb: j.thumbnail_url || "" } : null;
}

async function resolve(u, host) {
  // YouTube
  if (/youtube\.com$|youtu\.be$/.test(host)) {
    const j = await oembed("https://www.youtube.com/oembed?format=json&url=", u);
    return j && ok(j.title, j.author, j.thumb);
  }
  // SoundCloud: "Название by Исполнитель"
  if (/soundcloud\.com$/.test(host)) {
    const j = await oembed("https://soundcloud.com/oembed?format=json&url=", u);
    if (!j) return null;
    let t = j.title; if (j.author && t.endsWith(" by " + j.author)) t = t.slice(0, -(" by " + j.author).length);
    return ok(t, j.author, j.thumb);
  }
  // Spotify: в oEmbed нет исполнителя, берём из og:description ("Исполнитель · Альбом · Song · 2020")
  if (/spotify\.com$/.test(host)) {
    const j = await oembed("https://open.spotify.com/oembed?url=", u);
    let author = j && j.author;
    if (!author) {
      const html = await getText(u, 5000);
      if (html) { const d = og(html, "og:description"); if (d && d.includes(" · ")) author = d.split(" · ")[0]; }
    }
    return j ? ok(j.title, author, j.thumb) : null;
  }
  // Deezer
  if (/deezer\.com$/.test(host)) {
    const m = u.match(/deezer\.com\/(?:[a-z]{2}\/)?track\/(\d+)/);
    if (m) { const j = await getJson("https://api.deezer.com/track/" + m[1], 5000); if (j && j.title) return ok(j.title, j.artist && j.artist.name, j.album && j.album.cover_medium); }
  }
  // Apple Music: id трека в параметре i= (или последнее число в пути)
  if (/music\.apple\.com$/.test(host)) {
    const id = (u.match(/[?&]i=(\d+)/) || u.match(/\/(\d+)(?:\?|$)/) || [])[1];
    if (id) { const j = await getJson("https://itunes.apple.com/lookup?id=" + id, 5000); const r = j && j.results && j.results[0]; if (r && r.trackName) return ok(r.trackName, r.artistName, r.artworkUrl100); }
  }
  // Яндекс Музыка
  if (/music\.yandex\./.test(host)) {
    const m = u.match(/track\/(\d+)/);
    if (m) {
      const j = await getJson("https://api.music.yandex.net/tracks/" + m[1], 5000);
      const r = j && j.result && j.result[0];
      if (r && r.title) return ok(r.title, (r.artists || []).map(a => a.name).join(", "), "");
    }
  }
  // Остальное (в том числе запасной путь): og-теги страницы
  const html = await getText(u, 6000);
  if (!html) return null;
  const t = og(html, "og:title"), site = og(html, "og:site_name");
  if (!t) return null;
  const m = t.match(/^(.+?)\s[-–—]\s(.+)$/);
  return m ? ok(m[2], m[1], og(html, "og:image")) : ok(t, /bandcamp/i.test(host) ? (og(html, "og:site_name") || "") : "", og(html, "og:image"));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const raw = String((req.query && req.query.url) || "").trim().slice(0, 300);
  let u;
  try { u = new URL(raw); } catch (e) { return res.status(400).json({ ok: false, why: "bad-url" }); }
  if (!/^https?:$/.test(u.protocol) || !ALLOW.some(r => r.test(u.hostname))) return res.status(200).json({ ok: false, why: "host" });
  try {
    const r = await resolve(u.href, u.hostname);
    if (r) {
      res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
      return res.status(200).json(r);
    }
    return res.status(200).json({ ok: false, why: "none" });
  } catch (e) {
    return res.status(200).json({ ok: false, why: "error" });
  }
};
module.exports._og = og;
