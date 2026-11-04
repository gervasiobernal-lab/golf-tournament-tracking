// extras.js — Long drive / closest, "¿Quién sos?" (avisos) y Ryder Wrapped.
// Todo se calcula con los datos que ya hay: configuración + golpes cargados.
import { FORMATS, matchState, holeList, courseHcp, strokesOn, COURSES } from "./golf.js";

// ---------- Long drive y closest to the pin ----------
// Se guardan en la colección "scores", documento "x-<idPartido>", con campos
// "ld<hoyo>" / "ctp<hoyo>" = { pid, d } (d = yardas a la bandera, opcional: se mide con láser).
export const extraId = matchId => "x-" + matchId;

// Ranking de un desafío (tipo "ld" o "ctp") en un hoyo de una sesión.
export function challengeBoard(cfg, allScores, sessionId, type, hole) {
  const rows = [];
  cfg.matches.filter(m => m.session === sessionId).forEach(m => {
    const e = allScores[extraId(m.id)]?.[type + hole];
    if (!e || !e.pid) return;
    const p = cfg.players.find(x => x.id === e.pid);
    if (p) rows.push({ p, d: typeof e.d === "number" ? e.d : null, match: m });
  });
  // En los dos gana el que quedó más cerca de la bandera (menos yardas). Sin distancia, al final.
  rows.sort((a, b) => a.d === null ? 1 : b.d === null ? -1 : a.d - b.d);
  return rows;
}

// "7, 15" → [7, 15]
export function parseHoles(txt) {
  return [...new Set(String(txt).split(/[^\d]+/).map(Number).filter(n => n >= 1 && n <= 18))].sort((a, b) => a - b);
}

// ---------- Avisos personalizados ----------
// Foto del estado de los partidos de un jugador, para comparar antes/después.
export function snapshotFor(cfg, allScores, pid) {
  const out = {};
  cfg.matches.forEach(m => {
    const mine = m.a.includes(pid) ? "A" : m.b.includes(pid) ? "B" : null;
    if (!mine) return;
    const st = matchState(cfg, m, allScores[m.id]);
    out[m.id] = { mine, lead: st.lead, diff: st.diff, played: st.played, closed: st.matchClosed, text: st.text,
      duels: (st.duels || []).filter(d => d.a === pid || d.b === pid)
        .map(d => ({ key: d.a + d.b, opp: d.a === pid ? d.b : d.a, mine: d.a === pid ? "A" : "B", lead: d.lead, closed: d.closed, text: d.text })) };
  });
  return out;
}

// Mensajes según lo que cambió entre dos fotos.
export function alertsBetween(prev, next, cfg) {
  const msgs = [], name = id => cfg.players.find(p => p.id === id)?.name || "?";
  Object.entries(next).forEach(([mid, n]) => {
    const p = prev[mid]; if (!p || n.played === p.played && n.closed === p.closed) return;
    const other = n.mine === "A" ? "B" : "A";
    if (n.closed && !p.closed) {
      msgs.push(n.lead === n.mine ? `¡Ganaste tu partido ${n.text}! 🏆` : n.lead === other ? `Perdiste ${n.text}. Hay revancha 🍺` : "Partido empatado 🤝");
    } else if (!n.closed) {
      if (p.lead === n.mine && n.lead === other) msgs.push("¡Te dieron vuelta el partido! 😱");
      else if (p.lead === n.mine && n.lead === null) msgs.push("Te están dando vuelta el partido 😬 Quedó All Square");
      else if (p.lead === other && n.lead === n.mine) msgs.push("¡Lo diste vuelta! 🔥");
      else if (p.lead === null && n.lead === n.mine && p.played > 0) msgs.push("¡Pasaste adelante! 💪");
      else if (p.lead === null && n.lead === other && p.played > 0) msgs.push("Te pasaron adelante 😬");
      else if (p.lead === other && n.lead === null) msgs.push("¡Lo empataste! Vamos que se puede 💪");
      const left = 18 - n.played;
      if (left > 0 && Math.abs(n.diff) === left && !(Math.abs(p.diff) === 18 - p.played))
        msgs.push(n.lead === n.mine ? "Dormie a favor 😎 Con empatar un hoyo, ganás" : "Estás dormie… a remar 🚣");
    }
    n.duels.forEach(d => {
      const pd = p.duels.find(x => x.key === d.key);
      if (d.closed && pd && !pd.closed)
        msgs.push(d.lead === d.mine ? `¡Le ganaste el individual a ${name(d.opp)} ${d.text}! 🎯` : d.lead ? `${name(d.opp)} te ganó el individual ${d.text}` : `Empataste el individual con ${name(d.opp)}`);
    });
  });
  return msgs;
}

// ---------- Ryder Wrapped ----------
const SCORE_NAMES = { "-3": "Albatros", "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey", "2": "Doble bogey" };
export const scoreName = d => SCORE_NAMES[String(d)] || (d > 0 ? `+${d}` : String(d));

export function wrapped(cfg, allScores, pid) {
  const pl = id => cfg.players.find(p => p.id === id);
  const me = pl(pid);
  const w = { p: me, pts: 0, won: 0, halved: 0, lost: 0, beaten: new Map(), gifts: 0, giftsDetail: [],
    holes: 0, best: null, streak: 0, birdiesNet: 0, parsOrBetter: 0, matches: 0 };
  const result = (mineLead, closed, oppIds, val, label) => {
    if (!closed) return;
    w.matches++;
    if (mineLead === true) { w.won++; w.pts += val; oppIds.forEach(o => w.beaten.set(o, (w.beaten.get(o) || 0) + 1)); }
    else if (mineLead === null) { w.halved++; w.pts += val / 2; }
    else w.lost++;
  };
  cfg.matches.forEach(m => {
    const side = m.a.includes(pid) ? "A" : m.b.includes(pid) ? "B" : null;
    if (!side) return;
    const se = cfg.sessions.find(s => s.id === m.session), f = FORMATS[se.format];
    const scores = allScores[m.id] || {}, st = matchState(cfg, m, scores);
    const opp = side === "A" ? m.b : m.a;
    // Partido principal
    result(st.lead === null ? null : st.lead === side, st.matchClosed, opp, 1);
    const u = st.us.find(x => x.pids.includes(pid));
    if (u && u.strokes > 0) { w.gifts += u.strokes; w.giftsDetail.push({ n: u.strokes, what: `${f.name} ${se.label}` }); }
    // Individuales
    (st.duels || []).forEach(d => {
      if (d.a !== pid && d.b !== pid) return;
      const mineIsA = d.a === pid, oppId = mineIsA ? d.b : d.a;
      result(d.lead === null ? null : (d.lead === "A") === mineIsA, d.closed, [oppId], d.val);
      const got = mineIsA ? d.sa : d.sb;
      if (got > 0) { w.gifts += got; w.giftsDetail.push({ n: got, what: `individual vs ${pl(oppId).name}` }); }
    });
    // Hoyos: solo con pelota propia
    if (f.team) return;
    const hcp = courseHcp(me.index, se), course = COURSES[se.course];
    let run = 0;
    holeList(se).forEach(h => {
      const v = scores["h" + h.n]?.[pid];
      if (typeof v !== "number") { run = 0; return; }
      w.holes++;
      const toPar = v - h.par, net = v - strokesOn(hcp, h.si);
      if (net <= h.par - 1) w.birdiesNet++;
      if (toPar <= 0) { w.parsOrBetter++; run++; w.streak = Math.max(w.streak, run); } else run = 0;
      // Mejor hoyo: el más bajo respecto del par; a igualdad, el más difícil (SI menor).
      if (!w.best || toPar < w.best.toPar || (toPar === w.best.toPar && h.si < w.best.si))
        w.best = { toPar, gross: v, hole: h.n, par: h.par, si: h.si, where: `${course.short} · ${se.label}` };
    });
  });
  w.points = w.pts;
  w.beatenList = [...w.beaten.entries()].map(([id, n]) => ({ name: pl(id).name, n })).sort((a, b) => b.n - a.n);
  // Título del jugador
  w.title = w.holes === 0 ? "Calentando motores"
    : w.birdiesNet >= 6 ? "Máquina de birdies"
    : w.streak >= 5 ? "Metrónomo: no se sale del par"
    : w.gifts >= 30 ? "Recibió más regalos que en Navidad"
    : w.won >= 3 ? "Verdugo del equipo rival"
    : w.matches > 0 && w.won === 0 ? "Corazón valiente"
    : "Soldado de la Ryder";
  return w;
}
