# CAPSTONE Server

Este servicio Express se ha modularizado para facilitar su mantenimiento. El punto de entrada `server.js` inicializa la aplicación, prepara la conexión a Oracle y expone la instancia de Express para pruebas.

## Scripts disponibles

- `npm start`: levanta el servidor ejecutando `node server.js`. Este archivo arranca la aplicación modular definida en `src/app.js`, por lo que no necesitas cambiar tu flujo de trabajo habitual.

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