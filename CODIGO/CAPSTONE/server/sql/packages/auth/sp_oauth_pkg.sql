CREATE OR REPLACE PACKAGE sp_oauth_pkg AS
  FUNCTION fn_get_usuario_oauth(
    p_proveedor   IN VARCHAR2,
    p_provider_id IN VARCHAR2
  ) RETURN NUMBER;

  PROCEDURE sp_registrar_usuario_oauth(
    p_proveedor    IN  VARCHAR2,
    p_provider_id  IN  VARCHAR2,
    p_correo       IN  VARCHAR2,
    p_nombre       IN  VARCHAR2,
    p_avatar       IN  VARCHAR2,
    p_id_usuario   OUT NUMBER
  );

  PROCEDURE sp_guardar_token_oauth(
    p_id_usuario    IN NUMBER,
    p_proveedor     IN VARCHAR2,
    p_provider_id   IN VARCHAR2,
    p_access_token  IN VARCHAR2,
    p_refresh_token IN VARCHAR2,
    p_scope         IN VARCHAR2,
    p_expira        IN DATE
  );
END sp_oauth_pkg;
/

CREATE OR REPLACE PACKAGE BODY sp_oauth_pkg AS
  FUNCTION fn_get_usuario_oauth(
    p_proveedor   IN VARCHAR2,
    p_provider_id IN VARCHAR2
  ) RETURN NUMBER IS
    v_id_usuario admin.usuarios.id_usuario%TYPE;
    v_proveedor  VARCHAR2(100);
  BEGIN
    IF p_proveedor IS NULL OR p_provider_id IS NULL THEN
      RETURN NULL;
    END IF;

    v_proveedor := UPPER(TRIM(p_proveedor));

    BEGIN
      SELECT o.id_usuario
        INTO v_id_usuario
        FROM admin.cuentas_oauth o
       WHERE o.proveedor = v_proveedor
         AND o.id_proveedor_usuario = p_provider_id
         AND ROWNUM = 1;

      RETURN v_id_usuario;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RETURN NULL;
    END;
  END fn_get_usuario_oauth;

  PROCEDURE sp_registrar_usuario_oauth(
    p_proveedor    IN  VARCHAR2,
    p_provider_id  IN  VARCHAR2,
    p_correo       IN  VARCHAR2,
    p_nombre       IN  VARCHAR2,
    p_avatar       IN  VARCHAR2,
    p_id_usuario   OUT NUMBER
  ) IS
    v_id_usuario admin.usuarios.id_usuario%TYPE;
    v_proveedor  VARCHAR2(100);
    v_dummy      PLS_INTEGER;

    PROCEDURE set_avatar(p_user_id NUMBER, p_url VARCHAR2) IS
    BEGIN
      IF p_url IS NULL THEN
        RETURN;
      END IF;

      BEGIN
        EXECUTE IMMEDIATE
          'UPDATE admin.perfiles SET avatar_url = :1 WHERE id_usuario = :2'
          USING p_url, p_user_id;

        IF SQL%ROWCOUNT = 0 THEN
          NULL; -- No hay perfil todavía; se inserta más abajo
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE = -904 THEN
            BEGIN
              EXECUTE IMMEDIATE
                'UPDATE admin.perfiles SET imagen_url = :1 WHERE id_usuario = :2'
                USING p_url, p_user_id;
            EXCEPTION
              WHEN OTHERS THEN
                NULL;
            END;
          END IF;
      END;
    END set_avatar;
  BEGIN
    v_proveedor := UPPER(TRIM(p_proveedor));

    v_id_usuario := fn_get_usuario_oauth(v_proveedor, p_provider_id);

    IF v_id_usuario IS NOT NULL THEN
      p_id_usuario := v_id_usuario;
      RETURN;
    END IF;

    BEGIN
      SELECT u.id_usuario
        INTO v_id_usuario
        FROM admin.usuarios u
       WHERE LOWER(u.correo) = LOWER(p_correo)
         AND ROWNUM = 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        SELECT NVL(MAX(u.id_usuario), 0) + 1
          INTO v_id_usuario
          FROM admin.usuarios u;

        INSERT INTO admin.usuarios (id_usuario, correo, contrasena_hash, activo)
        VALUES (
          v_id_usuario,
          p_correo,
          fn_hash_pw('oauth-placeholder'),
          1
        );
    END;

    BEGIN
      SELECT 1
        INTO v_dummy
        FROM admin.perfiles p
       WHERE p.id_usuario = v_id_usuario;

      UPDATE admin.perfiles
         SET nombre_mostrar = COALESCE(nombre_mostrar, p_nombre)
       WHERE id_usuario = v_id_usuario;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        INSERT INTO admin.perfiles (id_usuario, nombre_mostrar)
        VALUES (v_id_usuario, p_nombre);
    END;

    set_avatar(v_id_usuario, p_avatar);

    INSERT INTO admin.cuentas_oauth (
      id_usuario,
      proveedor,
      id_proveedor_usuario
    ) VALUES (
      v_id_usuario,
      v_proveedor,
      p_provider_id
    );

    p_id_usuario := v_id_usuario;
  END sp_registrar_usuario_oauth;

  PROCEDURE sp_guardar_token_oauth(
    p_id_usuario    IN NUMBER,
    p_proveedor     IN VARCHAR2,
    p_provider_id   IN VARCHAR2,
    p_access_token  IN VARCHAR2,
    p_refresh_token IN VARCHAR2,
    p_scope         IN VARCHAR2,
    p_expira        IN DATE
  ) IS
    v_proveedor VARCHAR2(100);
  BEGIN
    v_proveedor := UPPER(TRIM(p_proveedor));

    MERGE INTO admin.cuentas_oauth o
    USING (
      SELECT p_id_usuario        AS id_usuario,
             v_proveedor         AS proveedor,
             p_provider_id       AS id_proveedor_usuario
        FROM dual
    ) src
    ON (
      o.id_usuario = src.id_usuario
      AND o.proveedor = src.proveedor
      AND o.id_proveedor_usuario = src.id_proveedor_usuario
    )
    WHEN MATCHED THEN
      UPDATE SET
        o.token_acceso   = p_access_token,
        o.token_refresco = p_refresh_token,
        o.alcance_token  = p_scope,
        o.expira_token   = p_expira
    WHEN NOT MATCHED THEN
      INSERT (
        id_usuario,
        proveedor,
        id_proveedor_usuario,
        token_acceso,
        token_refresco,
        alcance_token,
        expira_token
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
END sp_oauth_pkg;
/
