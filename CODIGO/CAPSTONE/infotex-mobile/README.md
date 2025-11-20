# Infotex Mobile

Guía rápida para preparar y ejecutar la aplicación móvil en Ionic/Angular.

## Prerrequisitos
- Node.js 18 o superior.
- npm 9 o superior (incluido con Node).
- Ionic CLI instalado globalmente (`npm i -g @ionic/cli`). Si el entorno tiene restricciones de red, la instalación puede requerir acceso al registro de npm.

## Instalación de dependencias
Ejecuta en la raíz del proyecto móvil:

```bash
npm ci
```

> Nota: si el entorno bloquea el acceso al registro de npm, los comandos anteriores pueden fallar. Reintenta cuando haya conectividad o usando un registro accesible.

## Configuración de entorno
Los archivos `src/environments/environment.ts` y `src/environments/environment.prod.ts` ya incluyen el endpoint base de la API:

```ts
export const environment = {
  production: false,
  apiUrl: 'https://infotex.cl.ngrok.pizza'
};

export const API_AUTH_BASE = `${environment.apiUrl}/api/auth`;
```

Ajusta `apiUrl` o el prefijo de autenticación según el entorno que utilices.

## Ejecución en desarrollo
Con dependencias instaladas, inicia la aplicación en modo desarrollo:

```bash
ionic serve
```

Si no cuentas con Ionic CLI instalado globalmente, puedes usar `npx ionic serve` tras asegurarte de tener acceso al registro de npm.
