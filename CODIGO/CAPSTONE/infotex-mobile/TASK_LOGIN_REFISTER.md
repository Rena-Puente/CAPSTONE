# Plan Codex: tareas ejecutables para login y registro en infotex-mobile (Ionic)

## 0. Prerrequisitos
- [ ] Confirmar versiones: Node 18+, `npm i -g @ionic/cli`, Angular CLI local (`npx ng version`).
- [ ] Instalar dependencias locales del proyecto: `npm ci` en `infotex-mobile`.
- [ ] Verificar que el backend responde en `https://infotex.cl.ngrok.pizza` (ej. `curl -k https://infotex.cl.ngrok.pizza/health`).

## 1. Configuración de entorno
- [ ] Actualizar `src/environments/environment.ts` y `environment.prod.ts` para incluir `apiUrl: 'https://infotex.cl.ngrok.pizza'`.
- [ ] Exponer una constante `API_AUTH_BASE` si se necesitan prefijos (p. ej. `/api/auth`).
- [ ] Documentar la variable en README (instalación/ejecución móvil).

## 2. Servicio de autenticación (`AuthService`)
- [ ] Crear `src/app/core/services/auth.service.ts` con métodos `login(credentials)` y `register(payload)` usando `HttpClient` contra `apiUrl`.
- [ ] Normalizar respuesta: extraer `accessToken`, `refreshToken`, `userType`, `isProfileComplete` y retornar un modelo fuertemente tipado.
- [ ] Manejar errores HTTP (401/409/422) con mensajes traducibles para UI móvil.

## 3. Persistencia de sesión (`SessionService`)
- [ ] Instalar almacenamiento seguro: `npm i @ionic/storage-angular` o `@capacitor/preferences` (y correr `npx cap sync` si aplica).
- [ ] Implementar `init()`, `setTokens({ accessToken, refreshToken })`, `clear()`, `getAccessToken()` y `isLoggedIn()`.
- [ ] Inyectar `SessionService` en `AuthService` para guardar tokens al autenticar y limpiar al hacer logout.

## 4. Guards de navegación
- [ ] Crear `AuthGuard` que permita acceso a tabs/home solo si `SessionService.isLoggedIn()` es `true`; redirigir a `/login` en caso contrario.
- [ ] Crear `GuestGuard` para bloquear `login`/`register` cuando ya hay sesión y redirigir a `/home`.

## 5. Ruteo inicial
- [ ] Editar `src/app/app.routes.ts` para que la ruta raíz redirija a `/login` usando `GuestGuard` y proteger tabs con `AuthGuard`.
- [ ] Añadir rutas standalone para `/login` y `/register` con lazy loading (`loadComponent` o `loadChildren`).

## 6. Page de Login
- [ ] Generar page Ionic: `ionic generate page pages/auth/login --standalone`.
- [ ] Implementar formulario reactivo con campos `email` (validación de email) y `password` (min. 6 caracteres).
- [ ] Mostrar estados `loading` y errores devueltos por `AuthService`; usar `ion-toast`/`ion-alert` para feedback.
- [ ] Al éxito, navegar según `isProfileComplete`: `/home` o `/profile/setup`.

## 7. Page de Registro
- [ ] Generar page Ionic: `ionic generate page pages/auth/register --standalone`.
- [ ] Formularios reactivos con `email`, `password`, `confirmPassword` (validator de coincidencia) y campos extra de Postulante si aplica.
- [ ] Mostrar errores de backend (correo existente, validación) y estado `loading`; confirmar creación con `ion-toast`.
- [ ] Tras registro, iniciar sesión automáticamente o redirigir a login mostrando mensaje contextual.

## 8. Componentes/estilos
- [ ] Sustituir elementos Bootstrap por `ion-item`, `ion-input`, `ion-label`, `ion-button`; usar `ion-grid` para layout responsive.
- [ ] Ajustar `src/theme/variables.scss` y `global.scss` si se requieren colores/espaciados de marca.

## 9. Pruebas contra API
- [ ] Probar `AuthService` con `ng test` o specs puntuales de servicio simulando 200/401/409.
- [ ] Manual: usar `ionic serve` + devtools para verificar login/registro y persistencia tras recargar.
- [ ] Si se dispone de emulador/dispositivo, correr `ionic cap run android --livereload` (o iOS en macOS) y validar almacenamiento nativo.

## 10. Entregables y checklist final
- [ ] README actualizado con pasos de configuración, comandos de ejecución y rutas iniciales.
- [ ] Capturas o GIF corto mostrando login/registro exitoso y manejo de errores.
- [ ] Código formateado (`npm run lint`/`npm run format` si existen scripts) y commit firmado en el repo.