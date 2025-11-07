CREATE OR REPLACE PACKAGE sp_empresas_pkg AS
  PROCEDURE sp_registrar_empresa(
    p_nombre        IN  EMPRESAS.NOMBRE%TYPE,
    p_sitio_web     IN  EMPRESAS.SITIO_WEB%TYPE,
    p_pais          IN  EMPRESAS.PAIS%TYPE,
    p_ciudad        IN  EMPRESAS.CIUDAD%TYPE,
    p_email         IN  EMPRESAS.EMAIL%TYPE,
    p_contrasena    IN  EMPRESAS."CONTRASEÑA"%TYPE,
    p_rut_empresa   IN  EMPRESAS.RUT_EMPRESA%TYPE,
    p_pw_salt       IN  EMPRESAS.PW_SALT%TYPE DEFAULT NULL,
    p_pw_iters      IN  EMPRESAS.PW_ITERS%TYPE DEFAULT NULL,
    o_id_empresa    OUT EMPRESAS.ID_EMPRESA%TYPE
  );
  
  PROCEDURE sp_preparar_login_empresa(
    p_email         IN  EMPRESAS.EMAIL%TYPE,
    p_contrasena    IN  EMPRESAS."CONTRASEÑA"%TYPE,
    o_id_usuario    OUT USUARIOS.ID_USUARIO%TYPE,
    o_id_empresa    OUT EMPRESAS.ID_EMPRESA%TYPE
  );
END sp_empresas_pkg;
/

CREATE OR REPLACE PACKAGE BODY sp_empresas_pkg AS
  PROCEDURE sp_registrar_empresa(
    p_nombre        IN  EMPRESAS.NOMBRE%TYPE,
    p_sitio_web     IN  EMPRESAS.SITIO_WEB%TYPE,
    p_pais          IN  EMPRESAS.PAIS%TYPE,
    p_ciudad        IN  EMPRESAS.CIUDAD%TYPE,
    p_email         IN  EMPRESAS.EMAIL%TYPE,
    p_contrasena    IN  EMPRESAS."CONTRASEÑA"%TYPE,
    p_rut_empresa   IN  EMPRESAS.RUT_EMPRESA%TYPE,
    p_pw_salt       IN  EMPRESAS.PW_SALT%TYPE DEFAULT NULL,
    p_pw_iters      IN  EMPRESAS.PW_ITERS%TYPE DEFAULT NULL,
    o_id_empresa    OUT EMPRESAS.ID_EMPRESA%TYPE
  ) IS
    v_existing NUMBER;
  BEGIN
    IF p_nombre IS NULL OR TRIM(p_nombre) = '' THEN
      RAISE_APPLICATION_ERROR(-20021, 'El nombre de la empresa es obligatorio.');
    END IF;

    IF p_email IS NULL OR TRIM(p_email) = '' THEN
      RAISE_APPLICATION_ERROR(-20022, 'El correo de la empresa es obligatorio.');
    END IF;

    IF p_rut_empresa IS NULL OR TRIM(p_rut_empresa) = '' THEN
      RAISE_APPLICATION_ERROR(-20023, 'El RUT de la empresa es obligatorio.');
    END IF;

    SELECT COUNT(*)
      INTO v_existing
      FROM EMPRESAS
     WHERE LOWER(EMAIL) = LOWER(TRIM(p_email));

    IF v_existing > 0 THEN
      RAISE_APPLICATION_ERROR(-20024, 'El correo ya está registrado por otra empresa.');
    END IF;

    SELECT COUNT(*)
      INTO v_existing
      FROM EMPRESAS
     WHERE REPLACE(TRIM(RUT_EMPRESA), '.', '') = REPLACE(TRIM(p_rut_empresa), '.', '');

    IF v_existing > 0 THEN
      RAISE_APPLICATION_ERROR(-20025, 'El RUT ya está registrado por otra empresa.');
    END IF;

    INSERT INTO EMPRESAS (
      NOMBRE,
      SITIO_WEB,
      PAIS,
      CIUDAD,
      EMAIL,
      "CONTRASEÑA",
      RUT_EMPRESA,
      FECHA_CREACION,
      FECHA_ACTUALIZACION,
      PW_SALT,
      PW_ITERS
    ) VALUES (
      TRIM(p_nombre),
      TRIM(p_sitio_web),
      TRIM(p_pais),
      TRIM(p_ciudad),
      TRIM(p_email),
      p_contrasena,
      TRIM(p_rut_empresa),
      SYSDATE,
      NULL,
      p_pw_salt,
      p_pw_iters
    )
    RETURNING ID_EMPRESA INTO o_id_empresa;
  END sp_registrar_empresa;
  
  PROCEDURE sp_preparar_login_empresa(
    p_email         IN  EMPRESAS.EMAIL%TYPE,
    p_contrasena    IN  EMPRESAS."CONTRASEÑA"%TYPE,
    o_id_usuario    OUT USUARIOS.ID_USUARIO%TYPE,
    o_id_empresa    OUT EMPRESAS.ID_EMPRESA%TYPE
  ) IS
    v_id_empresa   EMPRESAS.ID_EMPRESA%TYPE;
    v_email_db     EMPRESAS.EMAIL%TYPE;
    v_hash_db      EMPRESAS."CONTRASEÑA"%TYPE;
    v_salt_db      EMPRESAS.PW_SALT%TYPE;
    v_iters_db     EMPRESAS.PW_ITERS%TYPE;
    v_hash_input   EMPRESAS."CONTRASEÑA"%TYPE;
    v_id_usuario   USUARIOS.ID_USUARIO%TYPE;
    v_email_normal EMPRESAS.EMAIL%TYPE;
  BEGIN
    o_id_usuario := NULL;
    o_id_empresa := NULL;

    IF p_email IS NULL OR TRIM(p_email) = '' OR p_contrasena IS NULL THEN
      RETURN;
    END IF;

    v_email_normal := LOWER(TRIM(p_email));

    BEGIN
      SELECT id_empresa,
             email,
             "CONTRASEÑA",
             pw_salt,
             pw_iters
        INTO v_id_empresa,
             v_email_db,
             v_hash_db,
             v_salt_db,
             v_iters_db
        FROM empresas
       WHERE LOWER(TRIM(email)) = v_email_normal
       FETCH FIRST 1 ROWS ONLY;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RETURN;
    END;

    IF v_salt_db IS NULL OR v_iters_db IS NULL THEN
      RETURN;
    END IF;

    v_hash_input := fn_hash_pw_salted(TRIM(p_contrasena), v_salt_db, v_iters_db);

    IF v_hash_input <> v_hash_db THEN
      RETURN;
    END IF;

    BEGIN
      SELECT id_usuario
        INTO v_id_usuario
        FROM usuarios
       WHERE LOWER(TRIM(correo)) = v_email_normal
       FETCH FIRST 1 ROWS ONLY;

      UPDATE usuarios
         SET contrasena_hash    = v_hash_db,
             pw_salt            = v_salt_db,
             pw_iters           = v_iters_db,
             activo             = 1,
             fecha_actualizacion = SYSTIMESTAMP
       WHERE id_usuario = v_id_usuario;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        INSERT INTO usuarios (
          correo,
          contrasena_hash,
          pw_salt,
          pw_iters,
          activo,
          fecha_creacion
        ) VALUES (
          v_email_normal,
          v_hash_db,
          v_salt_db,
          v_iters_db,
          1,
          SYSTIMESTAMP
        )
        RETURNING id_usuario INTO v_id_usuario;
    END;

    o_id_usuario := v_id_usuario;
    o_id_empresa := v_id_empresa;
  END sp_preparar_login_empresa;
END sp_empresas_pkg;
/
