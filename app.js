/* Familienkochbuch – App-Logik. Daten: window.KB (eingebettet von werkzeug/build.py) */
(function () {
'use strict';
const KB = window.KB, R = KB.rezepte, byId = {}; R.forEach(r => byId[r.id] = r);
const KEY = 'kochbuch';
const EMOJI = { 'Suppe': '🍲', 'Hauptgericht': '🍽️', 'Salat & Beilage': '🥗', 'Kuchen & Gebäck': '🍰', 'Dessert': '🍎' };
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Speicher (lokal je Gerät) ---------- */
let S = { fav: {}, done: {}, port: {}, shop: [], shopChk: {}, theme: 'auto' };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const applyTheme = () => { if (S.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', S.theme); };
applyTheme();

/* ---------- Skalieren & Formatieren ---------- */
const FR = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
function frac(x) {                       // auf ¼ gerundet, mit Bruchzeichen
  const q = Math.round(x * 4) / 4, w = Math.floor(q), f = +(q - w).toFixed(2);
  return ((w ? String(w) : '') + (f ? FR[f] : '')) || '¼';
}
const dec = x => String(+x.toFixed(2)).replace('.', ',');
function roundMass(v, e) {
  if (v < 20) return e === 'ml' ? Math.max(5, Math.round(v / 5) * 5) : Math.max(1, Math.round(v));
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}
const isEgg = n => /^(Ei\b|Eier|Eidotter)/.test(n);
function fmtQty(z, f, shop) {
  if (z.menge == null) return '';
  let v = z.menge * f, e = z.einheit;
  if (e === 'g' || e === 'ml') {
    v = roundMass(v, e);
    if (v >= 1000) return dec(v / 1000) + (e === 'g' ? ' kg' : ' l');
    return v + ' ' + e;
  }
  if (e === 'TL' && v >= 3 && (f !== 1 || shop)) { v = v / 3; e = 'EL'; }
  if (e === 'TL' || e === 'EL') return frac(v) + ' ' + e;
  if (e === 'Prise') { if (v >= 4) return frac(v / 8) + ' TL'; const n = Math.max(1, Math.round(v)); return n + (n > 1 ? ' Prisen' : ' Prise'); }
  // Stück
  if (shop) return String(Math.ceil(v - 1e-9));
  const h = Math.round(v * 2) / 2;
  if (isEgg(z.name) && h % 1) return Math.floor(h) + '–' + Math.ceil(h);
  if (h === 0) return '½';
  return frac(h);
}
const PL = { 'Ei': 'Eier', 'Zwiebel': 'Zwiebeln', 'Schalotte': 'Schalotten', 'Knoblauchzehe': 'Knoblauchzehen', 'Knoblauchknolle': 'Knoblauchknollen', 'Karotte': 'Karotten', 'Tomate': 'Tomaten', 'Orange': 'Orangen', 'Erdapfel': 'Erdäpfel', 'Vanilleschote': 'Vanilleschoten' };
function plural(n) { return n.replace(/^(mehliger |kleine |große )?([A-ZÄÖÜ][a-zäöüß]+)/, (m, adj, w) => PL[w] ? (adj ? adj.replace(/r $/, 'e ').replace(/e $/, 'e ') : '') + PL[w] : m); }
function fmtName(z, f, tot) {
  const v = tot != null ? tot : (z.menge == null ? 0 : z.menge * f);
  return z.einheit === 'Stk' && v > 1.01 ? plural(z.name) : z.name;
}
const ingLine = (z, f) => { const q = fmtQty(z, f); return (q ? q + ' ' : '') + fmtName(z, f); };
const portOf = r => S.port[r.id] || r.portionen;

/* ---------- Ansichten ---------- */
let view = 'liste', cur = null, filt = { q: '', kat: 'Alle', tag: null };
function setHeader(title, sub, back) {
  $('#title').textContent = title; $('#sub').textContent = sub || '';
  $('#back').hidden = !back;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  const n = S.shop.length; const bd = $('#shopBadge'); bd.hidden = !n; bd.textContent = n;
}
function go(v, id) { view = v; cur = id || null; render(); window.scrollTo(0, 0);
  try { history.replaceState(null, '', id ? '#' + id : '#' + v); } catch (e) {} }

function card(r) {
  return `<div class="rc glass" data-open="${r.id}" role="button" tabindex="0">
    <span class="em">${EMOJI[r.kategorie] || '🍴'}</span>
    <span class="tx"><b>${esc(r.titel)}</b><small>${esc(r.kurz)}</small>
    <span class="meta">${r.portionen} ${esc(r.portionen_einheit)} · ca. ${r.gesamtzeit_min} Min.${S.done[r.id] ? ' · ✓ gekocht' : ''}</span></span>
    <button class="star ${S.fav[r.id] ? 'on' : ''}" data-fav="${r.id}" aria-label="Favorit">${S.fav[r.id] ? '★' : '☆'}</button></div>`;
}
function renderListe(onlyFav) {
  const tags = [...new Set(R.flatMap(r => r.tags))].filter(t => ['vegetarisch', 'vegan', 'schnell', 'steirisch', 'Rohr', 'Vorrat', 'große Runde', 'ohne Weißzucker'].includes(t));
  const q = filt.q.trim().toLowerCase();
  let list = R.filter(r => (!onlyFav || S.fav[r.id])
    && (filt.kat === 'Alle' || r.kategorie === filt.kat)
    && (!filt.tag || r.tags.includes(filt.tag))
    && (!q || (r.titel + ' ' + r.kurz + ' ' + r.zutaten.map(z => z.name).join(' ') + ' ' + r.tags.join(' ')).toLowerCase().includes(q)));
  let h = '';
  if (!onlyFav) {
    h += `<input type="search" id="q" placeholder="Suchen: Rezept, Zutat …" value="${esc(filt.q)}" autocomplete="off">`;
    h += `<div class="chips">${['Alle', ...KB.kategorien].map(k => `<button class="chip ${filt.kat === k ? 'on' : ''}" data-kat="${esc(k)}">${k === 'Alle' ? 'Alle' : (EMOJI[k] + ' ' + esc(k))}</button>`).join('')}</div>`;
    h += `<div class="chips" style="padding-top:2px">${tags.map(t => `<button class="chip ${filt.tag === t ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  }
  if (!list.length) h += `<p class="empty">${onlyFav ? 'Noch keine Favoriten.<br>Tippe bei einem Rezept auf ☆.' : 'Nichts gefunden.'}</p>`;
  const kats = filt.kat === 'Alle' || onlyFav ? KB.kategorien : [filt.kat];
  kats.forEach(k => { const l = list.filter(r => r.kategorie === k); if (l.length) h += `<div class="sec">${esc(k)}</div><div class="list">${l.map(card).join('')}</div>`; });
  $('#main').innerHTML = h;
  setHeader(onlyFav ? 'Favoriten' : 'Familienkochbuch', onlyFav ? '' : R.length + ' Rezepte', false);
  const qi = $('#q'); if (qi) qi.addEventListener('input', e => { filt.q = e.target.value; const pos = e.target.selectionStart; renderListe(false); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
}

function renderRezept(r) {
  const p = portOf(r), f = p / r.portionen, kuchen = r.kategorie === 'Kuchen & Gebäck';
  let h = `<div class="hero glass"><h2>${esc(r.titel)}</h2><p>${esc(r.kurz)}</p>
    <div class="tags"><span class="tag">⏱ ca. ${r.gesamtzeit_min} Min.</span>${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>`;
  h += `<div class="scale glass"><div class="step"><button data-p="-1" aria-label="weniger">−</button><span id="pv">${p} ${esc(r.portionen_einheit)}</span><button data-p="1" aria-label="mehr">+</button></div>
    <div class="seg">${[0.5, 1, 2, 3].map(m => `<button data-m="${m}" class="${Math.abs(f - m) < 1e-9 ? 'on' : ''}">${m === 0.5 ? '½' : m}×</button>`).join('')}</div>
    ${f !== 1 ? `<div class="hint">Mengen umgerechnet und gerundet (Original: ${r.portionen} ${esc(r.portionen_einheit)}).${kuchen ? ' Form bzw. Blech an die Menge anpassen – Backzeit kann sich ändern.' : f > 1.5 ? ' Garzeiten bleiben gleich; größeren Topf verwenden, eventuell etwas länger.' : ''}</div>` : ''}</div>`;
  h += `<div class="sec">Zutaten</div><div class="ing glass">`; let g = null;
  r.zutaten.forEach((z, i) => {
    if ((z.gruppe || null) !== g) { g = z.gruppe || null; if (g) h += `<div class="grp">${esc(g)}</div>`; }
    const q = fmtQty(z, f);
    h += `<label><input type="checkbox"><span class="q">${esc(q)}</span><span>${esc(fmtName(z, f))}</span></label>`;
  });
  h += `</div><div class="btns">
    <button class="btn primary" id="cookGo">👩‍🍳 Kochmodus</button>
    <button class="btn" id="toShop">🛒 Einkaufsliste</button>
    <button class="btn" id="share">💬 WhatsApp</button>
    <button class="btn" id="favT">${S.fav[r.id] ? '★ Favorit' : '☆ Favorit'}</button>
    <button class="btn" id="doneT">${S.done[r.id] ? '✓ Gekocht' : 'Gekocht?'}</button></div>`;
  h += `<div class="sec">Zubereitung</div><div class="steps">${r.schritte.map((s, i) => `<div class="st glass"><h3>${esc(s.titel)}</h3><p>${esc(s.text)}</p>
    ${s.timer_min ? `<button class="btn small tbtn" data-timer="${i}">⏱ ${s.timer_min} Min. starten</button>` : ''}</div>`).join('')}</div>`;
  if (r.tipps.length || r.varianten.length || r.passt_zu.length) {
    h += `<div class="sec">Tipps & Varianten</div><div class="notes glass">`;
    if (r.tipps.length) h += `<h3>💡 Tipps</h3><ul>${r.tipps.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    if (r.varianten.length) h += `<h3>🔄 Varianten</h3><ul>${r.varianten.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    if (r.passt_zu.length) h += `<h3>🤝 Passt zu</h3><div class="links">${r.passt_zu.map(id => `<button class="chip" data-open="${id}">${esc(byId[id].titel)}</button>`).join('')}</div>`;
    h += `</div>`;
  }
  $('#main').innerHTML = h;
  setHeader('', '', true);
}
function setPort(r, p) {
  const step = r.portionen >= 8 ? 2 : 1;
  p = Math.max(1, Math.min(r.portionen * 10, p));
  if (p === r.portionen) delete S.port[r.id]; else S.port[r.id] = p;
  save(); const y = window.scrollY; renderRezept(r); window.scrollTo(0, y);
}

/* ---------- Einkaufsliste ---------- */
function shopItems() {
  const m = new Map();
  S.shop.forEach(e => { const r = byId[e.id]; if (!r) return; const f = e.p / r.portionen;
    r.zutaten.forEach(z => {
      const base = z.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/,.*$/, '').trim();
      const k = base.toLowerCase().replace(/e?n$/, '').replace(/e$/, '') + '|' + z.einheit;
      const it = m.get(k) || { z: Object.assign({}, z, { name: base, menge: z.menge == null ? null : 0 }), k, from: [] };
      if (z.menge != null && it.z.menge != null) it.z.menge += z.menge * f;
      if (!it.from.includes(r.titel)) it.from.push(r.titel);
      if (/n$/.test(base) && !/n$/.test(it.z.name)) it.z.name = base;
      m.set(k, it);
    }); });
  return [...m.values()].sort((a, b) => a.z.name.localeCompare(b.z.name, 'de'));
}
function renderShop() {
  let h = '';
  if (!S.shop.length) h = `<p class="empty">Die Einkaufsliste ist leer.<br>Im Rezept auf „🛒 Einkaufsliste“ tippen.</p>`;
  else {
    h += `<div class="sec">Rezepte</div><div class="glass">${S.shop.map((e, i) => `<div class="shoprec"><span>${esc(byId[e.id].titel)} · <b>${e.p} ${esc(byId[e.id].portionen_einheit)}</b></span><button class="btn small" data-rm="${i}">Entfernen</button></div>`).join('')}</div>`;
    const items = shopItems(), open = items.filter(i => !S.shopChk[i.k]), got = items.filter(i => S.shopChk[i.k]);
    const row = i => `<label><input type="checkbox" data-chk="${esc(i.k)}" ${S.shopChk[i.k] ? 'checked' : ''}><span class="q">${esc(fmtQty(i.z, 1, true))}</span><span>${esc(fmtName(i.z, 1))}${i.from.length > 1 ? ` <small style="color:var(--muted)">(${i.from.length} Rezepte)</small>` : ''}</span></label>`;
    h += `<div class="sec">Einkaufen (${open.length})</div><div class="shop glass">${open.map(row).join('') || '<p class="empty" style="padding:16px">Alles erledigt 🎉</p>'}</div>`;
    if (got.length) h += `<div class="sec">Im Wagerl (${got.length})</div><div class="shop glass">${got.map(row).join('')}</div>`;
    h += `<div class="btns"><button class="btn primary" id="shopShare">💬 Liste teilen</button><button class="btn" id="shopClear">Liste leeren</button></div>
      <p class="hint">Haken setzen = schon gekauft oder daheim. Gleiche Zutaten aus mehreren Rezepten sind zusammengezählt.</p>`;
  }
  $('#main').innerHTML = h; setHeader('Einkaufsliste', S.shop.length ? S.shop.length + ' Rezept' + (S.shop.length > 1 ? 'e' : '') : '', false);
}

/* ---------- Einstellungen ---------- */
function renderSet() {
  const code = 'KB1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ fav: S.fav, done: S.done, port: S.port, shop: S.shop }))));
  $('#main').innerHTML = `<div class="sec">Darstellung</div><div class="glass set"><div class="seg" style="margin-top:10px">${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, l]) => `<button data-theme="${k}" class="${S.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="sec">Rezept vorschlagen</div><div class="glass set"><p>Ein Rezept fürs Familienkochbuch? Kurz beschreiben (Name, Zutaten, ungefähre Zubereitung) – dann öffnet sich das Teilen-Menü – einfach an Stefan schicken.</p>
    <textarea id="vorschlag" placeholder="z. B. Omas Kaspressknödel: 250 g Knödelbrot, 150 g Bergkäse …"></textarea>
    <div class="btns"><button class="btn primary" id="vorschlagGo">💬 Vorschlag senden</button></div></div>
  <div class="sec">Gerät wechseln</div><div class="glass set"><p>Favoriten, „gekocht“ und Einkaufsliste sind nur auf diesem Gerät gespeichert. Mit dem Sicherungscode auf ein anderes Gerät übertragen.</p>
    <textarea id="code" readonly>${code}</textarea>
    <div class="btns"><button class="btn" id="copy">Code kopieren</button></div>
    <textarea id="imp" placeholder="Code vom anderen Gerät hier einfügen"></textarea>
    <div class="btns"><button class="btn" id="impGo">Code übernehmen</button></div></div>
  <p class="hint">Familienkochbuch · ${R.length} Rezepte · Stand ${esc(KB.stand)}</p>`;
  setHeader('Einstellungen', '', true);
}

function render() {
  if (view === 'rezept' && cur && byId[cur]) renderRezept(byId[cur]);
  else if (view === 'einkauf') renderShop();
  else if (view === 'favoriten') renderListe(true);
  else if (view === 'set') renderSet();
  else { view = 'liste'; renderListe(false); }
}

/* ---------- Teilen ---------- */
function waText(r) {
  const f = portOf(r) / r.portionen;
  let t = `${EMOJI[r.kategorie] || '🍴'} *${r.titel}*\n_${r.kurz}_\n(${portOf(r)} ${r.portionen_einheit}, ca. ${r.gesamtzeit_min} Min.)\n\n*Zutaten:*\n`;
  let g = null;
  r.zutaten.forEach(z => { if ((z.gruppe || null) !== g) { g = z.gruppe || null; if (g) t += `_${g}:_\n`; } t += `• ${ingLine(z, f)}\n`; });
  t += `\n*Zubereitung:*\n` + r.schritte.map((s, i) => `${i + 1}. ${s.text}${s.timer_min ? ` (${s.timer_min} Min.)` : ''}`).join('\n');
  if (r.tipps.length) t += `\n\n💡 *Tipp:* ` + r.tipps[0];
  return t;
}
function share(text) {
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
}
function toast(m) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = m; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }

/* ---------- Timer ---------- */
let timers = [], actx = null, tick = null;
function beep() {
  try { if (!actx) return; const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(.25, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .6); o.start(); o.stop(actx.currentTime + .6); } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {}
}
function startTimer(label, min) {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) {}
  timers.push({ label, end: Date.now() + min * 60000, done: false, id: Math.random() });
  drawTimers(); if (!tick) tick = setInterval(drawTimers, 1000); toast('Timer läuft: ' + min + ' Min.');
}
function drawTimers() {
  const now = Date.now();
  timers.forEach(t => { if (!t.done && now >= t.end) { t.done = true; t.ring = now; } if (t.done && now - t.ring < 30000 && (now - t.ring) % 3000 < 1000) beep(); });
  $('#timers').innerHTML = timers.map(t => { const s = Math.max(0, Math.round((t.end - now) / 1000));
    return `<div class="tm glass ${t.done ? 'done' : ''}">⏱ <span>${esc(t.label)}</span><span class="t">${t.done ? 'Fertig!' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')}</span><button class="hbtn" data-tx="${t.id}" aria-label="Timer beenden" style="color:inherit">✕</button></div>`; }).join('');
  if (!timers.length) { clearInterval(tick); tick = null; }
}

/* ---------- Kochmodus ---------- */
let ck = { r: null, i: 0 }, wl = null;
async function wake(on) { try { if (on && 'wakeLock' in navigator) wl = await navigator.wakeLock.request('screen'); else if (!on && wl) { wl.release(); wl = null; } } catch (e) {} }
function cookOpen(r) { ck = { r, i: 0 }; $('#cook').hidden = false; document.body.style.overflow = 'hidden'; wake(true); drawCook(); }
function cookClose() { $('#cook').hidden = true; document.body.style.overflow = ''; wake(false); }
function drawCook() {
  const r = ck.r, n = r.schritte.length, s = r.schritte[ck.i], f = portOf(r) / r.portionen;
  const used = r.zutaten.filter(z => { const base = z.name.split(/[ ,(]/)[0].replace(/n$/, ''); return base.length > 3 && s.text.toLowerCase().includes(base.toLowerCase().slice(0, Math.max(4, base.length - 1))); });
  $('#cook').innerHTML = `<div class="top"><b>${esc(r.titel)} · ${portOf(r)} ${esc(r.portionen_einheit)}</b><button class="btn small" id="ckX">✕ Schließen</button></div>
    <div class="prog"><i style="width:${(ck.i + 1) / n * 100}%"></i></div>
    <div class="body"><div class="n">Schritt ${ck.i + 1} von ${n}</div><h2>${esc(s.titel)}</h2><div class="txt">${esc(s.text)}</div>
    ${used.length ? `<div class="need glass">${used.map(z => `<div>• ${esc(ingLine(z, f))}</div>`).join('')}</div>` : ''}
    ${s.timer_min ? `<div class="btns"><button class="btn primary" id="ckT">⏱ ${s.timer_min} Min. starten</button></div>` : ''}</div>
    <div class="nav2"><button class="btn" id="ckP" ${ck.i ? '' : 'disabled style="opacity:.4"'}>← Zurück</button><button class="btn primary" id="ckN">${ck.i < n - 1 ? 'Weiter →' : 'Fertig ✓'}</button></div>`;
}

/* ---------- Ereignisse ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-open]'); if (!t) return;
  const d = t.dataset;
  if (d.fav) { e.stopPropagation(); S.fav[d.fav] ? delete S.fav[d.fav] : S.fav[d.fav] = 1; save(); render(); return; }
  if (d.open) { go('rezept', d.open); return; }
  if (d.v) { go(d.v); return; }
  if (d.kat) { filt.kat = d.kat; renderListe(false); return; }
  if (d.tag) { filt.tag = filt.tag === d.tag ? null : d.tag; renderListe(false); return; }
  if (d.theme) { S.theme = d.theme; save(); applyTheme(); renderSet(); return; }
  if (d.tx) { timers = timers.filter(x => String(x.id) !== d.tx); drawTimers(); return; }
  if (d.rm != null && d.rm !== '') { S.shop.splice(+d.rm, 1); save(); renderShop(); return; }
  const r = cur && byId[cur];
  if (r && d.p) { const st = r.portionen >= 8 ? 2 : 1; setPort(r, portOf(r) + (+d.p) * st); return; }
  if (r && d.m) { setPort(r, Math.max(1, Math.round(r.portionen * +d.m))); return; }
  if (r && d.timer) { const s = r.schritte[+d.timer]; startTimer(s.titel, s.timer_min); return; }
  switch (t.id) {
    case 'back': go(view === 'set' ? 'liste' : (history.state && history.state.v) || 'liste'); break;
    case 'gear': go('set'); break;
    case 'cookGo': cookOpen(r); break;
    case 'toShop': { const ex = S.shop.find(x => x.id === r.id); if (ex) ex.p = portOf(r); else S.shop.push({ id: r.id, p: portOf(r) }); save(); setHeader($('#title').textContent, '', true); toast('Zur Einkaufsliste hinzugefügt'); break; }
    case 'share': share(waText(r)); break;
    case 'favT': S.fav[r.id] ? delete S.fav[r.id] : S.fav[r.id] = 1; save(); renderRezept(r); break;
    case 'doneT': S.done[r.id] ? delete S.done[r.id] : S.done[r.id] = new Date().toISOString().slice(0, 10); save(); renderRezept(r); break;
    case 'shopClear': S.shop = []; S.shopChk = {}; save(); renderShop(); break;
    case 'shopShare': { const it = shopItems().filter(i => !S.shopChk[i.k]); share('🛒 *Einkaufsliste*\n' + it.map(i => '• ' + (fmtQty(i.z, 1, true) + ' ' + fmtName(i.z, 1)).trim()).join('\n')); break; }
    case 'copy': { const c = $('#code'); c.select(); try { navigator.clipboard.writeText(c.value); } catch (er) { document.execCommand('copy'); } toast('Code kopiert'); break; }
    case 'impGo': { const v = $('#imp').value.trim(); if (!v.startsWith('KB1:')) { toast('Ungültiger Code'); break; }
      try { Object.assign(S, JSON.parse(decodeURIComponent(escape(atob(v.slice(4)))))); save(); toast('Übernommen'); renderSet(); } catch (er) { toast('Ungültiger Code'); } break; }
    case 'vorschlagGo': { const v = $('#vorschlag').value.trim(); if (!v) { toast('Bitte kurz beschreiben'); break; } share('🍳 *Rezept-Vorschlag fürs Familienkochbuch*\n\n' + v); break; }
    case 'ckX': cookClose(); break;
    case 'ckP': if (ck.i) { ck.i--; drawCook(); } break;
    case 'ckN': if (ck.i < ck.r.schritte.length - 1) { ck.i++; drawCook(); } else cookClose(); break;
    case 'ckT': { const s = ck.r.schritte[ck.i]; startTimer(s.titel, s.timer_min); break; }
  }
});
document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.chk; if (k) { e.target.checked ? S.shopChk[k] = 1 : delete S.shopChk[k]; save(); renderShop(); } });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.open) go('rezept', e.target.dataset.open); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#cook').hidden) wake(true); });

// Zurück-Knopf merkt sich die Herkunft
const _go = go; go = function (v, id) { const from = view; _go(v, id); try { history.replaceState({ v: from === 'rezept' || from === 'set' ? 'liste' : from }, '', id ? '#' + id : '#' + v); } catch (e) {} };
const h0 = decodeURIComponent(location.hash.slice(1));
if (byId[h0]) { view = 'rezept'; cur = h0; } else if (['einkauf', 'favoriten'].includes(h0)) view = h0;
render();
window.__kb = { fmtQty, shopItems, S };   // für Tests
})();
