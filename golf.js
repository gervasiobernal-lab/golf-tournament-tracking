// golf.js — Datos de canchas y cálculo de hándicap / match play.
// No depende de Firebase ni del navegador: es lógica pura, fácil de probar.

// Par y stroke index por nueve (fuente: Golfify).
// El stroke index de 18 hoyos y el rating/slope de cada combinación
// se confirman con la tarjeta oficial y se cargan en Configuración.
export const COURSES = {
  rocas: {
    name: "Rocas de Santo Domingo", short: "Rocas",
    nines: {
      roja:   { name: "Roja",   par: [4,4,5,4,4,3,5,3,4], si: [7,5,3,6,1,9,4,8,2] },
      azul:   { name: "Azul",   par: [4,5,4,3,4,5,4,3,4], si: [2,4,9,7,6,3,1,8,5] },
      blanca: { name: "Blanca", par: [4,4,3,5,4,4,4,3,5], si: [2,7,8,5,1,6,3,9,4] }
    }
  },
  brisas: {
    name: "Las Brisas de Santo Domingo", short: "Brisas",
    nines: {
      norte: { name: "Norte", par: [4,4,4,3,5,4,3,5,4], si: [1,2,3,4,5,6,7,8,9] },
      sur:   { name: "Sur",   par: [4,4,4,3,5,4,3,5,4], si: [1,2,3,4,5,6,7,8,9] },
      este:  { name: "Este",  par: [5,3,4,4,5,4,3,4,4], si: [1,2,3,4,5,6,7,8,9] }
    }
  }
};

export const FORMATS = {
  fourball:  { name: "Four-ball", size: 2, team: false, defPct: 90,
    desc: "Mejor bola. Cada uno juega su pelota; cuenta el mejor neto de la pareja. 90% del hándicap, referido al más bajo de los cuatro." },
  foursome:  { name: "Foursome",  size: 2, team: true,
    desc: "Golpe alternado con una sola pelota. 50% de la suma de la pareja; recibe golpes la diferencia." },
  greensome: { name: "Greensome", size: 2, team: true,
    desc: "Salen los dos, eligen la mejor y alternan. 60% del más bajo + 40% del más alto." },
  scramble:  { name: "Scramble",  size: 2, team: true,
    desc: "Tiran los dos siempre y eligen el mejor golpe. 35% del más bajo + 15% del más alto." },
  singles:   { name: "Singles",   size: 1, team: false, defPct: 100,
    desc: "Uno contra uno. 100% de la diferencia de hándicaps." }
};

// Tarjeta de 18 hoyos de una sesión. Si el admin cargó la tarjeta oficial
// (session.holes), se usa esa; si no, se arma con los dos nueves
// (SI impar en la ida y par en la vuelta: provisorio).
export function holeList(se) {
  if (Array.isArray(se.holes) && se.holes.length === 18) {
    return se.holes.map((h, i) => ({ n: i + 1, par: +h.par, si: +h.si }));
  }
  const c = COURSES[se.course], n1 = c.nines[se.nines[0]], n2 = c.nines[se.nines[1]], out = [];
  for (let i = 0; i < 9; i++) out.push({ n: i + 1,  par: n1.par[i], si: n1.si[i] * 2 - 1 });
  for (let i = 0; i < 9; i++) out.push({ n: i + 10, par: n2.par[i], si: n2.si[i] * 2 });
  return out;
}

export const parTotal = se => holeList(se).reduce((a, h) => a + h.par, 0);

// Hándicap de cancha (WHS): Índice × Slope/113 + (Course Rating − Par)
export function courseHcp(index, se) {
  return Math.round(index * se.slope / 113 + (se.cr - parTotal(se)));
}

// "Unidades" que compiten en un partido: jugadores (four-ball, singles)
// o parejas con una sola pelota (foursome, greensome, scramble).
export function units(cfg, m) {
  const se = cfg.sessions.find(x => x.id === m.session), f = FORMATS[se.format];
  const ch = id => courseHcp(cfg.players.find(p => p.id === id).index, se);
  const us = [];
  if (!f.team) {
    const pct = se.pct ?? f.defPct;
    m.a.forEach(id => us.push({ key: id, side: "A", pids: [id], hcp: Math.round(ch(id) * pct / 100) }));
    m.b.forEach(id => us.push({ key: id, side: "B", pids: [id], hcp: Math.round(ch(id) * pct / 100) }));
  } else {
    [["A", m.a], ["B", m.b]].forEach(([side, ids]) => {
      const c = ids.map(ch).sort((x, y) => x - y), lo = c[0], hi = c[1];
      const h = se.format === "foursome" ? (lo + hi) * 0.5
              : se.format === "greensome" ? lo * 0.6 + hi * 0.4
              : lo * 0.35 + hi * 0.15;
      us.push({ key: side, side, pids: ids, hcp: Math.round(h) });
    });
  }
  const min = Math.min(...us.map(u => u.hcp));
  us.forEach(u => u.strokes = u.hcp - min); // juegan referidos al más bajo
  return us;
}

// Golpes que recibe en un hoyo quien recibe `st` golpes en total.
export const strokesOn = (st, si) => Math.floor(st / 18) + (si <= st % 18 ? 1 : 0);

// Resultado de un hoyo: "A", "B", "H" (empate) o null (falta cargar).
// Un valor "X" significa que el jugador levantó la pelota.
export function holeResult(sc, us, hole) {
  if (!sc) return null;
  for (const u of us) if (sc[u.key] === undefined) return null;
  const best = side => {
    const nets = us.filter(u => u.side === side && sc[u.key] !== "X")
                   .map(u => sc[u.key] - strokesOn(u.strokes, hole.si));
    return nets.length ? Math.min(...nets) : Infinity;
  };
  const a = best("A"), b = best("B");
  return a < b ? "A" : b < a ? "B" : "H";
}

// Estado del partido a partir de los resultados hoyo a hoyo, en orden.
export function matchState(cfg, m, scores) {
  const se = cfg.sessions.find(x => x.id === m.session), holes = holeList(se), us = units(cfg, m);
  const res = holes.map(h => holeResult(scores?.["h" + h.n], us, h));
  let diff = 0, played = 0;
  for (const r of res) {
    if (r === null) break;
    played++;
    if (r === "A") diff++;
    if (r === "B") diff--;
    if (Math.abs(diff) > 18 - played) break;
  }
  const left = 18 - played, closed = played === 18 || Math.abs(diff) > left;
  const lead = diff > 0 ? "A" : diff < 0 ? "B" : null;
  let text;
  if (played === 0) text = "Sin empezar";
  else if (closed) text = diff === 0 ? "Empate" : (left > 0 ? `${Math.abs(diff)}&${left}` : `${Math.abs(diff)} UP`);
  else text = diff === 0 ? "AS" : `${Math.abs(diff)} UP`;
  const outcome = diff > 0 ? [1, 0] : diff < 0 ? [0, 1] : [0.5, 0.5];
  return {
    diff, played, closed, text, lead, res, us, holes,
    pts: closed ? outcome : [0, 0],
    proj: played === 0 ? [0, 0] : outcome
  };
}

export function totals(cfg, allScores) {
  let a = 0, b = 0, pa = 0, pb = 0;
  cfg.matches.forEach(m => {
    const st = matchState(cfg, m, allScores[m.id]);
    a += st.pts[0]; b += st.pts[1]; pa += st.proj[0]; pb += st.proj[1];
  });
  return { a, b, pa, pb };
}

// Partidos por defecto de una sesión (parejas 1-6, 2-5, 3-4 o singles 1 a 1).
export function defaultMatches(cfg, se) {
  const A = cfg.players.filter(p => p.team === "A").map(p => p.id);
  const B = cfg.players.filter(p => p.team === "B").map(p => p.id);
  const pin = () => String(Math.floor(1000 + Math.random() * 9000));
  if (FORMATS[se.format].size === 1)
    return A.map((_, i) => ({ id: `${se.id}m${i}`, session: se.id, a: [A[i]], b: [B[i]], pin: pin() }));
  return [[0, 5], [1, 4], [2, 3]].map((pr, i) => ({
    id: `${se.id}m${i}`, session: se.id, a: [A[pr[0]], A[pr[1]]], b: [B[pr[0]], B[pr[1]]], pin: pin()
  }));
}

// Configuración inicial. Los jugadores son de ejemplo: se reemplazan en la app.
export function seedConfig() {
  const names = ["Jugador A1","Jugador A2","Jugador A3","Jugador A4","Jugador A5","Jugador A6",
                 "Jugador B1","Jugador B2","Jugador B3","Jugador B4","Jugador B5","Jugador B6"];
  const idx = [0, 6, 11, 15, 19, 24, 2, 7, 10, 14, 20, 22];
  const cfg = {
    title: "Ryder Santo Domingo",
    teams: { A: { name: "Andes" }, B: { name: "Pacífico" } },
    players: names.map((n, i) => ({ id: "p" + i, name: n, index: idx[i], team: i < 6 ? "A" : "B" })),
    sessions: [
      { id: "s1", label: "Día 1", course: "rocas",  nines: ["roja", "azul"],   tee: "Hombres", cr: 72.0, slope: 130, format: "fourball", pct: 90,  confirmed: false },
      { id: "s2", label: "Día 2", course: "brisas", nines: ["norte", "sur"],   tee: "Azul",    cr: 72.5, slope: 132, format: "foursome",            confirmed: false },
      { id: "s3", label: "Día 3", course: "rocas",  nines: ["azul", "blanca"], tee: "Hombres", cr: 72.0, slope: 130, format: "singles",  pct: 100, confirmed: false }
    ],
    matches: []
  };
  cfg.sessions.forEach(se => cfg.matches.push(...defaultMatches(cfg, se)));
  return cfg;
}

export const half = x => {
  const i = Math.floor(x), h = x - i >= 0.5;
  return (i === 0 && h ? "" : String(i)) + (h ? "½" : "");
};
