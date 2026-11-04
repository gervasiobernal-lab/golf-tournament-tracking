// premios.js — Premios automáticos de la Ryder, calculados con los golpes cargados.
import { FORMATS, matchState, strokesOn, courseHcp } from "./golf.js";

export const AWARDS = [
  { key: "mvp",     icon: "🏅", name: "MVP",            desc: "Más puntos aportados al equipo (partidos terminados)." },
  { key: "birdie",  icon: "🐦", name: "Rey del Birdie", desc: "Más birdies netos (o mejor), con el 100% del hándicap de cancha." },
  { key: "piedra",  icon: "🪨", name: "Mano de Piedra", desc: "Más dobles bogeys netos o peor, con el 100% del hándicap. Los hoyos levantados también cuentan." },
  { key: "bombero", icon: "🚒", name: "El Bombero",     desc: "En four-ball, más hoyos salvados para su pareja: su neto ganó o empató un hoyo que el compañero solo no sacaba." },
  { key: "papa",    icon: "🎁", name: "Papá Noel",      desc: "Perdió un partido recibiendo más golpes que nadie." }
];

// Calcula los premios para las sesiones indicadas (ids). Devuelve, por premio,
// la lista ordenada [{ p, val, sub }] de mayor a menor.
export function computeAwards(cfg, allScores, sessionIds) {
  const pl = id => cfg.players.find(p => p.id === id);
  const bump = (map, id, n, extra) => {
    const r = map.get(id) || { p: pl(id), val: 0, n: 0 };
    r.val += n; r.n += 1; if (extra) Object.assign(r, extra); map.set(id, r);
  };
  const mvp = new Map(), birdie = new Map(), piedra = new Map(), bombero = new Map(), papa = new Map();

  cfg.matches.filter(m => sessionIds.includes(m.session)).forEach(m => {
    const se = cfg.sessions.find(s => s.id === m.session), f = FORMATS[se.format];
    const scores = allScores[m.id] || {}, st = matchState(cfg, m, scores);

    // 🏅 MVP: el punto del partido principal va a cada jugador del lado; el de cada individual, a su jugador.
    if (st.matchClosed) {
      m.a.forEach(id => bump(mvp, id, st.mainPts[0]));
      m.b.forEach(id => bump(mvp, id, st.mainPts[1]));
    }
    (st.duels || []).forEach(d => { if (d.closed) { bump(mvp, d.a, d.pts[0]); bump(mvp, d.b, d.pts[1]); } });

    // 🐦 / 🪨: neto con el 100% del hándicap de cancha, solo con pelota propia
    // (en foursome, greensome y scramble el score es de la pareja). X = levantó: cuenta como doble o peor.
    if (!f.team) [...m.a, ...m.b].forEach(id => {
      const hcp = courseHcp(pl(id).index, se);
      st.holes.forEach(h => {
        const v = scores["h" + h.n]?.[id];
        if (v === "X") { bump(piedra, id, 1); return; }
        if (typeof v !== "number") return;
        const net = v - strokesOn(hcp, h.si);
        if (net <= h.par - 1) bump(birdie, id, 1);
        if (net >= h.par + 2) bump(piedra, id, 1);
      });
    });

    // 🚒 Bombero: four-ball (con o sin individuales).
    if (!f.team && f.size === 2) {
      const out = (x, rb) => x < rb ? 2 : x === rb ? 1 : 0;   // 2 gana, 1 empata, 0 pierde
      st.holes.forEach((h, i) => {
        if (st.res[i] === null) return;
        const sc = scores["h" + h.n] || {};
        const net = u => sc[u.key] === "X" ? Infinity : sc[u.key] - strokesOn(u.strokes, h.si);
        ["A", "B"].forEach(side => {
          const mine = st.us.filter(u => u.side === side), rivals = st.us.filter(u => u.side !== side);
          if (mine.length !== 2) return;
          const rb = Math.min(...rivals.map(net));
          mine.forEach((u, k) => {
            const partner = mine[1 - k], both = Math.min(net(u), net(partner));
            if (out(both, rb) > out(net(partner), rb)) bump(bombero, u.key, 1);
          });
        });
      });
    }

    // 🎁 Papá Noel: el que perdió recibiendo más golpes (se queda con su peor caso).
    const gift = (id, strokes, text) => {
      if (strokes <= 0) return;
      const r = papa.get(id);
      if (!r || strokes > r.val) papa.set(id, { p: pl(id), val: strokes, sub: text });
    };
    if (st.matchClosed && st.lead) st.us.filter(u => u.side !== st.lead)
      .forEach(u => u.pids.forEach(id => gift(id, u.strokes, `perdió ${st.text} en ${FORMATS[se.format].name.toLowerCase()} (${se.label})`)));
    (st.duels || []).forEach(d => {
      if (!d.closed || !d.lead) return;
      const [loser, s] = d.lead === "A" ? [d.b, d.sb] : [d.a, d.sa];
      gift(loser, s, `perdió ${d.text} el individual contra ${pl(d.lead === "A" ? d.a : d.b).name} (${se.label})`);
    });
  });

  const sorted = map => [...map.values()].filter(r => r.val > 0).sort((a, b) => b.val - a.val || a.p.name.localeCompare(b.p.name));
  const withSub = (rows, fn) => rows.map(r => ({ ...r, sub: r.sub || fn(r) }));
  return {
    mvp:     withSub(sorted(mvp), r => `${r.n} partido${r.n > 1 ? "s" : ""}`),
    birdie:  withSub(sorted(birdie), () => ""),
    piedra:  withSub(sorted(piedra), () => ""),
    bombero: withSub(sorted(bombero), () => ""),
    papa:    sorted(papa)
  };
}
