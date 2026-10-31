// clasif.js — Lógica pura de la clasificación "Campeonato Dormitorios".
// Cuenta la mejor tarjeta neta de cada jugador entre todas las fechas.
// Desempate: segunda mejor tarjeta, después la tercera. Si sigue igual,
// queda el orden de sorteo que cargue el admin (si lo cargó).

export function cardsOf(p, fechas) {
  return fechas
    .map(f => p.cards?.[f.id])
    .filter(v => typeof v === "number")
    .sort((a, b) => a - b);
}

// Compara dos jugadores. Negativo = a va antes que b. 0 = empate real.
export function compare(a, b, fechas) {
  const ca = cardsOf(a, fechas), cb = cardsOf(b, fechas);
  for (let i = 0; i < fechas.length; i++) {
    const x = ca[i] ?? Infinity, y = cb[i] ?? Infinity;
    if (x !== y) return x - y;
  }
  return 0;
}

// Devuelve el ranking con posición, mejor tarjeta y marca de empate.
export function ranking(players, fechas) {
  const withSorteo = (a, b) => {
    const c = compare(a, b, fechas);
    if (c !== 0) return c;
    const sa = a.sorteo ?? Infinity, sb = b.sorteo ?? Infinity;
    return sa !== sb ? sa - sb : a.name.localeCompare(b.name);
  };
  const sorted = [...players].sort(withSorteo);
  const leader = sorted.length ? cardsOf(sorted[0], fechas)[0] : undefined;
  return sorted.map((p, i) => {
    const cards = cardsOf(p, fechas);
    // Empate "real": igual en todas las tarjetas que cuentan.
    const tiedWith = sorted.filter(q => q !== p && compare(p, q, fechas) === 0);
    const resolved = tiedWith.length > 0 && tiedWith.every(q => p.sorteo != null && q.sorteo != null);
    return {
      ...p, pos: i + 1, sortedCards: cards, best: cards[0],
      behind: cards.length && leader !== undefined ? cards[0] - leader : null,
      tie: tiedWith.length > 0 && cards.length > 0 && !resolved,
      tieResolved: resolved
    };
  });
}

// Datos iniciales: los 12 jugadores y la fecha del 19/09 ya jugada.
export function seedClasif() {
  const r = [
    ["Ramiro", 69], ["Esteban", 73], ["Danilo", 75], ["Álvaro Luna", 76],
    ["Fede Bruno", 79], ["Diego Luna", 79], ["Diego Lorenzo", 79], ["Ale Vercelli", 79],
    ["Álvaro Pezzutti", 82], ["Facu Prono", null], ["Gerva", null], ["Rata", null]
  ];
  return {
    title: "Campeonato Dormitorios",
    sede: "Club de Campo Mendoza",
    fechas: [
      { id: "f1", label: "19/09" },
      { id: "f2", label: "31/10" },
      { id: "f3", label: "14/11" }
    ],
    players: r.map(([name, s], i) => ({ id: "c" + i, name, cards: s == null ? {} : { f1: s } }))
  };
}

// ---------- Carga hoyo por hoyo ----------
// Tarjeta del Club de Campo Mendoza (fuente: golfingrecord.com, a confirmar
// con la tarjeta del club; el admin la puede corregir en la página).
export const DEFAULT_HOLES = [
  [4,11],[4,3],[5,9],[3,17],[4,15],[4,5],[5,7],[3,13],[4,1],
  [4,16],[3,14],[4,2],[5,8],[4,12],[4,4],[3,18],[4,10],[5,6]
].map(([par, si]) => ({ par, si }));

// Golpes que recibe en un hoyo un jugador de hándicap `h` (negativo = plus: devuelve).
export function strokesOn(h, si) {
  if (h >= 0) return Math.floor(h / 18) + (si <= h % 18 ? 1 : 0);
  const g = -h;
  return -(Math.floor(g / 18) + (si > 18 - (g % 18) ? 1 : 0));
}

// Resumen de una tarjeta en vivo: { thru, gross, netToPar, net18 }.
// card = { h1: 5, h2: 4, ... }; hcp puede faltar (entonces no hay neto).
export function liveSummary(card, hcp, holes) {
  let thru = 0, gross = 0, net = 0;
  holes.forEach((h, i) => {
    const v = card?.["h" + (i + 1)];
    if (typeof v !== "number") return;
    thru++; gross += v;
    net += v - h.par - (typeof hcp === "number" ? strokesOn(hcp, h.si) : 0);
  });
  const hasHcp = typeof hcp === "number";
  return {
    thru, gross,
    netToPar: hasHcp ? net : null,
    grossToPar: holes.reduce((a, h, i) => typeof card?.["h" + (i + 1)] === "number" ? a + card["h" + (i + 1)] - h.par : a, 0),
    net18: thru === 18 && hasHcp ? gross - hcp : null
  };
}

// ---------- Index → hándicap de cancha ----------
// Tee azul caballeros, Club de Campo Mendoza (cartel del club): rating 71,6 · slope 128 · par 72.
export const DEFAULT_COURSE = { cr: 71.6, slope: 128 };
// Hándicap de cancha (WHS) = Index × Slope / 113 + (Rating − Par), redondeado.
// Index plus se guarda negativo (+1,5 → -1.5) y devuelve hándicap negativo (plus).
export function courseHcp(index, course, par) {
  const v = Math.round(index * course.slope / 113 + (course.cr - par));
  return v === 0 ? 0 : v; // evita "-0"
}
// "11,7" → 11.7 · "+1,5" → -1.5 (plus) · vacío → null
export function parseIndex(txt) {
  const s = String(txt).trim().replace(",", ".");
  if (s === "") return null;
  const n = parseFloat(s.replace(/^\+/, ""));
  if (isNaN(n) || n < 0 || n > 54) return undefined;
  return s.startsWith("+") ? -n : n;
}
export const fmtIndex = n => n == null ? "" : (n < 0 ? "+" + String(-n) : String(n)).replace(".", ",");
export const fmtHcp = n => n == null ? "?" : n < 0 ? "+" + -n : String(n);
// Para comparar nombres de una lista pegada ("alvaro luna" = "Álvaro Luna", "gervasio" = "Gerva").
export const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
