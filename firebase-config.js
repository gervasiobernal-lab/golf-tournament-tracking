// firebase-config.js
// Paso 4 de la guía: reemplazá este bloque por el que te da Firebase
// al registrar la app web (Configuración del proyecto > Tus apps).
// Estos datos NO son secretos: identifican tu proyecto. La seguridad
// la dan las reglas de Firestore (firestore.rules).

export const firebaseConfig = {
  apiKey: "AIzaSyA2iaMmuFWQ3KUpYOiFt1vWfDOwVoP3oPw",
  authDomain: "golf-tournament-tracking.firebaseapp.com",
  projectId: "golf-tournament-tracking",
  storageBucket: "golf-tournament-tracking.firebasestorage.app",
  messagingSenderId: "60669303475",
  appId: "1:60669303475:web:6570884fe212a28a08eec6"
};

// El mail con el que vas a entrar como administrador (paso 6 de la guía).
// Tiene que ser el mismo que pongas en firestore.rules.
export const ADMIN_EMAIL = "gervasiobernal@gmail.com";
