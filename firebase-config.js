// firebase-config.js
// Paso 4 de la guía: reemplazá este bloque por el que te da Firebase
// al registrar la app web (Configuración del proyecto > Tus apps).
// Estos datos NO son secretos: identifican tu proyecto. La seguridad
// la dan las reglas de Firestore (firestore.rules).

export const firebaseConfig = {
  apiKey: "PEGAR_AQUI",
  authDomain: "PEGAR_AQUI",
  projectId: "PEGAR_AQUI",
  storageBucket: "PEGAR_AQUI",
  messagingSenderId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI"
};

// El mail con el que vas a entrar como administrador (paso 6 de la guía).
// Tiene que ser el mismo que pongas en firestore.rules.
export const ADMIN_EMAIL = "PEGAR_TU_EMAIL";
