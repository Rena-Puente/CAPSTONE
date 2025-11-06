# CAPSTONE Server

Este servicio Express se ha modularizado para facilitar su mantenimiento. El punto de entrada `server.js` inicializa la aplicación, prepara la conexión a Oracle y expone la instancia de Express para pruebas.

## Scripts disponibles

- `npm start`: levanta el servidor ejecutando `node server.js`. Este archivo arranca la aplicación modular definida en `src/app.js`, por lo que no necesitas cambiar tu flujo de trabajo habitual.
- `npm test`: ejecuta la batería de pruebas unitarias e integración con el test runner nativo de Node.js.

## Estructura

```
server/
├── server.js              # Punto de entrada que prepara la app y maneja el apagado ordenado
└── src/
    ├── app.js             # Construcción de la instancia de Express
    ├── config/            # Carga y validación de variables de entorno
    ├── db/                # Utilidades para el pool de Oracle
    ├── middleware/        # Middlewares reutilizables
    ├── routes/            # Definición de rutas agrupadas por dominio
    ├── services/          # Lógica de negocio para cada dominio
    └── utils/             # Helpers compartidos
```

## Variables de entorno necesarias

Las variables de entorno exigidas por `src/config/index.js` antes de iniciar el servidor:

- `PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_CONNECT_ALIAS`
- `DB_WALLET_DIR`
- `DB_WALLET_PASSWORD`
- `ACCESS_TOKEN_MINUTES`
- `REFRESH_TOKEN_DAYS`

## Rutas públicas

### `GET /profiles/:slug`

Devuelve la información pública de un perfil identificado por su `slug` (URL personalizada). No requiere autenticación.

- Valida que el slug cumpla con el formato `[a-z0-9-]{3,40}`. Si no lo cumple se responde con `400`.
- Si no existe un perfil con ese slug se responde con `404`.
- Si se detectan duplicados en la base de datos se responde con `409`.
- En caso de éxito (`200`) el cuerpo incluye:
  - `profile`: datos básicos del perfil (nombre para mostrar, titular, biografía, país, ciudad, avatar y slug).
  - `education`, `experience`, `skills`: cada uno con `entries` (listados obtenidos desde los servicios correspondientes) y `summary` con métricas públicas relevantes.

Ejemplo de respuesta exitosa:

```json
{
  "ok": true,
  "profile": {
    "displayName": "Ada Lovelace",
    "career": "Ingeniería de Software",
    "biography": "...",
    "country": "PE",
    "city": "Lima",
    "avatarUrl": "https://...",
    "slug": "ada-lovelace"
  },
  "education": {
    "entries": [/* ... */],
    "summary": {
      "totalRecords": 2,
      "hasEducation": true,
      "invalidDateCount": 0
    }
  },
  "experience": {
    "entries": [/* ... */],
    "summary": {
      "totalRecords": 3,
      "currentCount": 1
    }
  },
  "skills": {
    "entries": [/* ... */],
    "summary": {
      "totalSkills": 6,
      "averageLevel": 4.5,
      "maxLevel": 5,
      "minLevel": 3
    }
  }
}
```

### `GET /profiles/:slug/github/repositories`

Expone los repositorios públicos de GitHub vinculados a un perfil. No requiere autenticación y comparte los mismos criterios de validación de `slug` que la ruta anterior.

- Si el `slug` es inválido responde `400`.
- Si no existe un perfil con ese `slug` responde `404`.
- Si el perfil existe pero no tiene una cuenta de GitHub enlazada responde `204` sin cuerpo.
- En caso de éxito (`200`) devuelve:
  - `repositories`: lista acotada (hasta 50 elementos, por defecto 6) con campos normalizados (`name`, `description`, `htmlUrl`, `topics`, métricas de estrellas, forks, issues, timestamps, etc.).
  - `languages`: resumen agregado de los lenguajes detectados en los repositorios (`totalBytes` y `breakdown` con porcentaje por lenguaje).

Parámetros opcionales de consulta:

- `limit`: número máximo de repositorios a devolver (1-50, valor por defecto 6).
- `sort`: `recent` (último push) o `stars` (mayor número de estrellas).

Las respuestas se cachean en memoria por unos minutos para mitigar los límites de la API pública de GitHub.

## Rutas protegidas

### `GET /profile/:userId/github/repositories`

Versión autenticada para que el dueño del perfil consulte sus repositorios vinculados a GitHub. Requiere token Bearer válido y que el `userId` del token coincida con el parámetro.

- Responde `400` cuando el `userId` es inválido.
- Responde `403` cuando el token no pertenece al usuario solicitado.
- Responde `404` si el perfil no tiene una cuenta de GitHub asociada.
- Devuelve `200` con `{ ok, repositories, languages }` siguiendo el mismo formato que la ruta pública cuando la consulta al API de GitHub es exitosa.
- Ante errores con GitHub (ej. límites de cuota agotados) responde con un código HTTP propagado por el servicio (`502`, `429`, etc.) y un mensaje genérico.

Los resultados se cachean temporalmente para reducir llamadas redundantes y se implementan reintentos exponenciales ante errores transitorios o límites de cuota informados por GitHub.
