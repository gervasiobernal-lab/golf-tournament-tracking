# Guía: poner en marcha la app de la Ryder

Esta guía te lleva desde la carpeta con los archivos hasta tener la app funcionando en los celulares. No hace falta instalar nada en la notebook: todo se hace desde el navegador.

---

## Cómo está armada (para entender qué estás haciendo)

La app tiene tres piezas:

1. **Los archivos de la app** (esta carpeta). Son HTML, CSS y JavaScript: el navegador del celular los descarga y los ejecuta. No hay servidor propio: toda la lógica (hándicap, match play, pantallas) corre en el celular.
2. **GitHub** guarda esos archivos y, con su función **GitHub Pages**, los publica gratis como sitio web con una dirección del tipo `https://tuusuario.github.io/ryder/`. Es el "hosting".
3. **Firebase** (de Google) pone lo que un sitio estático no tiene:
   - **Firestore**: una base de datos en la nube. Cada golpe que se carga se guarda ahí y les llega en vivo a los demás celulares. Si no hay señal, Firestore guarda el golpe en el celular y lo envía solo cuando vuelve la conexión.
   - **Authentication**: el login. Los jugadores entran como "anónimos" sin darse cuenta (no hace falta cuenta). Vos entrás con email y contraseña para administrar.

```
 Celular ──descarga la app──▶ GitHub Pages (archivos)
    │
    └──lee y escribe datos──▶ Firebase (Firestore + Authentication)
```

Las dos plataformas son gratis para este uso y no piden tarjeta de crédito.

### Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página que abre el celular. Solo arma el esqueleto y carga lo demás. |
| `styles.css` | Colores, tipografías y diseño. |
| `app.js` | Las pantallas y lo que pasa al tocar cada botón. |
| `golf.js` | La lógica de golf: canchas, hándicap, golpes por hoyo, estado del partido. |
| `data.js` | La conexión con Firebase (leer y guardar). |
| `firebase-config.js` | Los datos de TU proyecto Firebase. **Lo completás en el paso 4.** |
| `firestore.rules` | Las reglas de seguridad de la base. **Se pegan en Firebase en el paso 6.** |
| `sw.js` | El "service worker": guarda la app en el celular para que abra sin señal. |
| `manifest.webmanifest` + `icons/` | Nombre, ícono y colores para "instalar" la app en la pantalla de inicio. |

---

## Paso 1 · Crear el proyecto en Firebase

1. Entrá a **https://console.firebase.google.com** con tu cuenta de Google.
2. Tocá **Crear un proyecto** (o "Comenzar con un proyecto de Firebase").
3. Nombre: `ryder-santo-domingo` (o el que quieras). Firebase le agrega un sufijo para que sea único; no importa.
4. Cuando pregunte por **Google Analytics**, desactivalo. No lo necesitamos.
5. Esperá a que termine y tocá **Continuar**.

> 💡 Un "proyecto" de Firebase es el contenedor de todo: la base, los usuarios y la configuración. Queda en el plan **Spark**, que es el gratuito.

## Paso 2 · Crear la base de datos Firestore

1. En el menú de la izquierda: **Compilación (Build) → Firestore Database → Crear base de datos**.
2. Si te pregunta la edición, elegí **Standard**.
3. **Ubicación**: elegí una de Sudamérica. Si aparece `southamerica-west1` (Santiago), esa; si no, `southamerica-east1` (São Paulo). **No se puede cambiar después.**
4. Modo: **Iniciar en modo de producción**. Arranca cerrada a todo el mundo; en el paso 6 le ponemos nuestras reglas.
5. **Crear**.

> 💡 Firestore guarda "documentos" (como fichas con campos) agrupados en "colecciones". La app usa dos: `torneo` (un documento `config` con jugadores, días y parejas) y `scores` (un documento por partido con los golpes de cada hoyo).

## Paso 3 · Activar el login (Authentication)

1. Menú izquierdo: **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso (Sign-in method)**:
   - Habilitá **Anónimo** → Guardar. Es el que usan los jugadores sin enterarse.
   - Habilitá **Correo electrónico/contraseña** (solo la primera opción) → Guardar. Es para vos.
3. Pestaña **Usuarios (Users) → Agregar usuario**: poné tu email y una contraseña. Ese es el usuario **administrador**.

## Paso 4 · Registrar la app web y completar `firebase-config.js`

1. Arriba a la izquierda, el engranaje ⚙️ → **Configuración del proyecto**.
2. En la pestaña **General**, abajo, sección **Tus apps**: tocá el ícono **`</>`** (Web).
3. Apodo: `ryder-web`. **No** tildes "Firebase Hosting". → **Registrar app**.
4. Te muestra un bloque de código con `const firebaseConfig = { apiKey: "...", ... }`.
5. Abrí `firebase-config.js` de esta carpeta con el **Bloc de notas** (botón derecho → Abrir con → Bloc de notas) y reemplazá cada `PEGAR_AQUI` por el valor correspondiente. Dejá las comillas.
6. En la última línea, reemplazá `PEGAR_TU_EMAIL` por el email que creaste en el paso 3.
7. Guardá el archivo.

Debería quedar parecido a esto (con tus valores):

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "ryder-santo-domingo-1a2b3.firebaseapp.com",
  projectId: "ryder-santo-domingo-1a2b3",
  storageBucket: "ryder-santo-domingo-1a2b3.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123"
};
export const ADMIN_EMAIL = "tu@email.com";
```

> 💡 Estos datos **no son secretos**: solo dicen "esta app habla con este proyecto". Cualquiera que abra la app los puede ver. Lo que protege la base son las reglas del paso siguiente.

## Paso 5 · (Lectura) Qué hacen las reglas

Las reglas de Firestore son el "portero" de la base. Las nuestras dicen:

- La **configuración** (jugadores, parejas, formatos) la lee cualquiera, pero **solo la cambia el admin** (tu email).
- Los **golpes** los lee cualquiera y los escribe cualquiera que haya abierto la app (sesión anónima). Además se limita el tamaño de cada documento.
- Todo lo demás está cerrado.

El **PIN de cada partido** se controla en la app: evita que alguien cargue por error en un partido ajeno. No es una seguridad fuerte (alguien con conocimientos podría saltearlo), pero para un torneo entre amigos alcanza de sobra.

## Paso 6 · Publicar las reglas

1. Abrí `firestore.rules` con el Bloc de notas y reemplazá `PEGAR_TU_EMAIL` por tu email (el mismo del paso 3).
2. En Firebase: **Firestore Database → pestaña Reglas**.
3. Borrá todo lo que hay, pegá el contenido completo de `firestore.rules` y tocá **Publicar**.

## Paso 7 · Crear la cuenta y el repositorio en GitHub

1. Entrá a **https://github.com** y creá una cuenta (**Sign up**) si no tenés.
2. Arriba a la derecha, **+ → New repository**.
3. Repository name: `ryder`. Elegí **Public** (GitHub Pages gratis requiere repositorio público; no hay nada secreto en los archivos).
4. **Create repository**.

> 💡 Un **repositorio** es una carpeta en la nube que guarda tus archivos y el historial de cada cambio. Cada vez que subís cambios se registra un **commit**: una "foto" de los archivos con un comentario.

## Paso 8 · Subir los archivos

1. En la página del repositorio recién creado, tocá el link **uploading an existing file**.
2. Desde el Explorador de Windows, seleccioná **todos los archivos y la carpeta `icons`** de esta carpeta y **arrastralos** a la página. (`GUIA.md` podés subirla también; no molesta.)
3. Abajo, en "Commit changes", escribí algo como `Primera versión` y tocá **Commit changes**.
4. Verificá que en el repositorio se vea la carpeta `icons` con los tres PNG adentro.

## Paso 9 · Publicar con GitHub Pages

1. En el repositorio: **Settings → Pages** (menú de la izquierda).
2. En **Build and deployment → Source**: `Deploy from a branch`.
3. **Branch**: `main` y carpeta `/ (root)` → **Save**.
4. Esperá uno o dos minutos y recargá la página: arriba aparece **"Your site is live at https://TUUSUARIO.github.io/ryder/"**.

## Paso 10 · Autorizar el dominio en Firebase

1. Firebase → **Authentication → Configuración (Settings) → Dominios autorizados**.
2. **Agregar dominio**: `TUUSUARIO.github.io` (sin `https://` y sin `/ryder`).

## Paso 11 · Primer uso

1. Abrí `https://TUUSUARIO.github.io/ryder/` en el celular. Arriba a la derecha tiene que decir **En vivo** (si dice "Modo demo", `firebase-config.js` quedó sin completar).
2. **Configuración → entrá con tu email y contraseña**.
3. **Crear torneo → Guardar**. Esto crea los datos iniciales en Firestore.
4. En **Jugadores**, cargá los nombres, índices y nombres de equipo → **Guardar**.
5. En **Configuración**, armá cada día: formato, nueves, tees, rating, slope y parejas → **Guardar**. Cuando tengas la tarjeta oficial, cargala en "Editar tarjeta" y tildá "confirmados".
6. Cada partido tiene un **PIN** (se ve en Configuración y dentro del partido). Pasáselo solo al anotador de ese partido.

### Instalar en la pantalla de inicio

- **Android (Chrome)**: menú ⋮ → **Instalar app** o **Agregar a la pantalla principal**.
- **iPhone (Safari)**: botón Compartir → **Agregar a inicio**.

Que todos la abran e instalen **antes del viaje, con wifi**: así queda guardada en el celular y funciona aunque en la cancha no haya señal.

## Paso 12 · Prueba en Córdoba

Hacé una vuelta de prueba con 4 personas. A mitad de la vuelta, ponete en **modo avión** y seguí cargando: arriba va a decir "Sin señal · N por enviar". Al sacar el modo avión, los golpes se envían solos y aparecen en los otros celulares.

---

## Cómo cambiar algo más adelante

1. Editás el archivo en la notebook.
2. En GitHub: **Add file → Upload files**, arrastrás el archivo cambiado (reemplaza al anterior) y hacés **Commit changes**.
3. **Importante**: si cambiaste archivos de la app, abrí `sw.js` y subí la versión (`ryder-v1` → `ryder-v2`). Si no, los celulares siguen usando la versión guardada.
4. En un minuto la versión nueva está publicada. Los celulares la toman la segunda vez que abren la app.

## Costos

El plan gratuito de Firebase (Spark) tiene límites diarios de lecturas y escrituras muy por encima de lo que usan 12 personas en un día de golf. Cada golpe cargado es una escritura, y cada celular que tiene la app abierta hace una lectura por cada cambio. Si alguna vez se pasara un límite, Firebase deja de responder hasta el día siguiente: no cobra nada, porque el plan Spark no tiene tarjeta asociada.
