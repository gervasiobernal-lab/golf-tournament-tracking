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

// ---------- Ryder Wrapped ----------
const SCORE_NAMES = { "-3": "Albatros", "-2": "Eagle", "-1": "Birdie", "0": "Par", "1": "Bogey", "2": "Doble bogey", "3": "Triple bogey", "4": "Cuádruple bogey" };
export const scoreName = d => SCORE_NAMES[String(d)] || (d > 0 ? `+${d}` : String(d));

// Todos los hoyos jugados por un jugador con pelota propia (para el Wrapped).
// X (levantó) se toma como doble bogey neto, como en el WHS.
function holesOf(cfg, allScores, pid) {
  const me = cfg.players.find(p => p.id === pid), out = [];
  cfg.matches.forEach(m => {
    if (!m.a.includes(pid) && !m.b.includes(pid)) return;
    const se = cfg.sessions.find(s => s.id === m.session);
    if (FORMATS[se.format].team) return;
    const hcp = courseHcp(me.index, se), sc = allScores[m.id] || {};
    holeList(se).forEach(h => {
      const v = sc["h" + h.n]?.[pid];
      if (v === undefined) return;
      const k = strokesOn(hcp, h.si), x = v === "X";
      const net = x ? h.par + 2 : v - k;
      out.push({ sid: se.id, se, n: h.n, par: h.par, si: h.si, x, gross: x ? null : v,
        grossAdj: x ? h.par + 2 + k : v, net, netToPar: net - h.par, hcp });
    });
  });
  return out;
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const fmt1 = n => (Math.round(n * 10) / 10).toString().replace(".", ",");
const sgn = n => n === 0 ? "E" : (n > 0 ? "+" : "") + fmt1(n);

export function wrapped(cfg, allScores, pid) {
  const pl = id => cfg.players.find(p => p.id === id);
  const me = pl(pid);
  const w = { p: me, pts: 0, won: 0, halved: 0, lost: 0, beaten: new Map(), gifts: 0, giftsDetail: [],
    holes: 0, best: null, streak: 0, birdiesNet: 0, parsOrBetter: 0, matches: 0 };
  const partners = new Map(), nemesis = new Map(), upa = new Map(), carried = new Map();
  const result = (mineLead, closed, oppIds, val) => {
    if (!closed) return;
    w.matches++;
    if (mineLead === true) { w.won++; w.pts += val; oppIds.forEach(o => w.beaten.set(o, (w.beaten.get(o) || 0) + 1)); }
    else if (mineLead === null) { w.halved++; w.pts += val / 2; oppIds.forEach(o => nemesis.set(o, (nemesis.get(o) || 0) + val / 2)); }
    else { w.lost++; oppIds.forEach(o => nemesis.set(o, (nemesis.get(o) || 0) + val)); }
  };
  cfg.matches.forEach(m => {
    const side = m.a.includes(pid) ? "A" : m.b.includes(pid) ? "B" : null;
    if (!side) return;
    const se = cfg.sessions.find(s => s.id === m.session), f = FORMATS[se.format];
    const scores = allScores[m.id] || {}, st = matchState(cfg, m, scores);
    const mine = side === "A" ? m.a : m.b, opp = side === "A" ? m.b : m.a;
    result(st.lead === null ? null : st.lead === side, st.matchClosed, opp, 1);
    // Socio: puntos del partido principal sumados en pareja
    const mate = mine.find(id => id !== pid);
    if (mate && st.matchClosed) {
      const r = partners.get(mate) || { pts: 0, n: 0 };
      r.pts += st.mainPts[side === "A" ? 0 : 1]; r.n++; partners.set(mate, r);
    }
    const u = st.us.find(x => x.pids.includes(pid));
    if (u && u.strokes > 0) { w.gifts += u.strokes; w.giftsDetail.push({ n: u.strokes, what: `${f.name} ${se.label}` }); }
    (st.duels || []).forEach(d => {
      if (d.a !== pid && d.b !== pid) return;
      const mineIsA = d.a === pid, oppId = mineIsA ? d.b : d.a;
      result(d.lead === null ? null : (d.lead === "A") === mineIsA, d.closed, [oppId], d.val);
      const got = mineIsA ? d.sa : d.sb;
      if (got > 0) { w.gifts += got; w.giftsDetail.push({ n: got, what: `individual vs ${pl(oppId).name}` }); }
    });
    // 🎒 Upa: en four-ball, hoyos en que contó solo el neto del compañero (o solo el tuyo)
    if (!f.team && f.size === 2 && mate) {
      const um = st.us.find(x => x.key === pid), up = st.us.find(x => x.key === mate);
      st.holes.forEach((h, i) => {
        if (st.res[i] === null) return;
        const sc = scores["h" + h.n] || {};
        const net = x => sc[x.key] === "X" ? Infinity : sc[x.key] - strokesOn(x.strokes, h.si);
        const a = net(um), b = net(up);
        if (b < a) upa.set(mate, (upa.get(mate) || 0) + 1);
        if (a < b) carried.set(mate, (carried.get(mate) || 0) + 1);
      });
    }
  });

  // Hoyos propios: mejor hoyo, racha, birdies netos (como antes)
  const H = holesOf(cfg, allScores, pid);
  let run = 0, lastKey = null;
  H.forEach(h => {
    const key = h.sid;
    if (key !== lastKey) { run = 0; lastKey = key; }
    if (h.x) { run = 0; return; }
    w.holes++;
    const toPar = h.gross - h.par;
    if (h.net <= h.par - 1) w.birdiesNet++;
    if (toPar <= 0) { w.parsOrBetter++; run++; w.streak = Math.max(w.streak, run); } else run = 0;
    if (!w.best || toPar < w.best.toPar || (toPar === w.best.toPar && h.si < w.best.si))
      w.best = { toPar, gross: h.gross, hole: h.n, par: h.par, si: h.si, where: `${COURSES[h.se.course].short} · ${h.se.label}` };
  });
  w.points = w.pts;
  w.beatenList = [...w.beaten.entries()].map(([id, n]) => ({ name: pl(id).name, n })).sort((a, b) => b.n - a.n);

  // ---------- Revelaciones ----------
  const ins = [], add = (w8, icon, text, title) => ins.push({ w: w8, icon, text, title });

  // 🕵️ Hándicap real: golpes sobre el par por vuelta (18 hoyos), contra el hándicap de cancha.
  if (H.length >= 9) {
    const over = avg(H.map(h => h.grossAdj - h.par)) * 18, off = avg(H.map(h => h.hcp));
    const realH = Math.round(over), diff = realH - Math.round(off);
    if (diff <= -4) add(60 - diff * 4, "🕵️", `Jugaste como un ${realH} con hándicap ${Math.round(off)}… 🚨 Alerta Bandido.`, "El Bandido 🚨");
    else if (diff >= 4) add(32 + diff * 3, "🎈", `Jugaste como un ${realH} y tenés ${Math.round(off)}: el index está inflado de optimismo.`, "Index optimista");
    else add(18, "🎯", `Jugaste como un ${realH} con hándicap ${Math.round(off)}: confiable como un reloj suizo.`, "Reloj suizo");
  }
  // 🎒 Te llevaron a upa / llevaste a upa
  const top = m => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  // Por compañero, se muestra lo que pesa más: te cargó él, lo cargaste vos, o mitad y mitad.
  const hs = n => `${n} hoyo${n === 1 ? "" : "s"}`;
  [...new Set([...upa.keys(), ...carried.keys()])].forEach(mate => {
    const u = upa.get(mate) || 0, c = carried.get(mate) || 0, name = pl(mate).name;
    if (u >= 3 && u > c) add(30 + (u - c) * 4, "🎒", `${name} te llevó a upa en ${hs(u)} (vos a él, ${c}). Invitale el asado.`, "La Mochila 🎒");
    else if (c >= 3 && c > u) add(30 + (c - u) * 4, "💪", `Llevaste a ${name} en la espalda ${hs(c)} (él a vos, ${u}).`, "El Bombero 🚒");
    else if (u >= 3 && u === c) add(22, "⚖️", `Sociedad 50/50 con ${name}: cada uno cargó al otro ${hs(u)}.`);
  });
  // 💀 El hoyo que no vamos a nombrar
  const worst = H.filter(h => !h.x).sort((a, b) => (b.gross - b.par) - (a.gross - a.par) || a.si - b.si)[0];
  if (worst && worst.gross - worst.par >= 2)
    add(20 + (worst.gross - worst.par) * 8, "💀", `${scoreName(worst.gross - worst.par)} en el ${worst.n} de ${COURSES[worst.se.course].short} (${worst.gross} golpes). Lo que pasa en Chile queda en Chile.`);
  // 🎢 Ida contra vuelta
  const front = H.filter(h => h.n <= 9), back = H.filter(h => h.n > 9);
  if (front.length >= 5 && back.length >= 5) {
    const fN = front.reduce((a, h) => a + h.netToPar, 0) * 9 / front.length, bN = back.reduce((a, h) => a + h.netToPar, 0) * 9 / back.length;
    const F9 = sgn(Math.round(fN)), B9 = sgn(Math.round(bN));
    if (bN - fN >= 3) add(25 + (bN - fN) * 4, "⛽", fN <= 1
      ? `${F9} neto en la ida, ${B9} en la vuelta: arrancás como Tiger y terminás como el tío.`
      : `${F9} neto en la ida y ${B9} en la vuelta: mal arranque, peor final. La vuelta se te hace larga.`, "Sin gasolina ⛽");
    else if (fN - bN >= 3) add(25 + (fN - bN) * 4, "🚂", bN <= 1
      ? `${F9} en la ida, ${B9} en la vuelta: motor diésel, arrancás frío y terminás volando.`
      : `${F9} en la ida, ${B9} en la vuelta: arrancás frío y en la vuelta, por lo menos, entrás en calor.`, "Motor Diésel 🚂");
  }
  // 🤝 Socio ideal y 😈 verdugo
  const bestMate = [...partners.entries()].sort((a, b) => b[1].pts - a[1].pts || b[1].n - a[1].n)[0];
  if (bestMate && bestMate[1].pts > 0) add(22, "🤝", `Socio ideal: con ${pl(bestMate[0]).name} sumaron ${fmt1(bestMate[1].pts)} punto${bestMate[1].pts === 1 ? "" : "s"}.`);
  const nem = top(nemesis);
  if (nem && nem[1] >= 1) add(24 + nem[1] * 5, "😈", `Tu verdugo: ${pl(nem[0]).name} te sacó ${fmt1(nem[1])} punto${nem[1] === 1 ? "" : "s"}. Pedí revancha.`);
  // ⛳ Especialista por tipo de hoyo (neto respecto del par)
  const byPar = [3, 4, 5].map(par => ({ par, a: avg(H.filter(h => h.par === par).map(h => h.netToPar)), n: H.filter(h => h.par === par).length }))
    .filter(x => x.n >= 2);
  if (byPar.length >= 2) {
    const s2 = [...byPar].sort((a, b) => a.a - b.a), bp = s2[0], wp = s2[s2.length - 1];
    if (wp.a - bp.a >= 0.5) add(28, "⛳", `Rey de los par ${bp.par} (${sgn(bp.a)} neto por hoyo)… y los par ${wp.par} te comen vivo (${sgn(wp.a)}).`, `Rey de los par ${bp.par}`);
    // 📊 Comparación con el grupo en tu mejor tipo de hoyo
    const others = cfg.players.filter(p => p.id !== pid).map(p => avg(holesOf(cfg, allScores, p.id).filter(h => h.par === bp.par).map(h => h.netToPar))).filter(v => v !== null);
    if (others.length >= 3) {
      const pct = Math.round(100 * others.filter(v => v > bp.a).length / others.length);
      if (pct >= 60) add(18 + pct / 10, "📊", `En los par ${bp.par} jugaste mejor que el ${pct}% del grupo.`);
    }
  }
  // 🃏 Rey del X
  const xs = H.filter(h => h.x).length;
  if (xs >= 2) add(20 + xs * 6, "🃏", `Levantaste la pelota ${xs} veces: récord de eficiencia energética.`, "El Rey del X 🃏");
  // 🔥 Cierre: hoyos 16 a 18 contra el resto
  const close = H.filter(h => h.n >= 16), rest = H.filter(h => h.n < 16);
  if (close.length >= 3 && rest.length >= 6) {
    const d = avg(close.map(h => h.netToPar)) - avg(rest.map(h => h.netToPar));
    if (d <= -0.6) add(26, "🧊", `En el 16, 17 y 18 jugás ${fmt1(-d)} golpes mejor por hoyo: sangre fría.`, "Sangre fría 🧊");
    else if (d >= 0.8) add(26, "🫣", `En el 16, 17 y 18 se te van ${fmt1(d)} golpes de más por hoyo: te tiemblan las piernas en el 18.`);
  }
  // 🏌️ Long drive y closest ganados
  cfg.sessions.forEach(se => [["ld", "Long drive"], ["ctp", "Closest"]].forEach(([t, name]) => (se[t] || []).forEach(n => {
    const b = challengeBoard(cfg, allScores, se.id, t, n)[0];
    if (b && b.p.id === pid) add(45, t === "ld" ? "🏌️" : "🎯", `Ganaste el ${name} del hoyo ${n} (${se.label})${b.d !== null ? ` a ${fmt1(b.d)} yd de la bandera` : ""}.`, t === "ld" ? "Cañón 💥" : "Francotirador 🎯");
  })));
  // 🎢 Montaña rusa
  const doubles = H.filter(h => h.netToPar >= 2).length;
  if (w.birdiesNet >= 2 && doubles >= 2) add(30, "🎢", `${w.birdiesNet} birdies netos y ${doubles} dobles o peor: tarjeta para cardiólogos.`, "Montaña rusa 🎢");

  ins.sort((a, b) => b.w - a.w);
  w.insights = ins.slice(0, 4);
  // Título: el de la revelación más fuerte que tenga uno; si no, los de siempre.
  const titled = ins.find(i => i.title);
  w.title = w.holes === 0 && !titled ? "Calentando motores"
    : titled ? titled.title
    : w.birdiesNet >= 6 ? "Máquina de birdies"
    : w.streak >= 5 ? "Metrónomo"
    : w.gifts >= 30 ? "Recibió más regalos que en Navidad"
    : w.matches > 0 && w.won === 0 ? "Corazón valiente"
    : "Soldado de la Ryder";
  return w;
}
