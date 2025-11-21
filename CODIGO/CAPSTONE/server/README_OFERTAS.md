# Reutilización de contratos para ofertas y postulaciones

Este README resume los contratos de datos ya implementados en los procedimientos PL/SQL/SQL
(`sql/`) y en los controladores/servicios Node (`src/`) relacionados con ofertas de empleo.
Úsalo como referencia rápida para consumirlos desde otros frontends sin reescribir lógica.

## Casos de uso cubiertos y alcance web

* **Listado público de ofertas** (`GET /offers`): no requiere sesión; reutilizable por web o
  mobile.
* **Postulación a oferta** (`POST /offers/:offerId/apply`): requiere sesión; acepta carta de
  presentación y respuestas a preguntas; comportamiento común para cualquier cliente.
* **Panel empresa (“mis ofertas” y postulantes)** (`/companies/me/...`): rutas protegidas para
  empresas; flujo pensado para web (gestión de ofertas, encendido/apagado, eliminación y
  revisión de postulantes), pero el contrato puede consumirse desde otros canales.
* **Favoritos**: no hay funcionalidad implementada actualmente; cualquier nuevo desarrollo
  debería añadir un flujo separado.

## Dependencias transversales

* **Autenticación/sesión**: las rutas protegidas usan `requireAccessToken` y recuperan el
  usuario con `getUserIdFromAccessToken`, devolviendo 401 si no hay usuario asociado.
* **Validación de preguntas/respuestas**: `serializeOfferQuestions` y
  `serializeOfferAnswers` limitan a 3 entradas y controlan longitud de texto/respuesta antes
  de invocar PL/SQL.
* **Persistencia Oracle**: los servicios llaman a `sp_empresas_pkg` (ofertas y postulaciones)
  y `sp_listar_postulaciones_usuario` (perfil de usuario). Los códigos de error PL/SQL se
  mapean a respuestas HTTP significativas.

## Contratos principales

### Listado público de ofertas
* **Endpoint**: `GET /offers`.
* **Respuesta**: `{ ok: true, offers: Offer[] }`, donde cada `Offer` incluye
  `id`, `title`, `description`, `locationType`, `city`, `country`, `seniority`,
  `contractType`, `createdAt`, `active`, `totalApplicants` y `questions` (máx. 3 con
  `{ text, required }`). Datos obtenidos desde `sp_listar_ofertas_publicas` vía cursor.

### Postulación a una oferta
* **Endpoint**: `POST /offers/:offerId/apply` (requiere token de acceso).
* **Payload**:
  * `coverLetter` (opcional, string).
  * `answers` o `respuestas` (array de hasta 3 objetos `{ question, answer }`; ambos campos
    obligatorios y con longitudes máximas 500/2000). Se serializa a JSON para
    `sp_postular_oferta`.
* **Respuestas**:
  * `201` → `{ ok: true, message, application: { id, offerId, userId, status, coverLetter,
    submittedAt, answers } }`.
  * Errores traducidos desde PL/SQL: oferta inexistente/inactiva, usuario inválido o
    postulación duplicada.

### Crear oferta (empresa)
* **Endpoint**: `POST /companies/offers` (requiere token y empresa asociada al usuario).
* **Payload requerido** (strings saneados y con máximos definidos): `title`, `description`,
  `locationType`, `city`, `country`, `seniority`, `contractType` + `questions` (0-3 ítems
  `{ text, required }`).
* **Validaciones**:
  * Longitudes máximas y presencia verificadas en `normalizeOfferPayload`.
  * Preguntas serializadas/validadas antes de llamar a `sp_crear_oferta`, que también
    valida JSON y campos obligatorios.
* **Respuesta**: `201` con `{ ok: true, message, offer }` devolviendo los campos anteriores y
  `id` asignado.

### Listar ofertas de la empresa
* **Endpoint**: `GET /companies/me/offers` (token requerido).
* **Respuesta**: `{ ok: true, offers: CompanyOffer[] }`, cada elemento incluye los mismos
  campos que `Offer` más `totalApplicants` y `active` (bandera). Fuente: cursor de
  `sp_listar_ofertas_empresa`.

### Activar/desactivar oferta
* **Endpoint**: `PATCH /companies/me/offers/:offerId/active` (token requerido).
* **Payload**: `active`/`activa`/`enabled`/`estado`/`state` → boolean/0-1.
* **Respuesta**: `{ ok: true, message, offer: { offerId, companyId, active, previousActive } }`.
  Errores PL/SQL mapeados a `OFFER_FORBIDDEN`, `OFFER_NOT_FOUND` o `INVALID_OFFER_STATE`.

### Eliminar oferta
* **Endpoint**: `DELETE /companies/me/offers/:offerId` (token requerido).
* **Comportamiento**: llama a `sp_eliminar_oferta`, que borra postulaciones asociadas y
  valida pertenencia; devuelve 403/404/409 según códigos PL/SQL.
* **Respuesta**: `{ ok: true, message }` en éxito.

### Postulantes de una oferta
* **Endpoint**: `GET /companies/me/offers/:offerId/applicants` (token requerido).
* **Respuesta**: `{ ok: true, applicants }` donde cada elemento incluye
  `applicationId`, `offerId`, `offerTitle`, `applicantId`, `applicantName`, `applicantEmail`,
  `applicantPhone`, `slug` y `questions`/`answers` parseados desde JSON.
* **Notas**: `sp_listar_postulantes_oferta` valida que la oferta exista y pertenezca a la
  empresa antes de devolver el cursor.

### Postulaciones de la empresa y resumen
* **Endpoint**: `GET /companies/me/applicants` (token requerido).
* **Respuesta**: `{ ok: true, applicants, summary }`.
  * `applicants`: cursor de `sp_listar_postulantes` con preguntas/respuestas parseadas.
  * `summary`: métricas desde `sp_resumen_postulaciones_empresa` con totales y fechas.

### Actualizar estado de postulación
* **Endpoint**: `PATCH /companies/me/applicants/:applicationId/status` (token requerido).
* **Payload**: `status`/`estado`/`state`/`nuevoEstado`; se normaliza a uno de
  `enviada`, `en_revision`, `aceptada`, `rechazada`.
* **Respuesta**: `{ ok: true, message, application: { id, status, previousStatus } }`.
  PL/SQL `sp_actualizar_estado_postulacion` valida pertenencia de la empresa y el estado.

### Postulaciones del usuario (perfil)
* **Procedimiento**: `sp_listar_postulaciones_usuario(p_id_usuario, o_postulaciones)` retorna
  las postulaciones con datos de oferta/empresa, estado y fechas. Reutilizable para el
  historial del postulante en cualquier cliente.

## Referencias clave

* **PL/SQL ofertas/postulaciones**: `sql/packages/empresas/sp_empresas_pkg.sql` (crear/listar
  ofertas, postular, actualizar estado, activar/desactivar, eliminar, resumen y listados por
  oferta o empresa).
* **PL/SQL resumen ejecutivo**: `sql/packages/empresas/sp_resumen_ejecutivo.sql` construye un
  JSON con métricas globales de ofertas/postulaciones.
* **PL/SQL historial usuario**: `sql/packages/perfil/sp_listar_postulaciones_usuario.sql`.
* **Controladores**: `src/routes/offers.js` (público) y `src/routes/companies.js` (empresa) ya
  exponen los endpoints anteriores.
* **Servicios**: `src/services/offers.js` y `src/services/companies.js` encapsulan las llamadas
  a PL/SQL y la normalización de datos/errores.
