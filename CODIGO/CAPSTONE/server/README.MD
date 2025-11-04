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
