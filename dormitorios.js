// dormitorios.js — Campeonato Dormitorios: ranking, fecha en vivo y carga de tarjeta.
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";
import { ranking, seedClasif, DEFAULT_HOLES, strokesOn, liveSummary } from "./clasif.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
// ?demo en la dirección: guarda solo en este navegador (para probar sin tocar la base).
const DEMO = String(firebaseConfig.apiKey).startsWith("PEGAR") || location.search.includes("demo");
// Las tarjetas hoyo por hoyo se guardan en la colección "scores" (la misma de la Ryder),
// con id "dorm-<fecha>-<jugador>" y campos h1..h18.
const cardId = (f, p) => `dorm-${f}-${p}`;

let DATA = null, DRAFT = null, LOADED = false, LIVE = {};
const ST = { admin: false, error: null, loginErr: null, busy: false, online: navigator.onLine, pending: 0 };
const UI = { tab: "rank", fecha: null, hole: 1, me: null, holesEdit: false };
try { UI.me = localStorage.getItem("dorm-me"); } catch (e) {}
const cur = () => DRAFT || DATA;
const holesOf = d => (Array.isArray(d?.holes) && d.holes.length === 18) ? d.holes : DEFAULT_HOLES;
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toPar = n => n === null || n === undefined ? "–" : n === 0 ? "E" : (n > 0 ? "+" + n : String(n));
let F, A, db, auth;

// ---------- Datos ----------
async function start() {
  if (DEMO) {
    try { DATA = JSON.parse(localStorage.getItem("dorm-demo")); LIVE = JSON.parse(localStorage.getItem("dorm-demo-live")) || {}; } catch (e) {}
    LOADED = true; render(); return;
  }
  const appMod = await import(`${SDK}/firebase-app.js`);
  F = await import(`${SDK}/firebase-firestore.js`);
  A = await import(`${SDK}/firebase-auth.js`);
  const app = appMod.initializeApp(firebaseConfig);
  db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  auth = A.getAuth(app);
  let subscribed = false;
  A.onAuthStateChanged(auth, u => {
    if (!u) { A.signInAnonymously(auth).catch(() => {}); return; }
    ST.admin = !u.isAnonymous && u.email === ADMIN_EMAIL;
    // Nos suscribimos recién con sesión iniciada (si no, Firebase rechaza y no reintenta).
    if (!subscribed) { subscribed = true; subscribe(); }
    softRender();
  });
}
function subscribe() {
  F.onSnapshot(F.doc(db, "torneo", "clasificacion"),
    s => { DATA = s.exists() ? s.data() : null; LOADED = true; ST.error = null; softRender(); },
    e => { ST.error = "No se pudo leer la clasificación (" + e.code + "). Recargá la página."; LOADED = true; softRender(); });
  F.onSnapshot(F.collection(db, "scores"), { includeMetadataChanges: true }, snap => {
    const live = {}; let pending = 0;
    snap.forEach(d => { if (d.id.startsWith("dorm-")) { live[d.id] = d.data(); if (d.metadata.hasPendingWrites) pending++; } });
    LIVE = live; ST.pending = pending; softRender();
  }, e => { ST.error = "No se pudieron leer las tarjetas (" + e.code + ")."; softRender(); });
}
async function save(d) {
  if (DEMO) { DATA = structuredClone(d); try { localStorage.setItem("dorm-demo", JSON.stringify(d)); } catch (e) {} return; }
  await F.setDoc(F.doc(db, "torneo", "clasificacion"), JSON.parse(JSON.stringify(d)));
}
function setHole(fecha, pid, hole, value) {
  const id = cardId(fecha, pid);
  const c = LIVE[id] = { ...(LIVE[id] || {}) };       // se ve al instante, aun sin señal
  if (value === null) delete c["h" + hole]; else c["h" + hole] = value;
  if (DEMO) { try { localStorage.setItem("dorm-demo-live", JSON.stringify(LIVE)); } catch (e) {} return; }
  F.setDoc(F.doc(db, "scores", id), { ["h" + hole]: value === null ? F.deleteField() : value }, { merge: true })
    .catch(e => { ST.error = "No se guardó el golpe (" + e.code + ")."; render(); });
}
async function login(email, pass) {
  if (DEMO) { ST.admin = true; return; }
  await A.signInWithEmailAndPassword(auth, email, pass);
}
async function logout() { if (DEMO) { ST.admin = false; return; } await A.signOut(auth); }

// Fecha por defecto: la de hoy (dd/mm) si existe; si no, la primera sin resultados.
function defaultFecha(d) {
  const t = new Date(), today = String(t.getDate()).padStart(2, "0") + "/" + String(t.getMonth() + 1).padStart(2, "0");
  return (d.fechas.find(f => f.label === today) ||
          d.fechas.find(f => !d.players.some(p => typeof p.cards?.[f.id] === "number")) ||
          d.fechas[d.fechas.length - 1]).id;
}

// Jugadores con las tarjetas oficiales + las completas en vivo (provisorias).
function effective(d) {
  const holes = holesOf(d);
  return d.players.map(p => {
    const cards = { ...(p.cards || {}) }, prov = {};
    d.fechas.forEach(f => {
      if (typeof cards[f.id] === "number") return;
      const s = liveSummary(LIVE[cardId(f.id, p.id)], p.hcp, holes);
      if (s.net18 !== null) { cards[f.id] = s.net18; prov[f.id] = true; }
    });
    return { ...p, cards, prov };
  });
}

// ---------- Vistas ----------
const ord = n => n + "º";
function header(rk, d) {
  const played = d.fechas.filter(f => rk.some(p => typeof p.cards?.[f.id] === "number"));
  const next = d.fechas.find(f => !played.includes(f));
  const top = rk[0];
  const conn = DEMO ? "Modo demo" : !ST.online ? `Sin señal${ST.pending ? ` · ${ST.pending} por enviar` : ""}` : ST.pending ? "Enviando…" : "En vivo";
  return `<section class="board">
    <div class="boardtop"><span class="eyebrow">${esc(d.sede)}</span><span class="conn ${ST.online ? "" : "off"}">${conn}</span></div>
    <h1 class="dtitle">${esc(d.title)}</h1>
    <p class="dsub">El ranking define el orden de elección de camas en Chile.</p>
    <div class="fechas">${d.fechas.map((f, i) => `<span class="fecha ${played.includes(f) ? "done" : f === next ? "next" : ""}">
      <small>Fecha ${i + 1}</small><b class="num">${esc(f.label)}</b><small>${played.includes(f) ? "con tarjetas" : f === next ? "próxima" : "pendiente"}</small></span>`).join("")}</div>
    ${top && top.best !== undefined ? `<p class="lead">🛏️ <b>${esc(top.name)}</b> elige primero${top.tie ? " (empatado)" : ""} con <b class="num">${top.best}</b> neto</p>` : ""}
  </section>
  <nav class="dtabs" role="tablist">${[["rank", "Ranking"], ["live", "Fecha en vivo"], ["card", "Mi tarjeta"]]
    .map(([k, l]) => `<button role="tab" data-act="tab" data-v="${k}" aria-selected="${UI.tab === k}">${l}</button>`).join("")}</nav>`;
}
function rowView(p, d) {
  const chips = d.fechas.map(f => {
    const v = p.cards?.[f.id], has = typeof v === "number";
    return `<span class="card ${has ? (v === p.best ? "best" : "") : "none"} ${p.prov?.[f.id] ? "prov" : ""}" title="Fecha ${esc(f.label)}${p.prov?.[f.id] ? " (provisoria)" : ""}">
      <small>${esc(f.label)}${p.prov?.[f.id] ? "*" : ""}</small><b class="num">${has ? v : "–"}</b></span>`;
  }).join("");
  const sub = p.best === undefined ? "Sin tarjeta todavía"
    : p.behind === 0 ? (p.pos === 1 ? "Puntero" : "Igual al puntero")
    : `a ${p.behind} golpe${p.behind > 1 ? "s" : ""} del puntero`;
  return `<li class="rrow ${p.best === undefined ? "nocard" : ""} ${p.pos <= 3 && p.best !== undefined ? "podio" : ""}">
    <span class="rpos num">${ord(p.pos)}</span>
    <div class="rmain"><div class="rname">${esc(p.name)} ${p.tie ? '<span class="chip warn">Empate</span>' : p.tieResolved ? '<span class="chip">Por sorteo</span>' : ""}</div>
      <div class="rsub">${sub}</div><div class="cards">${chips}</div></div>
    <span class="rbest num">${p.best ?? "–"}</span></li>`;
}
function viewRanking(d, rk) {
  const anyProv = rk.some(p => Object.keys(p.prov || {}).length);
  return `<h2>Orden de elección</h2>
    <p class="sub">Cuenta la mejor tarjeta neta de las ${d.fechas.length} fechas. Desempate: segunda mejor tarjeta y después la tercera.</p>
    <ol class="rank">${rk.map(p => rowView(p, d)).join("")}</ol>
    ${anyProv ? `<p class="note" style="margin-top:10px">* Tarjeta cargada hoyo por hoyo, provisoria hasta que el admin la confirme.</p>` : ""}
    ${rk.some(p => p.tie) ? `<p class="note warn" style="margin-top:10px">Los empates que sigan después de la última fecha se definen por sorteo.</p>` : ""}`;
}
function fechaPicker(d) {
  return `<div class="fpick">${d.fechas.map(f => `<button data-act="fecha" data-v="${f.id}" aria-pressed="${UI.fecha === f.id}">${esc(f.label)}</button>`).join("")}</div>`;
}
function viewLive(d) {
  const holes = holesOf(d), f = d.fechas.find(x => x.id === UI.fecha);
  const rows = d.players.map(p => ({ p, s: liveSummary(LIVE[cardId(UI.fecha, p.id)], p.hcp, holes) }))
    .filter(r => r.s.thru > 0)
    .sort((a, b) => (a.s.netToPar ?? 999) - (b.s.netToPar ?? 999) || b.s.thru - a.s.thru || a.s.grossToPar - b.s.grossToPar);
  const waiting = d.players.filter(p => !rows.some(r => r.p.id === p.id));
  return `<h2>Fecha ${esc(f.label)} en vivo</h2>${fechaPicker(d)}
    <p class="sub">Neto respecto del par en los hoyos jugados. Se actualiza solo a medida que cada uno carga su tarjeta.</p>
    ${rows.length ? `<div class="tw"><table class="lb"><thead><tr><th></th><th style="text-align:left">Jugador</th><th>Hoyos</th><th>Gross</th><th>Neto</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td class="num">${i + 1}</td><td style="text-align:left"><b>${esc(r.p.name)}</b>${typeof r.p.hcp !== "number" ? '<br><small class="tb">falta hcp</small>' : ""}</td>
        <td class="num">${r.s.thru === 18 ? "F" : r.s.thru}</td><td class="num">${r.s.gross} <small>(${toPar(r.s.grossToPar)})</small></td>
        <td class="num big ${r.s.netToPar < 0 ? "under" : ""}">${toPar(r.s.netToPar)}${r.s.net18 !== null ? ` <small>(${r.s.net18})</small>` : ""}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note" style="margin-top:6px">"F" = terminó los 18; entre paréntesis, su neto total.</p>` :
    `<div class="panel"><p class="note">Todavía nadie cargó hoyos en esta fecha. Entrá a <b>Mi tarjeta</b> para empezar.</p></div>`}
    ${waiting.length ? `<p class="note" style="margin-top:10px">Sin cargar: ${waiting.map(p => esc(p.name)).join(", ")}</p>` : ""}`;
}
function viewCard(d) {
  const holes = holesOf(d);
  const opts = `<option value="">Elegí tu nombre…</option>` + d.players.map(p => `<option value="${p.id}" ${UI.me === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  let h = `<h2>Mi tarjeta</h2>
    <div class="panel"><div class="field"><label for="me">¿Quién sos?</label><select id="me" data-act="me">${opts}</select></div>${fechaPicker(d)}</div>`;
  const p = d.players.find(x => x.id === UI.me);
  if (!p) return h;
  const card = LIVE[cardId(UI.fecha, p.id)] || {}, s = liveSummary(card, p.hcp, holes);
  const hole = holes[UI.hole - 1], g = card["h" + UI.hole], k = typeof p.hcp === "number" ? strokesOn(p.hcp, hole.si) : 0;
  h += `<div class="mysum"><span><small>Hoyos</small><b class="num">${s.thru}</b></span><span><small>Gross</small><b class="num">${s.gross || "–"}</b></span>
      <span><small>Neto vs par</small><b class="num">${toPar(s.netToPar)}</b></span><span><small>Hcp</small><b class="num">${p.hcp ?? "?"}</b></span></div>
    ${typeof p.hcp !== "number" ? `<p class="note warn">Falta tu hándicap: el admin lo carga en la tabla de abajo de Ranking. Igual podés ir cargando los golpes.</p>` : ""}
    <div class="holes">${holes.map((x, i) => { const v = card["h" + (i + 1)];
      return `<button class="num ${typeof v === "number" ? "wh" : ""} ${i + 1 === UI.hole ? "cur" : ""}" data-act="hole" data-n="${i + 1}" aria-label="Hoyo ${i + 1}">${i + 1}</button>`; }).join("")}</div>
    <div class="hcard"><div class="hhead"><span class="hn num">${UI.hole}</span>
      <span class="hm">Par <b>${hole.par}</b> · Hcp <b class="num">${hole.si}</b>${k ? `<br><span class="dots">${"●".repeat(Math.max(0, k))}</span> recibís ${k}` : k < 0 ? "<br>devolvés 1" : ""}</span></div>
      <div class="unit"><div><div class="uname">${esc(p.name)}</div>
        <div class="umeta">${typeof g === "number" ? `neto ${g - k} · ${toPar(g - k - hole.par)} en el hoyo` : "Tocá + para empezar en el par"}</div></div>
        <div class="step"><button data-act="inc" data-d="-1" aria-label="Restar golpe">−</button>
          <span class="val num ${typeof g === "number" ? "" : "empty"}">${g ?? "–"}</span>
          <button data-act="inc" data-d="1" aria-label="Sumar golpe">+</button></div></div>
      ${typeof g === "number" ? `<div class="verdict"><button class="btn sm" data-act="clearhole">Borrar este hoyo</button></div>` : ""}</div>
    <div class="nav2"><button class="btn" data-act="hole" data-n="${UI.hole - 1}" ${UI.hole === 1 ? "disabled" : ""}>‹ Hoyo ${Math.max(1, UI.hole - 1)}</button>
      <button class="btn primary" data-act="hole" data-n="${UI.hole + 1}" ${UI.hole === 18 ? "disabled" : ""}>Hoyo ${Math.min(18, UI.hole + 1)} ›</button></div>
    <p class="banner">Cargá solo tu tarjeta 😉. Funciona sin señal: lo que cargues se envía cuando vuelve.</p>`;
  return h;
}
function viewAdmin(d) {
  if (!ST.admin) return `<h2>Administrador</h2>
    <form class="panel" id="login">
      <div class="field"><label for="lg-email">Email</label><input id="lg-email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="lg-pass">Contraseña</label><input id="lg-pass" type="password" autocomplete="current-password" required></div>
      ${ST.loginErr ? `<p class="note tb">${esc(ST.loginErr)}</p>` : ""}
      <button class="btn primary" type="submit" ${ST.busy ? "disabled" : ""}>Entrar para cargar tarjetas</button>
    </form>`;
  if (!d) return `<h2>Administrador</h2><div class="panel"><p class="note">Crea la clasificación con los 12 jugadores y los resultados del 19/09 ya cargados.</p>
    <button class="btn primary" data-act="seed">Crear clasificación</button></div>`;
  const rk = ranking(d.players, d.fechas), holes = holesOf(d);
  return `<h2>Administrador</h2>
    <p class="sub">Neto oficial de cada fecha (vacío = no jugó o todavía no se confirmó) y hándicap de juego de cada uno. Se guarda con el botón de abajo.</p>
    <div class="tw"><table class="edit"><thead><tr><th style="text-align:left">Jugador</th><th>Hcp</th>
      ${d.fechas.map((f, i) => `<th><input id="fl${i}" class="flabel" data-act="flabel" data-i="${i}" value="${esc(f.label)}" aria-label="Fecha ${i + 1}"></th>`).join("")}
      <th>Sorteo</th></tr></thead><tbody>
      ${d.players.map(p => `<tr><td style="text-align:left"><input id="pn${p.id}" class="pname" data-act="pname" data-id="${p.id}" value="${esc(p.name)}" aria-label="Nombre"></td>
        <td><input id="hc${p.id}" inputmode="numeric" data-act="hcp" data-id="${p.id}" value="${p.hcp ?? ""}" aria-label="Hándicap ${esc(p.name)}"></td>
        ${d.fechas.map(f => { const s = liveSummary(LIVE[cardId(f.id, p.id)], p.hcp, holes);
          return `<td><input id="s${p.id}${f.id}" inputmode="numeric" data-act="score" data-id="${p.id}" data-f="${f.id}" value="${p.cards?.[f.id] ?? ""}" placeholder="${s.net18 ?? ""}" aria-label="${esc(p.name)} ${esc(f.label)}"></td>`; }).join("")}
        <td><input id="so${p.id}" inputmode="numeric" data-act="sorteo" data-id="${p.id}" value="${p.sorteo ?? ""}" aria-label="Sorteo ${esc(p.name)}" ${rk.find(r => r.id === p.id)?.tie || p.sorteo != null ? "" : "disabled"}></td></tr>`).join("")}
    </tbody></table></div>
    <p class="note" style="margin-top:8px">En gris aparece el neto de la tarjeta cargada hoyo por hoyo. Para confirmarlo como oficial, escribilo en el casillero. "Sorteo" se habilita solo para los empatados.</p>
    <button class="btn sm" data-act="holesedit" style="margin-top:12px">${UI.holesEdit ? "Cerrar tarjeta de la cancha" : "Editar tarjeta de la cancha (par y hándicap de cada hoyo)"}</button>
    ${UI.holesEdit ? `<div class="tw"><table class="edit"><thead><tr><th>Hoyo</th><th>Par</th><th>Hcp</th></tr></thead><tbody>
      ${holes.map((h, i) => `<tr><td><b class="num">${i + 1}</b></td><td><input id="hp${i}" inputmode="numeric" data-act="hpar" data-i="${i}" value="${h.par}"></td>
        <td><input id="hs${i}" inputmode="numeric" data-act="hsi" data-i="${i}" value="${h.si}"></td></tr>`).join("")}
      <tr class="tot"><td>Total</td><td class="num">${holes.reduce((a, h) => a + h.par, 0)}</td><td></td></tr></tbody></table></div>` : ""}
    <button class="btn" data-act="logout" style="margin-top:16px;width:100%">Salir de administrador</button>`;
}
function render() {
  const app = document.getElementById("app"), d = cur();
  if (!LOADED) app.innerHTML = `<div class="empty">Cargando…</div>`;
  else if (!d) app.innerHTML = `<div class="empty"><h2>Clasificación sin crear</h2><p>El administrador tiene que entrar abajo y crearla.</p></div>` + viewAdmin(d);
  else {
    if (!UI.fecha || !d.fechas.some(f => f.id === UI.fecha)) UI.fecha = defaultFecha(d);
    const rk = ranking(effective(d), d.fechas);
    app.innerHTML = header(rk, d) +
      (UI.tab === "live" ? viewLive(d) : UI.tab === "card" ? viewCard(d) : viewRanking(d, rk) + viewAdmin(d)) +
      `<p class="banner"><a href="./">Ir a la app de la Ryder ›</a></p>`;
  }
  document.getElementById("bottom").innerHTML =
    (ST.error ? `<div class="toast"><span>${esc(ST.error)}</span><button class="btn sm" data-act="dismiss">OK</button></div>` : "") +
    (DRAFT ? `<div class="savebar"><span>Cambios sin guardar</span><button class="btn sm" data-act="discard">Descartar</button><button class="btn sm primary" data-act="save">Guardar</button></div>` : "");
}
let pending = false;
function softRender() {
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT")) { pending = true; return; }
  render();
}
document.addEventListener("focusout", () => { if (pending) { pending = false; setTimeout(render, 0); } });
window.addEventListener("online", () => { ST.online = true; softRender(); });
window.addEventListener("offline", () => { ST.online = false; softRender(); });

// ---------- Eventos ----------
document.addEventListener("click", async e => {
  const b = e.target.closest("button[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act, d = cur();
  if (a === "tab") { UI.tab = b.dataset.v; if (UI.tab === "card" && d) firstEmptyHole(d); }
  else if (a === "fecha") { UI.fecha = b.dataset.v; if (d) firstEmptyHole(d); }
  else if (a === "hole") UI.hole = Math.max(1, Math.min(18, +b.dataset.n));
  else if (a === "inc") {
    const holes = holesOf(d), curV = (LIVE[cardId(UI.fecha, UI.me)] || {})["h" + UI.hole];
    const v = typeof curV !== "number" ? holes[UI.hole - 1].par : Math.max(1, Math.min(15, curV + +b.dataset.d));
    setHole(UI.fecha, UI.me, UI.hole, v);
  }
  else if (a === "clearhole") setHole(UI.fecha, UI.me, UI.hole, null);
  else if (a === "seed") DRAFT = seedClasif();
  else if (a === "discard") DRAFT = null;
  else if (a === "dismiss") ST.error = null;
  else if (a === "holesedit") UI.holesEdit = !UI.holesEdit;
  else if (a === "logout") { DRAFT = null; await logout(); }
  else if (a === "save") {
    const nd = DRAFT; DRAFT = null; DATA = nd;
    save(nd).catch(err => { ST.error = "No se pudo guardar (" + (err.code || err.message) + ")."; render(); });
  } else return;
  render();
});
function firstEmptyHole(d) {
  const c = LIVE[cardId(UI.fecha, UI.me)] || {};
  const i = holesOf(d).findIndex((_, k) => typeof c["h" + (k + 1)] !== "number");
  UI.hole = i < 0 ? 18 : i + 1;
}
document.addEventListener("change", e => {
  const el = e.target, a = el.dataset.act; if (!a) return;
  if (a === "me") {
    UI.me = el.value || null; try { localStorage.setItem("dorm-me", UI.me || ""); } catch (er) {}
    if (cur()) firstEmptyHole(cur()); render(); return;
  }
  if (!ST.admin) return;
  if (!DRAFT) DRAFT = structuredClone(DATA);
  const p = DRAFT.players.find(x => x.id === el.dataset.id), v = el.value.trim(), n = parseInt(v, 10);
  if (a === "score") {
    p.cards = p.cards || {};
    if (v === "" || v.toLowerCase() === "xx") delete p.cards[el.dataset.f];
    else if (n >= 40 && n <= 140) p.cards[el.dataset.f] = n;
    else ST.error = `"${v}" no parece un score neto válido.`;
  }
  else if (a === "hcp") { if (v === "") delete p.hcp; else if (!isNaN(n) && n >= -10 && n <= 54) p.hcp = n; else ST.error = `"${v}" no parece un hándicap válido.`; }
  else if (a === "sorteo") { if (v === "") delete p.sorteo; else if (n > 0) p.sorteo = n; }
  else if (a === "pname") p.name = v || p.name;
  else if (a === "flabel") DRAFT.fechas[+el.dataset.i].label = v || DRAFT.fechas[+el.dataset.i].label;
  else if (a === "hpar" || a === "hsi") {
    if (!Array.isArray(DRAFT.holes) || DRAFT.holes.length !== 18) DRAFT.holes = DEFAULT_HOLES.map(h => ({ ...h }));
    if (a === "hpar" && n >= 3 && n <= 6) DRAFT.holes[+el.dataset.i].par = n;
    if (a === "hsi" && n >= 1 && n <= 18) DRAFT.holes[+el.dataset.i].si = n;
  }
  render();
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "login") return;
  e.preventDefault();
  const email = document.getElementById("lg-email").value.trim(), pass = document.getElementById("lg-pass").value;
  ST.busy = true; ST.loginErr = null; render();
  try { await login(email, pass); }
  catch (err) {
    ST.loginErr = (err.code === "auth/invalid-credential" ? "Email o contraseña incorrectos." : "No se pudo entrar.") + ` (código: ${err.code || err.message})`;
  }
  ST.busy = false; render();
});

render();
start();
