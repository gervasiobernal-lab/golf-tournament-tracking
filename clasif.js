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
