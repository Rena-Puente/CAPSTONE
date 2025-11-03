CREATE OR REPLACE FUNCTION fn_get_usuario_oauth(
  p_proveedor   IN VARCHAR2,
  p_provider_id IN VARCHAR2
) RETURN NUMBER AS
  v_id_usuario usuarios.id_usuario%TYPE;
  v_proveedor  VARCHAR2(100);
BEGIN
  IF p_proveedor IS NULL OR p_provider_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_proveedor := UPPER(TRIM(p_proveedor));

  BEGIN
    SELECT id_usuario
      INTO v_id_usuario
      FROM oauth
     WHERE proveedor = v_proveedor
       AND provider_id = p_provider_id
       AND ROWNUM = 1;

    RETURN v_id_usuario;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN NULL;
  END;
END fn_get_usuario_oauth;
/

CREATE OR REPLACE PROCEDURE sp_registrar_usuario_oauth(
  p_proveedor    IN  VARCHAR2,
  p_provider_id  IN  VARCHAR2,
  p_correo       IN  VARCHAR2,
  p_nombre       IN  VARCHAR2,
  p_avatar       IN  VARCHAR2,
  p_id_usuario   OUT NUMBER
) AS
  v_id_usuario usuarios.id_usuario%TYPE;
  v_proveedor  VARCHAR2(100);
BEGIN
  v_proveedor := UPPER(TRIM(p_proveedor));

  v_id_usuario := fn_get_usuario_oauth(v_proveedor, p_provider_id);

  IF v_id_usuario IS NOT NULL THEN
    p_id_usuario := v_id_usuario;
    RETURN;
  END IF;

  BEGIN
    SELECT id_usuario
      INTO v_id_usuario
      FROM usuarios
     WHERE LOWER(correo) = LOWER(p_correo)
       AND ROWNUM = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      SELECT NVL(MAX(id_usuario), 0) + 1 INTO v_id_usuario FROM usuarios;

      INSERT INTO usuarios (id_usuario, correo, contrasena_hash, activo)
      VALUES (
        v_id_usuario,
        p_correo,
        fn_hash_pw('oauth-placeholder'),
        1
      );
  END;

  p_id_usuario := v_id_usuario;

  MERGE INTO perfiles pf
  USING (SELECT v_id_usuario AS id_usuario FROM dual) src
  ON (pf.id_usuario = src.id_usuario)
  WHEN MATCHED THEN
    UPDATE SET
      pf.nombre_mostrar = COALESCE(p_nombre, pf.nombre_mostrar),
      pf.url_avatar     = COALESCE(p_avatar, pf.url_avatar)
  WHEN NOT MATCHED THEN
    INSERT (
      id_usuario,
      nombre_mostrar,
      url_avatar
    ) VALUES (
      v_id_usuario,
      p_nombre,
      p_avatar
    );
END sp_registrar_usuario_oauth;
/

CREATE OR REPLACE PROCEDURE sp_guardar_token_oauth(
  p_id_usuario    IN NUMBER,
  p_proveedor     IN VARCHAR2,
  p_provider_id   IN VARCHAR2,
  p_access_token  IN VARCHAR2,
  p_refresh_token IN VARCHAR2,
  p_scope         IN VARCHAR2,
  p_expira        IN DATE
) AS
  v_proveedor VARCHAR2(100);
BEGIN
  v_proveedor := UPPER(TRIM(p_proveedor));

  MERGE INTO oauth o
  USING (
    SELECT p_id_usuario    AS id_usuario,
           v_proveedor     AS proveedor,
           p_provider_id   AS provider_id
      FROM dual
  ) src
  ON (
    o.id_usuario = src.id_usuario
    AND o.proveedor = src.proveedor
    AND o.provider_id = src.provider_id
  )
  WHEN MATCHED THEN
    UPDATE SET
      o.access_token  = p_access_token,
      o.refresh_token = p_refresh_token,
      o.scope         = p_scope,
      o.expira        = p_expira
  WHEN NOT MATCHED THEN
    INSERT (
      id_usuario,
      proveedor,
      provider_id,
      access_token,
      refresh_token,
      scope,
      expira
    ) VALUES (
      p_id_usuario,
      v_proveedor,
      p_provider_id,
      p_access_token,
      p_refresh_token,
      p_scope,
      p_expira
    );
END sp_guardar_token_oauth;
/
