# Code review summary

This document captures the key findings from the repository review.

## Build blockers
- `src/app/pages/profile/profile.ts` is missing `standalone: true` and uses `styleUrl` instead of `styleUrls`, so the Angular compiler rejects the component and prevents `ng serve` from finishing.
- The app imports `localStorageSync` from `ngrx-store-localstorage`, but that package is not listed in `package.json`, so the build fails with “Cannot find module 'ngrx-store-localstorage'”.

## Backend concerns
- `server/server.js` requires Oracle stored procedures (`fn_login`, `sp_emitir_sesion`, etc.) and an Oracle wallet (`server/.env`, `server/db/wallet/*`). Without that infrastructure the API cannot start.
- The login dialog tries to hit `POST /api/auth/register`, but the server only exposes login/refresh/me/logout endpoints. Register attempts will always fail with 404.
- Secrets (`DB_PASSWORD`, wallet password, JWT secrets) are committed in `server/.env`.

## Routing inconsistencies
- `src/main.ts` defines one set of routes, while `src/app/app.routes.ts` (consumed by SSR) defines a different set (no `/welcome`, `home` guarded by `guestGuard`). They should share a single source of truth.

## Repository hygiene
- A second `package.json` and a full `node_modules/` exist under `src/app/`; those should be removed so Angular CLI only installs dependencies at the project root.
- `src/app/app.spec.ts` still asserts the old `<h1>Hello, infotex</h1>` markup and now fails.
