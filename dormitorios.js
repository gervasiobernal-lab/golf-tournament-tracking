// dormitorios.js — Pantalla de la clasificación (orden de elección de camas).
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";
import { ranking, seedClasif } from "./clasif.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
// ?demo en la dirección: guarda solo en este navegador (para probar sin tocar la base).
const DEMO = String(firebaseConfig.apiKey).startsWith("PEGAR") || location.search.includes("demo");

let DATA = null, DRAFT = null, LOADED = false;
const ST = { admin: false, error: null, loginErr: null, busy: false, online: navigator.onLine };
const cur = () => DRAFT || DATA;
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let F, A, db, auth;

// ---------- Datos ----------
async function start() {
  if (DEMO) {
    try { DATA = JSON.parse(localStorage.getItem("dorm-demo")); } catch (e) {}
    LOADED = true; render(); return;
  }
  const appMod = await import(`${SDK}/firebase-app.js`);
  F = await import(`${SDK}/firebase-firestore.js`);
  A = await import(`${SDK}/firebase-auth.js`);
  const app = appMod.initializeApp(firebaseConfig);
  db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  auth = A.getAuth(app);
  A.onAuthStateChanged(auth, u => {
    if (!u) { A.signInAnonymously(auth).catch(() => {}); return; }
    ST.admin = !u.isAnonymous && u.email === ADMIN_EMAIL; softRender();
  });
  F.onSnapshot(F.doc(db, "torneo", "clasificacion"),
    s => { DATA = s.exists() ? s.data() : null; LOADED = true; softRender(); },
    e => { ST.error = "No se pudo leer la clasificación (" + e.code + ")."; LOADED = true; softRender(); });
}
async function save(d) {
  if (DEMO) { DATA = structuredClone(d); try { localStorage.setItem("dorm-demo", JSON.stringify(d)); } catch (e) {} return; }
  await F.setDoc(F.doc(db, "torneo", "clasificacion"), JSON.parse(JSON.stringify(d)));
}
async function login(email, pass) {
  if (DEMO) { ST.admin = true; return; }
  await A.signInWithEmailAndPassword(auth, email, pass);
}
async function logout() { if (DEMO) { ST.admin = false; return; } await A.signOut(auth); }

// ---------- Vistas ----------
const ord = n => n + "º";
function header(rk, d) {
  const played = d.fechas.filter(f => d.players.some(p => typeof p.cards?.[f.id] === "number"));
  const next = d.fechas.find(f => !played.includes(f));
  const top = rk[0];
  return `<section class="board">
    <div class="boardtop"><span class="eyebrow">${esc(d.sede)}</span>
      <span class="conn">${DEMO ? "Modo demo" : ST.online ? "En vivo" : "Sin señal"}</span></div>
    <h1 class="dtitle">${esc(d.title)}</h1>
    <p class="dsub">El ranking define el orden de elección de camas en Chile.</p>
    <div class="fechas">${d.fechas.map((f, i) => `<span class="fecha ${played.includes(f) ? "done" : f === next ? "next" : ""}">
      <small>Fecha ${i + 1}</small><b class="num">${esc(f.label)}</b><small>${played.includes(f) ? "jugada" : f === next ? "próxima" : "pendiente"}</small></span>`).join("")}</div>
    ${top && top.best !== undefined ? `<p class="lead">🛏️ <b>${esc(top.name)}</b> elige primero${top.tie ? " (empatado)" : ""} con <b class="num">${top.best}</b> neto</p>` : ""}
  </section>`;
}
function rowView(p, d) {
  const chips = d.fechas.map(f => {
    const v = p.cards?.[f.id];
    const isBest = typeof v === "number" && v === p.best;
    return `<span class="card ${typeof v === "number" ? (isBest ? "best" : "") : "none"}" title="Fecha ${esc(f.label)}">
      <small>${esc(f.label)}</small><b class="num">${typeof v === "number" ? v : "–"}</b></span>`;
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
function viewRanking() {
  const d = cur();
  if (!d) return `<div class="empty"><h2>Clasificación sin crear</h2><p>El administrador tiene que entrar abajo y crearla.</p></div>`;
  const rk = ranking(d.players, d.fechas);
  return header(rk, d) + `
    <h2>Orden de elección</h2>
    <p class="sub">Cuenta la mejor tarjeta neta de las ${d.fechas.length} fechas. Desempate: segunda mejor tarjeta y después la tercera.</p>
    <ol class="rank">${rk.map(p => rowView(p, d)).join("")}</ol>
    ${rk.some(p => p.tie) ? `<p class="note warn" style="margin-top:10px">Los empates que sigan después de la última fecha se definen por sorteo.</p>` : ""}`;
}
function viewAdmin() {
  if (!ST.admin) return `<h2>Administrador</h2>
    <form class="panel" id="login">
      <div class="field"><label for="lg-email">Email</label><input id="lg-email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="lg-pass">Contraseña</label><input id="lg-pass" type="password" autocomplete="current-password" required></div>
      ${ST.loginErr ? `<p class="note tb">${esc(ST.loginErr)}</p>` : ""}
      <button class="btn primary" type="submit" ${ST.busy ? "disabled" : ""}>Entrar para cargar tarjetas</button>
    </form>`;
  const d = cur();
  if (!d) return `<h2>Administrador</h2><div class="panel"><p class="note">Crea la clasificación con los 12 jugadores y los resultados del 19/09 ya cargados.</p>
    <button class="btn primary" data-act="seed">Crear clasificación</button></div>`;
  const rk = ranking(d.players, d.fechas);
  return `<h2>Cargar tarjetas</h2>
    <p class="sub">Score neto de cada fecha. Vacío = no jugó. Los cambios se guardan con el botón de abajo.</p>
    <div class="tw"><table class="edit"><thead><tr><th style="text-align:left">Jugador</th>
      ${d.fechas.map((f, i) => `<th><input id="fl${i}" class="flabel" data-act="flabel" data-i="${i}" value="${esc(f.label)}" aria-label="Fecha ${i + 1}"></th>`).join("")}
      <th>Sorteo</th></tr></thead><tbody>
      ${d.players.map(p => `<tr><td style="text-align:left"><input id="pn${p.id}" class="pname" data-act="pname" data-id="${p.id}" value="${esc(p.name)}" aria-label="Nombre"></td>
        ${d.fechas.map(f => `<td><input id="s${p.id}${f.id}" inputmode="numeric" data-act="score" data-id="${p.id}" data-f="${f.id}" value="${p.cards?.[f.id] ?? ""}" aria-label="${esc(p.name)} ${esc(f.label)}"></td>`).join("")}
        <td><input id="so${p.id}" inputmode="numeric" data-act="sorteo" data-id="${p.id}" value="${p.sorteo ?? ""}" aria-label="Sorteo ${esc(p.name)}" ${rk.find(r => r.id === p.id)?.tie || p.sorteo != null ? "" : "disabled"}></td></tr>`).join("")}
    </tbody></table></div>
    <p class="note" style="margin-top:8px">"Sorteo" se habilita solo para los empatados: poné 1, 2, 3… según el resultado del sorteo.</p>
    <button class="btn" data-act="logout" style="margin-top:16px;width:100%">Salir de administrador</button>`;
}
function render() {
  const app = document.getElementById("app");
  app.innerHTML = !LOADED ? `<div class="empty">Cargando…</div>` : viewRanking() + viewAdmin() +
    `<p class="banner"><a href="./">Ir a la app de la Ryder ›</a></p>`;
  document.getElementById("bottom").innerHTML =
    (ST.error ? `<div class="toast"><span>${esc(ST.error)}</span><button class="btn sm" data-act="dismiss">OK</button></div>` : "") +
    (DRAFT ? `<div class="savebar"><span>Cambios sin guardar</span><button class="btn sm" data-act="discard">Descartar</button><button class="btn sm primary" data-act="save">Guardar</button></div>` : "");
}
let pending = false;
function softRender() {
  const ae = document.activeElement;
  if (ae && ae.tagName === "INPUT") { pending = true; return; }
  render();
}
document.addEventListener("focusout", () => { if (pending) { pending = false; setTimeout(render, 0); } });
window.addEventListener("online", () => { ST.online = true; softRender(); });
window.addEventListener("offline", () => { ST.online = false; softRender(); });

// ---------- Eventos ----------
document.addEventListener("click", async e => {
  const b = e.target.closest("button[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "seed") DRAFT = seedClasif();
  else if (a === "discard") DRAFT = null;
  else if (a === "dismiss") ST.error = null;
  else if (a === "logout") { DRAFT = null; await logout(); }
  else if (a === "save") {
    const d = DRAFT; DRAFT = null; DATA = d;
    save(d).catch(err => { ST.error = "No se pudo guardar (" + (err.code || err.message) + ")."; render(); });
  } else return;
  render();
});
document.addEventListener("change", e => {
  const el = e.target, a = el.dataset.act; if (!a || !ST.admin) return;
  if (!DRAFT) DRAFT = structuredClone(DATA);
  const p = DRAFT.players.find(x => x.id === el.dataset.id);
  const v = el.value.trim();
  if (a === "score") {
    p.cards = p.cards || {};
    const n = parseInt(v, 10);
    if (v === "" || v.toLowerCase() === "xx") delete p.cards[el.dataset.f];
    else if (n >= 40 && n <= 140) p.cards[el.dataset.f] = n;
    else { ST.error = `"${v}" no parece un score neto válido.`; }
  }
  else if (a === "sorteo") { const n = parseInt(v, 10); if (v === "") delete p.sorteo; else if (n > 0) p.sorteo = n; }
  else if (a === "pname") p.name = v || p.name;
  else if (a === "flabel") DRAFT.fechas[+el.dataset.i].label = v || DRAFT.fechas[+el.dataset.i].label;
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
