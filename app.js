// app.js — Interfaz de la app. Dibuja las pantallas y responde a los toques.
import { COURSES, FORMATS, holeList, courseHcp, strokesOn, matchState, totals,
         defaultMatches, seedConfig, half } from "./golf.js";
import * as data from "./data.js";

// ---------- Estado ----------
let CFG = null;        // configuración guardada (jugadores, días, partidos)
let DRAFT = null;      // copia en edición del admin, hasta que toque "Guardar"
let SCORES = {};       // golpes cargados: { idPartido: { h1: { clave: gross } } }
let ST = {};           // estado de conexión / usuario
let LOADED = false;
const UI = { view: "board", match: null, hole: 1, mtab: "hole", confirm: null, cardEdit: null, pinErr: false, loginErr: null, busy: false };
const cfg = () => DRAFT || CFG;

const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pl = id => cfg().players.find(p => p.id === id) || { name: "?", index: 0 };
const teamName = s => cfg().teams[s].name;
const sideNames = ids => ids.map(id => esc(pl(id).name)).join(" / ");
const sesOf = m => cfg().sessions.find(s => s.id === m.session);
const nm = se => { const c = COURSES[se.course]; return `${c.short} · ${c.nines[se.nines[0]].name} + ${c.nines[se.nines[1]].name}`; };
const st = m => matchState(cfg(), m, SCORES[m.id]);

function getPin(id) { try { return localStorage.getItem("ryder-pin-" + id); } catch (e) { return null; } }
function setPin(id, v) { try { localStorage.setItem("ryder-pin-" + id, v); } catch (e) {} }
const canScore = m => ST.admin || getPin(m.id) === m.pin;

function edit(fn) { if (!DRAFT) DRAFT = structuredClone(CFG); fn(DRAFT); render(); }

// ---------- Tablero ----------
function scoreboard() {
  const t = totals(cfg(), SCORES), cells = [];
  const fa = Math.round(t.a * 2), fb = Math.round(t.b * 2), pa = Math.round(t.pa * 2), pb = Math.round(t.pb * 2);
  for (let i = 0; i < 24; i++) {
    let c = i < fa ? "fa" : i < pa ? "pa" : "";
    if (i >= 24 - fb) c = "fb"; else if (i >= 24 - pb && !c) c = "pb";
    cells.push(`<span class="${c}"></span>`);
  }
  const live = cfg().matches.filter(m => { const s = st(m); return s.played > 0 && !s.closed; }).length;
  const conn = !ST.online ? `<span class="conn off">Sin señal${ST.pending ? ` · ${ST.pending} por enviar` : ""}</span>`
             : ST.pending ? `<span class="conn">Enviando ${ST.pending}…</span>`
             : `<span class="conn">${data.isConfigured ? "En vivo" : "Modo demo"}</span>`;
  return `<section class="board">
    <div class="boardtop"><span class="eyebrow">${esc(cfg().title)}</span>${conn}</div>
    <div class="score">
      <div class="team"><span class="tname ta">${esc(teamName("A"))}</span><span class="pts num">${half(t.a) || 0}</span></div>
      <div class="vs">vs</div>
      <div class="team b"><span class="tname tb">${esc(teamName("B"))}</span><span class="pts num">${half(t.b) || 0}</span></div>
    </div>
    <div class="track" aria-label="Puntos sobre ${cfg().matches.length}">${cells.join("")}</div>
    <div class="trackcap"><span>${cfg().matches.length} puntos en juego</span><span>${half(cfg().matches.length / 2 + 0.5)} para ganar</span></div>
    <div class="proj">${live ? `${live} partido${live > 1 ? "s" : ""} en juego · si terminara ahora: ${half(t.pa) || 0} – ${half(t.pb) || 0}` : "Ningún partido en juego"}</div>
  </section>`;
}
function matchRow(m) {
  const s = st(m), cls = s.lead === "A" ? "a" : s.lead === "B" ? "b" : "";
  const sub = s.closed ? "final" : s.played ? `tras ${s.played}` : "";
  return `<button class="mrow" data-act="open" data-id="${m.id}">
    <span class="side ta">${sideNames(m.a)}</span>
    <span class="pill num ${s.played ? cls : ""} ${s.closed ? "fin" : ""}">${s.text}${sub ? `<small>${sub}</small>` : ""}</span>
    <span class="side b tb">${sideNames(m.b)}</span></button>`;
}
function viewBoard() {
  if (!cfg()) return `<div class="empty"><h2>Torneo sin configurar</h2><p>El administrador tiene que entrar en Configuración y crear el torneo.</p></div>`;
  let h = scoreboard();
  cfg().sessions.forEach(se => {
    const ms = cfg().matches.filter(m => m.session === se.id);
    const p = ms.reduce((a, m) => { const s = st(m); return [a[0] + s.pts[0], a[1] + s.pts[1]]; }, [0, 0]);
    h += `<h2>${esc(se.label)} · ${FORMATS[se.format].name}</h2>
      <p class="sub">${nm(se)} · tees ${esc(se.tee)} · día: ${half(p[0]) || 0} – ${half(p[1]) || 0}</p>
      <div class="list">${ms.map(matchRow).join("")}</div>`;
  });
  return h;
}

// ---------- Partido ----------
function viewMatch() {
  const m = cfg().matches.find(x => x.id === UI.match);
  if (!m) { UI.view = "board"; return viewBoard(); }
  const se = sesOf(m), s = st(m), hole = s.holes[UI.hole - 1], sc = SCORES[m.id]?.["h" + hole.n] || {};
  const can = canScore(m), lead = s.lead ? esc(teamName(s.lead)) : "";
  const big = s.played === 0 ? "Sin empezar" : s.closed ? (s.lead ? `${lead} gana ${s.text}` : "Empate") : (s.lead ? `${lead} ${s.text}` : "All Square");
  let h = `<div class="mtop"><button class="back" data-act="board">‹ Tablero</button>
      <span class="ttl">${esc(se.label)} · ${FORMATS[se.format].name} · ${nm(se)}</span></div>
    <div class="bigstatus"><div class="s ${s.lead === "A" ? "ta" : s.lead === "B" ? "tb" : ""}">${big}</div>
      <p class="note">${s.closed ? "Partido terminado" : s.played ? `tras ${s.played} hoyo${s.played > 1 ? "s" : ""} · quedan ${18 - s.played}` : "Cargá el hoyo 1 para empezar"}</p></div>`;
  if (!can) h += `<div class="lock"><p>${UI.pinErr ? '<b class="tb">PIN incorrecto.</b> ' : ""}Para cargar golpes ingresá el PIN del partido. Sin PIN podés mirar.</p>
      <input id="pin-input" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN del partido">
      <button class="btn sm primary" data-act="unlock">Cargar</button></div>`;
  h += `<div class="seg" role="group"><button data-act="mtab" data-v="hole" aria-pressed="${UI.mtab === "hole"}">Hoyo a hoyo</button>
      <button data-act="mtab" data-v="card" aria-pressed="${UI.mtab === "card"}">Tarjeta</button></div>`;
  if (UI.mtab === "card") return h + cardTable(m, s) + adminMatchTools(m);
  h += `<div class="holes">${s.holes.map((x, i) => {
      const r = s.res[i], c = r === "A" ? "wa" : r === "B" ? "wb" : r === "H" ? "wh" : "";
      return `<button class="num ${c} ${x.n === hole.n ? "cur" : ""}" data-act="hole" data-n="${x.n}" aria-label="Hoyo ${x.n}">${x.n}</button>`; }).join("")}</div>
    <div class="hcard"><div class="hhead"><span class="hn num">${hole.n}</span>
      <span class="hm">Par <b>${hole.par}</b> · SI <b class="num">${hole.si}</b><br>${COURSES[se.course].nines[se.nines[hole.n <= 9 ? 0 : 1]].name}</span></div>`;
  s.us.forEach(u => {
    const g = sc[u.key], k = strokesOn(u.strokes, hole.si);
    const net = typeof g === "number" ? `neto ${g - k}` : g === "X" ? "levantó" : "";
    h += `<div class="unit ${u.side}"><div><div class="uname">${u.pids.map(id => esc(pl(id).name)).join(" / ")}</div>
      <div class="umeta"><span>recibe ${u.strokes}</span>${k ? `<span class="dots" aria-label="${k} golpe en este hoyo">${"●".repeat(k)}</span>` : ""}<span class="num">${net}</span></div></div>
      <div class="step"><button data-act="inc" data-k="${u.key}" data-d="-1" aria-label="Restar golpe" ${can ? "" : "disabled"}>−</button>
        <span class="val num ${g === undefined || g === "X" ? "empty" : ""}">${g === undefined ? "–" : g}</span>
        <button data-act="inc" data-k="${u.key}" data-d="1" aria-label="Sumar golpe" ${can ? "" : "disabled"}>+</button>
        <button class="x" data-act="pick" data-k="${u.key}" aria-pressed="${g === "X"}" title="Levantó la pelota" ${can ? "" : "disabled"}>X</button></div></div>`;
  });
  const r = s.res[UI.hole - 1];
  h += `<div class="verdict ${r === "A" || r === "B" ? r : ""}">${r === null ? "Falta cargar el gross de todos" : r === "H" ? "Hoyo empatado" : `Hoyo para ${esc(teamName(r))}`}</div></div>
    <div class="nav2"><button class="btn" data-act="hole" data-n="${UI.hole - 1}" ${UI.hole === 1 ? "disabled" : ""}>‹ Hoyo ${Math.max(1, UI.hole - 1)}</button>
      <button class="btn primary" data-act="hole" data-n="${UI.hole + 1}" ${UI.hole === 18 ? "disabled" : ""}>Hoyo ${Math.min(18, UI.hole + 1)} ›</button></div>
    <p class="banner">● = golpe recibido en el hoyo. Hándicap de juego: ${s.us.map(u => `${u.pids.map(id => esc(pl(id).name)).join("/")} ${u.hcp}`).join(" · ")}</p>`;
  return h + adminMatchTools(m);
}
function adminMatchTools(m) {
  if (!ST.admin) return "";
  return `<div class="panel"><p class="note">Admin · PIN de este partido: <b class="num">${esc(m.pin)}</b></p>
    ${UI.confirm === "clear" + m.id
      ? `<div class="grid2"><button class="btn" data-act="noconfirm">Cancelar</button><button class="btn danger" data-act="clear" data-id="${m.id}">Sí, borrar todo</button></div>`
      : `<button class="btn danger" data-act="ask" data-v="clear${m.id}">Borrar los resultados de este partido</button>`}</div>`;
}
function cardTable(m, s) {
  let h = `<div class="tw"><table><thead><tr><th>Hoyo</th><th>Par</th><th>SI</th>${s.us.map(u => `<th class="${u.side}">${u.pids.map(id => esc(pl(id).name)).join("<br>")}</th>`).join("")}<th>Estado</th></tr></thead><tbody>`;
  let diff = 0; const tot = s.us.map(() => 0), cnt = s.us.map(() => 0);
  s.holes.forEach((ho, i) => {
    const sc = SCORES[m.id]?.["h" + ho.n] || {}, r = s.res[i];
    if (r === "A") diff++; if (r === "B") diff--;
    const stat = r === null ? "" : diff === 0 ? "AS" : `<span class="${diff > 0 ? "ta" : "tb"}">${Math.abs(diff)} UP</span>`;
    h += `<tr><td><b class="num">${ho.n}</b></td><td>${ho.par}</td><td class="num">${ho.si}</td>${s.us.map((u, k) => {
        const g = sc[u.key], d = strokesOn(u.strokes, ho.si);
        if (typeof g === "number") { tot[k] += g; cnt[k]++; }
        return `<td class="num">${g ?? ""}${d ? `<sup>${"●".repeat(d)}</sup>` : ""}</td>`; }).join("")}<td class="r">${stat}</td></tr>`;
    if (ho.n === 9) h += `<tr class="tot"><td colspan="3">Ida</td>${s.us.map((u, k) => `<td class="num">${cnt[k] ? tot[k] : ""}</td>`).join("")}<td></td></tr>`;
  });
  return h + `<tr class="tot"><td colspan="3">Total</td>${s.us.map((u, k) => `<td class="num">${cnt[k] ? tot[k] : ""}</td>`).join("")}<td class="r">${s.text}</td></tr></tbody></table></div>`;
}

// ---------- Jugadores ----------
function viewPlayers() {
  if (!cfg()) return viewBoard();
  const a = ST.admin;
  let h = `<h2>Jugadores</h2><p class="sub">Índice y hándicap de cancha de cada día (con el rating y slope cargados).${a ? " Los cambios se guardan con el botón de abajo." : ""}</p>`;
  ["A", "B"].forEach(side => {
    h += `<div class="panel">${a
        ? `<div class="field"><label for="tn${side}">Equipo</label><input id="tn${side}" data-act="tname" data-side="${side}" value="${esc(teamName(side))}"></div>`
        : `<h3 class="${side === "A" ? "ta" : "tb"}">${esc(teamName(side))}</h3>`}
      <div><div class="prow h"><span>Nombre</span><span>Índice</span>${cfg().sessions.map(se => `<span>${esc(se.label.replace("Día ", "D"))}</span>`).join("")}</div>`;
    cfg().players.filter(p => p.team === side).forEach(p => {
      h += `<div class="prow">${a
          ? `<input id="pn${p.id}" aria-label="Nombre" data-act="pname" data-id="${p.id}" value="${esc(p.name)}">
             <input id="pi${p.id}" aria-label="Índice" inputmode="decimal" data-act="pidx" data-id="${p.id}" value="${p.index}" class="num">`
          : `<span class="nm">${esc(p.name)}</span><span class="c num">${p.index}</span>`}
        ${cfg().sessions.map(se => `<span class="c num">${courseHcp(p.index, se)}</span>`).join("")}</div>`;
    });
    h += `</div></div>`;
  });
  return h;
}

// ---------- Configuración ----------
function viewSettings() {
  if (!ST.admin) {
    return `<h2>Configuración</h2><p class="sub">Solo el administrador puede cambiar jugadores, formatos y parejas.</p>
      <form class="panel" id="login">
        <div class="field"><label for="lg-email">Email</label><input id="lg-email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="lg-pass">Contraseña</label><input id="lg-pass" type="password" autocomplete="current-password" required></div>
        ${UI.loginErr ? `<p class="note tb">${esc(UI.loginErr)}</p>` : ""}
        <button class="btn primary" type="submit" ${UI.busy ? "disabled" : ""}>Entrar como administrador</button>
        ${!data.isConfigured ? `<p class="note">Modo demo: cualquier email y contraseña sirven.</p>` : ""}
      </form>`;
  }
  if (!cfg()) {
    return `<h2>Configuración</h2><div class="panel"><p class="note">El torneo todavía no existe en la base. Crealo con datos iniciales y después cargá los jugadores reales.</p>
      <button class="btn primary" data-act="seed">Crear torneo</button></div>
      <button class="btn" data-act="logout" style="margin-top:16px;width:100%">Salir de administrador</button>`;
  }
  const c = cfg();
  const opt = (list, val) => list.map(([v, l]) => `<option value="${v}" ${v === val ? "selected" : ""}>${esc(l)}</option>`).join("");
  let h = `<h2>Configuración</h2><p class="sub">Los cambios se guardan todos juntos con el botón de abajo. Cambiar a o desde singles rearma los partidos de ese día.</p>
    <div class="panel"><div class="field"><label for="ttl">Nombre del torneo</label><input id="ttl" data-act="title" value="${esc(c.title)}"></div></div>`;
  c.sessions.forEach(se => {
    const co = COURSES[se.course], f = FORMATS[se.format], ms = c.matches.filter(m => m.session === se.id);
    const nines = Object.entries(co.nines).map(([k, n]) => [k, n.name]);
    const players = side => c.players.filter(p => p.team === side).map(p => [p.id, p.name]);
    h += `<h2 style="font-size:19px">${esc(se.label)}</h2><div class="panel">
      <div class="grid2">
        <div class="field"><label for="f${se.id}">Formato</label><select id="f${se.id}" data-act="sformat" data-id="${se.id}">${opt(Object.entries(FORMATS).map(([k, v]) => [k, v.name]), se.format)}</select></div>
        <div class="field"><label for="c${se.id}">Cancha</label><select id="c${se.id}" data-act="scourse" data-id="${se.id}">${opt(Object.entries(COURSES).map(([k, v]) => [k, v.short]), se.course)}</select></div>
        <div class="field"><label for="n1${se.id}">Primeros 9</label><select id="n1${se.id}" data-act="snine" data-i="0" data-id="${se.id}">${opt(nines, se.nines[0])}</select></div>
        <div class="field"><label for="n2${se.id}">Segundos 9</label><select id="n2${se.id}" data-act="snine" data-i="1" data-id="${se.id}">${opt(nines, se.nines[1])}</select></div>
      </div>
      <p class="note">${f.desc}</p>
      <div class="grid3">
        <div class="field"><label for="t${se.id}">Tees</label><input id="t${se.id}" data-act="stee" data-id="${se.id}" value="${esc(se.tee)}"></div>
        <div class="field"><label for="cr${se.id}">Rating</label><input id="cr${se.id}" inputmode="decimal" data-act="scr" data-id="${se.id}" value="${se.cr}" class="num"></div>
        <div class="field"><label for="sl${se.id}">Slope</label><input id="sl${se.id}" inputmode="numeric" data-act="ssl" data-id="${se.id}" value="${se.slope}" class="num"></div>
      </div>
      ${!f.team ? `<div class="field"><label for="pc${se.id}">% del hándicap</label><input id="pc${se.id}" inputmode="numeric" data-act="spct" data-id="${se.id}" value="${se.pct ?? f.defPct}" class="num"></div>` : ""}
      <label class="check"><input type="checkbox" id="ok${se.id}" data-act="sconf" data-id="${se.id}" ${se.confirmed ? "checked" : ""}> Rating, slope y tarjeta confirmados con el club</label>
      ${!se.confirmed ? `<p class="note warn"><span class="chip warn">A confirmar</span> Mientras no esté confirmado, el hándicap y el stroke index son provisorios.</p>` : ""}
      <button class="btn sm" data-act="cardedit" data-id="${se.id}">${UI.cardEdit === se.id ? "Cerrar tarjeta" : "Editar tarjeta (par y stroke index)"}</button>
      ${UI.cardEdit === se.id ? cardEditor(se) : ""}
      <div class="pairs"><div class="pair"><span class="chip ta">${esc(teamName("A"))}</span><span></span><span class="chip tb" style="justify-self:end">${esc(teamName("B"))}</span></div>
      ${ms.map((m, mi) => `<div class="pair">
        <div class="col A">${m.a.map((id, j) => `<select id="pa${m.id}${j}" aria-label="Partido ${mi + 1} ${esc(teamName("A"))}" data-act="pair" data-m="${m.id}" data-s="a" data-j="${j}">${opt(players("A"), id)}</select>`).join("")}</div>
        <span class="mid">PIN<b class="num">${esc(m.pin)}</b></span>
        <div class="col B">${m.b.map((id, j) => `<select id="pb${m.id}${j}" aria-label="Partido ${mi + 1} ${esc(teamName("B"))}" data-act="pair" data-m="${m.id}" data-s="b" data-j="${j}">${opt(players("B"), id)}</select>`).join("")}</div>
      </div>`).join("")}</div>
    </div>`;
  });
  return h + `<button class="btn" data-act="logout" style="margin-top:24px;width:100%">Salir de administrador</button>`;
}
function cardEditor(se) {
  const holes = holeList(se), sis = holes.map(h => h.si);
  const dup = si => sis.filter(x => x === si).length > 1 || si < 1 || si > 18;
  return `<p class="note">Copiá la tarjeta oficial de esta combinación de nueves. El stroke index va de 1 a 18 sin repetir.</p>
    <div class="tw"><table><thead><tr><th>Hoyo</th><th>Par</th><th>SI</th></tr></thead><tbody>
    ${holes.map((h, i) => `<tr><td><b class="num">${h.n}</b></td>
      <td><input id="hp${se.id}${i}" inputmode="numeric" data-act="hpar" data-id="${se.id}" data-i="${i}" value="${h.par}" aria-label="Par hoyo ${h.n}"></td>
      <td><input id="hs${se.id}${i}" inputmode="numeric" data-act="hsi" data-id="${se.id}" data-i="${i}" value="${h.si}" class="${dup(h.si) ? "bad" : ""}" aria-label="SI hoyo ${h.n}"></td></tr>`).join("")}
    <tr class="tot"><td>Total</td><td class="num">${holes.reduce((a, h) => a + h.par, 0)}</td><td></td></tr></tbody></table></div>`;
}

// ---------- Render ----------
function render() {
  const app = document.getElementById("app");
  if (!LOADED) { app.innerHTML = `<div class="empty">Cargando…</div>`; return; }
  app.innerHTML = UI.view === "match" ? viewMatch() : UI.view === "players" ? viewPlayers() : UI.view === "settings" ? viewSettings() : viewBoard();
  const tab = UI.view === "match" ? "board" : UI.view;
  document.getElementById("bottom").innerHTML =
    (ST.error ? `<div class="toast"><span>${esc(ST.error)}</span><button class="btn sm" data-act="dismiss">OK</button></div>` : "") +
    (DRAFT ? `<div class="savebar"><span>Cambios sin guardar</span><button class="btn sm" data-act="discard">Descartar</button><button class="btn sm primary" data-act="save">Guardar</button></div>` : "") +
    `<nav class="tabs">${[["board", "Tablero"], ["players", "Jugadores"], ["settings", "Configuración"]]
      .map(([v, l]) => `<button data-act="tab" data-v="${v}" ${tab === v ? 'aria-current="page"' : ""}>${l}</button>`).join("")}</nav>`;
}

// ---------- Eventos ----------
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "tab") { UI.view = b.dataset.v; UI.confirm = null; scrollTo(0, 0); }
  else if (a === "board") UI.view = "board";
  else if (a === "open") {
    UI.view = "match"; UI.match = b.dataset.id; UI.mtab = "hole"; UI.pinErr = false; UI.confirm = null;
    UI.hole = Math.min(18, st(cfg().matches.find(x => x.id === UI.match)).played + 1); scrollTo(0, 0);
  }
  else if (a === "mtab") UI.mtab = b.dataset.v;
  else if (a === "hole") UI.hole = Math.max(1, Math.min(18, +b.dataset.n));
  else if (a === "unlock") {
    const m = cfg().matches.find(x => x.id === UI.match), v = document.getElementById("pin-input").value.trim();
    if (v === m.pin) { setPin(m.id, v); UI.pinErr = false; } else UI.pinErr = true;
  }
  else if (a === "inc" || a === "pick") {
    const m = cfg().matches.find(x => x.id === UI.match); if (!canScore(m)) return;
    const hole = holeList(sesOf(m))[UI.hole - 1], k = b.dataset.k;
    const cur = SCORES[m.id]?.["h" + hole.n]?.[k];
    let v;
    if (a === "pick") v = cur === "X" ? null : "X";
    else v = typeof cur !== "number" ? hole.par : Math.max(1, Math.min(15, cur + +b.dataset.d));
    // Actualización optimista: se ve al instante aunque no haya señal.
    const s = SCORES[m.id] = SCORES[m.id] || {}, hk = s["h" + hole.n] = { ...(s["h" + hole.n] || {}) };
    if (v === null) delete hk[k]; else hk[k] = v;
    data.setScore(m.id, hole.n, k, v);
  }
  else if (a === "ask") UI.confirm = b.dataset.v;
  else if (a === "noconfirm") UI.confirm = null;
  else if (a === "clear") { data.clearMatch(b.dataset.id); UI.confirm = null; }
  else if (a === "dismiss") ST.error = null;
  else if (a === "discard") DRAFT = null;
  else if (a === "save") {
    const d = DRAFT; DRAFT = null; CFG = d;
    data.saveConfig(d).catch(err => { ST.error = "No se pudo guardar: " + (err.code || err.message); render(); });
  }
  else if (a === "seed") { DRAFT = seedConfig(); }
  else if (a === "cardedit") UI.cardEdit = UI.cardEdit === b.dataset.id ? null : b.dataset.id;
  else if (a === "logout") { DRAFT = null; data.adminLogout(); }
  else return;
  render();
});

document.addEventListener("submit", async e => {
  if (e.target.id !== "login") return;
  e.preventDefault();
  UI.busy = true; UI.loginErr = null; render();
  try { await data.adminLogin(document.getElementById("lg-email").value.trim(), document.getElementById("lg-pass").value); }
  catch (err) {
    // Traducimos el código de Firebase a una explicación concreta.
    const msgs = {
      "auth/invalid-credential": "Email o contraseña incorrectos.",
      "auth/wrong-password": "Contraseña incorrecta.",
      "auth/user-not-found": "No existe un usuario con ese email en Firebase.",
      "auth/invalid-email": "El email no tiene un formato válido.",
      "auth/operation-not-allowed": "El acceso con email y contraseña no está habilitado en Firebase (Authentication > Método de acceso).",
      "auth/unauthorized-domain": "Este sitio no está en los dominios autorizados de Firebase (Authentication > Configuración).",
      "auth/too-many-requests": "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.",
      "auth/network-request-failed": "No hay conexión con Firebase. Revisá internet."
    };
    UI.loginErr = (msgs[err.code] || "No se pudo entrar.") + ` (código: ${err.code || err.message})`;
  }
  UI.busy = false; render();
});

document.addEventListener("change", e => {
  const el = e.target, a = el.dataset.act; if (!a || !ST.admin) return;
  const num = v => parseFloat(String(v).replace(",", "."));
  edit(d => {
    const se = d.sessions.find(x => x.id === el.dataset.id);
    if (a === "title") d.title = el.value.trim() || d.title;
    else if (a === "sformat") {
      const old = FORMATS[se.format].size; se.format = el.value;
      if (FORMATS[se.format].defPct) se.pct = FORMATS[se.format].defPct; else delete se.pct;
      if (FORMATS[se.format].size !== old) {
        const tag = Date.now().toString(36).slice(-4);   // ids nuevos: no mezclar con resultados viejos
        const fresh = defaultMatches(d, se).map(m => ({ ...m, id: m.id + tag }));
        d.matches = d.matches.filter(m => m.session !== se.id).concat(fresh);
      }
    }
    else if (a === "scourse") { se.course = el.value; const k = Object.keys(COURSES[se.course].nines); se.nines = [k[0], k[1]]; delete se.holes; se.confirmed = false; }
    else if (a === "snine") { se.nines[+el.dataset.i] = el.value; delete se.holes; se.confirmed = false; }
    else if (a === "stee") se.tee = el.value.trim() || se.tee;
    else if (a === "scr") { const v = num(el.value); if (v > 50 && v < 85) se.cr = v; }
    else if (a === "ssl") { const v = parseInt(el.value); if (v >= 55 && v <= 155) se.slope = v; }
    else if (a === "spct") { const v = parseInt(el.value); if (v > 0 && v <= 100) se.pct = v; }
    else if (a === "sconf") se.confirmed = el.checked;
    else if (a === "hpar" || a === "hsi") {
      if (!se.holes) se.holes = holeList(se).map(h => ({ par: h.par, si: h.si }));
      const v = parseInt(el.value);
      if (a === "hpar" && v >= 3 && v <= 6) se.holes[+el.dataset.i].par = v;
      if (a === "hsi" && v >= 1 && v <= 18) se.holes[+el.dataset.i].si = v;
    }
    else if (a === "pair") { const m = d.matches.find(x => x.id === el.dataset.m); m[el.dataset.s][+el.dataset.j] = el.value; }
    else if (a === "pname") { const p = d.players.find(x => x.id === el.dataset.id); p.name = el.value.trim() || p.name; }
    else if (a === "pidx") { const v = num(el.value); if (!isNaN(v) && v >= -5 && v <= 54) d.players.find(x => x.id === el.dataset.id).index = v; }
    else if (a === "tname") d.teams[el.dataset.side].name = el.value.trim() || d.teams[el.dataset.side].name;
  });
});

// ---------- Arranque ----------
// Si llegan datos nuevos mientras alguien escribe en un campo, esperamos
// a que termine para no borrarle lo que está tipeando.
let pendingRender = false;
function softRender() {
  const ae = document.activeElement;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT")) { pendingRender = true; return; }
  render();
}
document.addEventListener("focusout", () => { if (pendingRender) { pendingRender = false; setTimeout(render, 0); } });

render();
data.start({
  onConfig: c => { CFG = c; LOADED = true; softRender(); },
  onScores: s => { SCORES = s; softRender(); },
  onStatus: s => { ST = { ...ST, ...s }; softRender(); }
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
