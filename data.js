// data.js — Acceso a datos.
// Con Firebase configurado usa Firestore (tiempo real + offline).
// Sin configurar, funciona en "modo demo": guarda solo en este celular.

import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
export const isConfigured = !String(firebaseConfig.apiKey).startsWith("PEGAR");

let fs, auth, db, F, A;           // módulos y referencias de Firebase
let listeners = {};
let status = { online: navigator.onLine, pending: 0, user: null, admin: false, error: null };

function emitStatus(patch) {
  status = { ...status, ...patch };
  // Se envía solo lo que cambió (o todo, la primera vez).
  listeners.onStatus?.(Object.keys(patch).length ? patch : status);
}
window.addEventListener("online",  () => emitStatus({ online: true }));
window.addEventListener("offline", () => emitStatus({ online: false }));

// ---------- Arranque ----------
export async function start(l) {
  listeners = l;
  emitStatus({});
  if (!isConfigured) return startDemo();

  const appMod = await import(`${SDK}/firebase-app.js`);
  F = await import(`${SDK}/firebase-firestore.js`);
  A = await import(`${SDK}/firebase-auth.js`);

  const app = appMod.initializeApp(firebaseConfig);
  // Cache persistente: los datos y las cargas quedan en el celular
  // y se sincronizan solos cuando vuelve la señal.
  db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
  });
  auth = A.getAuth(app);

  A.onAuthStateChanged(auth, user => {
    if (!user) {
      // Todos entran como "anónimos": no hace falta cuenta para usar la app.
      A.signInAnonymously(auth).catch(e => emitStatus({ error: "No se pudo iniciar sesión: " + e.code }));
      return;
    }
    emitStatus({ user, admin: !user.isAnonymous && user.email === ADMIN_EMAIL });
  });

  F.onSnapshot(F.doc(db, "torneo", "config"), snap => {
    listeners.onConfig?.(snap.exists() ? snap.data() : null);
  }, e => emitStatus({ error: "Error leyendo la configuración: " + e.code }));

  F.onSnapshot(F.collection(db, "scores"), { includeMetadataChanges: true }, snap => {
    const all = {};
    let pending = 0;
    snap.forEach(d => { all[d.id] = d.data(); if (d.metadata.hasPendingWrites) pending++; });
    emitStatus({ pending });
    listeners.onScores?.(all);
  }, e => emitStatus({ error: "Error leyendo resultados: " + e.code }));
}

// ---------- Escrituras ----------
export function setScore(matchId, hole, key, value) {
  if (!isConfigured) return demoSetScore(matchId, hole, key, value);
  const v = value === null ? F.deleteField() : value;
  // merge:true actualiza solo ese hoyo de ese jugador, sin pisar el resto.
  // No esperamos la respuesta: sin señal queda pendiente y se envía después.
  F.setDoc(F.doc(db, "scores", matchId), { ["h" + hole]: { [key]: v } }, { merge: true })
    .catch(e => emitStatus({ error: "No se guardó el golpe: " + e.code }));
}

export function clearMatch(matchId) {
  if (!isConfigured) return demoClear(matchId);
  F.setDoc(F.doc(db, "scores", matchId), {})
    .catch(e => emitStatus({ error: "No se pudo borrar: " + e.code }));
}

export async function saveConfig(cfg) {
  if (!isConfigured) return demoSaveConfig(cfg);
  await F.setDoc(F.doc(db, "torneo", "config"), JSON.parse(JSON.stringify(cfg)));
}

export async function adminLogin(email, pass) {
  if (!isConfigured) { emitStatus({ admin: true }); return; }
  await A.signInWithEmailAndPassword(auth, email, pass);
}
export async function adminLogout() {
  if (!isConfigured) { emitStatus({ admin: false }); return; }
  await A.signOut(auth); // vuelve a entrar como anónimo automáticamente
}

// ---------- Modo demo (sin Firebase) ----------
const DK = "ryder-demo";
let demo = { config: null, scores: {} };
function demoLoad() { try { demo = JSON.parse(localStorage.getItem(DK)) || demo; } catch (e) {} }
function demoSave() {
  try { localStorage.setItem(DK, JSON.stringify(demo)); } catch (e) {}
  listeners.onConfig?.(demo.config);
  listeners.onScores?.(JSON.parse(JSON.stringify(demo.scores)));
}
function startDemo() { demoLoad(); emitStatus({ admin: false }); demoSave(); }
function demoSetScore(m, h, k, v) {
  const s = demo.scores[m] = demo.scores[m] || {};
  const hk = s["h" + h] = s["h" + h] || {};
  if (v === null) delete hk[k]; else hk[k] = v;
  demoSave();
}
function demoClear(m) { delete demo.scores[m]; demoSave(); }
function demoSaveConfig(cfg) { demo.config = JSON.parse(JSON.stringify(cfg)); demoSave(); }
