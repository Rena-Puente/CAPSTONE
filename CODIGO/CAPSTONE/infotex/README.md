Infotex

Este proyecto fue generado utilizando Angular CLI
 versión 20.2.2.

Servidor de desarrollo

Para iniciar un servidor local de desarrollo, ejecuta:

```bash
ng serve
```

Una vez que el servidor esté en funcionamiento, abre tu navegador y navega a http://localhost:4200/.
La aplicación se recargará automáticamente cada vez que modifiques alguno de los archivos fuente.

## Restablecimiento de contraseña

El flujo completo de recuperación de credenciales en el front-end se compone de dos vistas públicas:

1. **Solicitar restablecimiento** (`/auth/forgot-password`): formulario standalone con validación de correo electrónico. Llama al servicio `AuthService.requestPasswordReset(email)` y muestra un mensaje de confirmación amable, además de un acceso directo para volver a la pantalla de inicio de sesión.
2. **Definir nueva contraseña** (`/auth/reset-password?token=...`): formulario reactivo protegido por `guestGuard` que exige contraseñas de al menos 8 caracteres y coincidencia entre ambos campos. Consume `AuthService.resetPassword(token, password, confirmation)` y bloquea la edición cuando el enlace no es válido.

Tras completar cualquiera de los pasos, la pantalla de bienvenida (`/welcome`) despliega un banner informativo para guiar al usuario sobre el siguiente paso (revisar su correo o iniciar sesión con la nueva clave).

Para probar el flujo manualmente:

```bash
ng serve
# Abrir http://localhost:4200/auth/forgot-password para solicitar el correo
# Abrir el enlace recibido (o simulado) con el token en http://localhost:4200/auth/reset-password?token=<token>
```

Los métodos del servicio gestionan errores de la API y devuelven mensajes amigables que se muestran directamente en la interfaz.

Generación de código (Scaffolding)

Angular CLI incluye potentes herramientas de scaffolding.
Para generar un nuevo componente, ejecuta:

bash
ng generate component nombre-del-componente


Para ver la lista completa de esquemas disponibles (como components, directives o pipes), ejecuta:

bash
ng generate --help

Compilación (Build)

Para compilar el proyecto, ejecuta:

bash
ng build


Esto compilará tu aplicación y almacenará los artefactos resultantes en el directorio dist/.
De forma predeterminada, la compilación en modo producción optimiza la aplicación para mejorar el rendimiento y la velocidad.

Ejecución de pruebas unitarias

Para ejecutar las pruebas unitarias con el ejecutor Karma
, utiliza el siguiente comando:

bash
ng test

Pruebas de extremo a extremo (End-to-End)

Para ejecutar pruebas E2E, usa:

bash
ng e2e


Angular CLI no incluye por defecto un framework de pruebas E2E.
Puedes elegir el que mejor se adapte a tus necesidades (por ejemplo, Cypress, Playwright, etc.).

Recursos adicionales

Para más información sobre el uso de Angular CLI, incluyendo referencias detalladas de comandos, visita la página oficial:
Angular CLI - Guía y Referencia de Comandos
