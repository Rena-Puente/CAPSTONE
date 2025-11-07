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

  PROCEDURE sp_obtener_empresa_usuario(
    p_id_usuario IN  USUARIOS.ID_USUARIO%TYPE,
    o_empresa    OUT SYS_REFCURSOR
  );

  PROCEDURE sp_crear_oferta(
    p_id_empresa     IN EMPRESAS.ID_EMPRESA%TYPE,
    p_titulo         IN OFERTAS.TITULO%TYPE,
    p_descripcion    IN OFERTAS.DESCRIPCION%TYPE,
    p_tipo_ubicacion IN OFERTAS.TIPO_UBICACION%TYPE,
    p_ciudad         IN OFERTAS.CIUDAD%TYPE,
    p_pais           IN OFERTAS.PAIS%TYPE,
    p_seniority      IN OFERTAS.SENIORITY%TYPE,
    p_tipo_contrato  IN OFERTAS.TIPO_CONTRATO%TYPE,
    o_id_oferta      OUT OFERTAS.ID_OFERTA%TYPE
  );

  PROCEDURE sp_listar_postulantes(
    p_id_empresa  IN EMPRESAS.ID_EMPRESA%TYPE,
    o_postulantes OUT SYS_REFCURSOR
  );

  PROCEDURE sp_listar_ofertas_publicas(
    o_ofertas OUT SYS_REFCURSOR
  );

  PROCEDURE sp_postular_oferta(
    p_id_oferta           IN OFERTAS.ID_OFERTA%TYPE,
    p_id_usuario          IN USUARIOS.ID_USUARIO%TYPE,
    p_carta_presentacion  IN POSTULACIONES.CARTA_PRESENTACION%TYPE,
    o_id_postulacion      OUT POSTULACIONES.ID_POSTULACION%TYPE
  );
END sp_empresas_pkg;
/

CREATE OR REPLACE PACKAGE BODY sp_empresas_pkg AS
  c_tipo_usuario_empresa CONSTANT NUMBER := 3;

  PROCEDURE ensure_tipo_usuario_empresa IS
    v_exists NUMBER := 0;
  BEGIN
    SELECT COUNT(1)
      INTO v_exists
      FROM tipo_usuario
     WHERE id_tipo_usuario = c_tipo_usuario_empresa;

    IF v_exists = 0 THEN
      BEGIN
        INSERT INTO tipo_usuario (id_tipo_usuario, descripcion)
        VALUES (c_tipo_usuario_empresa, 'Empresa');
      EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN
          NULL;
      END;
    END IF;
  END ensure_tipo_usuario_empresa;

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

    ensure_tipo_usuario_empresa;

    BEGIN
      SELECT id_usuario
        INTO v_id_usuario
        FROM usuarios
       WHERE LOWER(TRIM(correo)) = v_email_normal
       FETCH FIRST 1 ROWS ONLY;

      UPDATE usuarios
         SET contrasena_hash     = v_hash_db,
             pw_salt             = v_salt_db,
             pw_iters            = v_iters_db,
             activo              = 1,
             id_tipo_usuario     = c_tipo_usuario_empresa,
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
          id_tipo_usuario,
          fecha_creacion
        ) VALUES (
          v_email_normal,
          v_hash_db,
          v_salt_db,
          v_iters_db,
          1,
          c_tipo_usuario_empresa,
          SYSTIMESTAMP
        )
        RETURNING id_usuario INTO v_id_usuario;
    END;

    o_id_usuario := v_id_usuario;
    o_id_empresa := v_id_empresa;
  END sp_preparar_login_empresa;

  PROCEDURE sp_obtener_empresa_usuario(
    p_id_usuario IN  USUARIOS.ID_USUARIO%TYPE,
    o_empresa    OUT SYS_REFCURSOR
  ) IS
    v_email_normal EMPRESAS.EMAIL%TYPE;
  BEGIN
    IF p_id_usuario IS NULL THEN
      OPEN o_empresa FOR
        SELECT NULL AS id_empresa,
               NULL AS nombre,
               NULL AS sitio_web,
               NULL AS pais,
               NULL AS ciudad,
               NULL AS email,
               NULL AS rut_empresa,
               NULL AS fecha_creacion,
               NULL AS fecha_actualizacion
          FROM DUAL
         WHERE 1 = 0;
      RETURN;
    END IF;

    BEGIN
      SELECT LOWER(TRIM(correo))
        INTO v_email_normal
        FROM usuarios
       WHERE id_usuario = p_id_usuario;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        OPEN o_empresa FOR
          SELECT NULL AS id_empresa,
                 NULL AS nombre,
                 NULL AS sitio_web,
                 NULL AS pais,
                 NULL AS ciudad,
                 NULL AS email,
                 NULL AS rut_empresa,
                 NULL AS fecha_creacion,
                 NULL AS fecha_actualizacion
            FROM DUAL
           WHERE 1 = 0;
        RETURN;
    END;

    OPEN o_empresa FOR
      SELECT e.id_empresa,
             e.nombre,
             e.sitio_web,
             e.pais,
             e.ciudad,
             e.email,
             e.rut_empresa,
             e.fecha_creacion,
             e.fecha_actualizacion
        FROM empresas e
       WHERE LOWER(TRIM(e.email)) = v_email_normal
       FETCH FIRST 1 ROWS ONLY;
  END sp_obtener_empresa_usuario;

  PROCEDURE sp_crear_oferta(
    p_id_empresa     IN EMPRESAS.ID_EMPRESA%TYPE,
    p_titulo         IN OFERTAS.TITULO%TYPE,
    p_descripcion    IN OFERTAS.DESCRIPCION%TYPE,
    p_tipo_ubicacion IN OFERTAS.TIPO_UBICACION%TYPE,
    p_ciudad         IN OFERTAS.CIUDAD%TYPE,
    p_pais           IN OFERTAS.PAIS%TYPE,
    p_seniority      IN OFERTAS.SENIORITY%TYPE,
    p_tipo_contrato  IN OFERTAS.TIPO_CONTRATO%TYPE,
    o_id_oferta      OUT OFERTAS.ID_OFERTA%TYPE
  ) IS
    v_titulo         OFERTAS.TITULO%TYPE;
    v_descripcion    OFERTAS.DESCRIPCION%TYPE;
    v_tipo_ubicacion OFERTAS.TIPO_UBICACION%TYPE;
    v_ciudad         OFERTAS.CIUDAD%TYPE;
    v_pais           OFERTAS.PAIS%TYPE;
    v_seniority      OFERTAS.SENIORITY%TYPE;
    v_tipo_contrato  OFERTAS.TIPO_CONTRATO%TYPE;
  BEGIN
    IF p_id_empresa IS NULL THEN
      RAISE_APPLICATION_ERROR(-20070, 'El identificador de la empresa es obligatorio.');
    END IF;

    v_titulo := TRIM(p_titulo);
    v_descripcion := p_descripcion;
    v_tipo_ubicacion := TRIM(p_tipo_ubicacion);
    v_ciudad := TRIM(p_ciudad);
    v_pais := TRIM(p_pais);
    v_seniority := TRIM(p_seniority);
    v_tipo_contrato := TRIM(p_tipo_contrato);

    IF v_titulo IS NULL OR v_titulo = '' THEN
      RAISE_APPLICATION_ERROR(-20071, 'El título de la oferta es obligatorio.');
    END IF;

    IF v_descripcion IS NULL THEN
      RAISE_APPLICATION_ERROR(-20072, 'La descripción de la oferta es obligatoria.');
    END IF;

    IF v_tipo_ubicacion IS NULL OR v_tipo_ubicacion = '' THEN
      RAISE_APPLICATION_ERROR(-20073, 'Debes indicar el tipo de ubicación de la oferta.');
    END IF;

    IF v_ciudad IS NULL OR v_ciudad = '' THEN
      RAISE_APPLICATION_ERROR(-20074, 'La ciudad de la oferta es obligatoria.');
    END IF;

    IF v_pais IS NULL OR v_pais = '' THEN
      RAISE_APPLICATION_ERROR(-20075, 'El país de la oferta es obligatorio.');
    END IF;

    IF v_seniority IS NULL OR v_seniority = '' THEN
      RAISE_APPLICATION_ERROR(-20076, 'Debes indicar la seniority de la posición.');
    END IF;

    IF v_tipo_contrato IS NULL OR v_tipo_contrato = '' THEN
      RAISE_APPLICATION_ERROR(-20077, 'Debes indicar el tipo de contrato.');
    END IF;

    INSERT INTO ofertas (
      id_empresa,
      titulo,
      descripcion,
      tipo_ubicacion,
      ciudad,
      pais,
      seniority,
      tipo_contrato,
      fecha_creacion,
      activa
    ) VALUES (
      p_id_empresa,
      v_titulo,
      v_descripcion,
      v_tipo_ubicacion,
      v_ciudad,
      v_pais,
      v_seniority,
      v_tipo_contrato,
      SYSTIMESTAMP,
      1
    ) RETURNING id_oferta INTO o_id_oferta;
  END sp_crear_oferta;

  PROCEDURE sp_listar_postulantes(
    p_id_empresa  IN EMPRESAS.ID_EMPRESA%TYPE,
    o_postulantes OUT SYS_REFCURSOR
  ) IS
  BEGIN
    IF p_id_empresa IS NULL THEN
      OPEN o_postulantes FOR
        SELECT NULL AS id_postulacion,
               NULL AS id_oferta,
               NULL AS titulo_oferta,
               NULL AS id_usuario,
               NULL AS nombre_postulante,
               NULL AS correo_postulante,
               NULL AS estado,
               NULL AS fecha_creacion
          FROM DUAL
         WHERE 1 = 0;
      RETURN;
    END IF;

    OPEN o_postulantes FOR
      SELECT p.id_postulacion,
             p.id_oferta,
             o.titulo AS titulo_oferta,
             p.id_usuario,
             pr.nombre_mostrar AS nombre_postulante,
             u.correo AS correo_postulante,
             p.estado,
             p.fecha_creacion
        FROM postulaciones p
        JOIN ofertas o
          ON o.id_oferta = p.id_oferta
       JOIN usuarios u
          ON u.id_usuario = p.id_usuario
        LEFT JOIN perfiles pr
          ON pr.id_usuario = p.id_usuario
       WHERE o.id_empresa = p_id_empresa
       ORDER BY p.fecha_creacion DESC;
  END sp_listar_postulantes;

  PROCEDURE sp_listar_ofertas_publicas(
    o_ofertas OUT SYS_REFCURSOR
  ) IS
  BEGIN
    OPEN o_ofertas FOR
      SELECT o.id_oferta,
             o.id_empresa,
             o.titulo,
             o.descripcion,
             o.tipo_ubicacion,
             o.ciudad,
             o.pais,
             o.seniority,
             o.tipo_contrato,
             o.fecha_creacion,
             e.nombre      AS nombre_empresa,
             e.sitio_web   AS sitio_web_empresa,
             e.pais        AS pais_empresa,
             e.ciudad      AS ciudad_empresa
        FROM ofertas o
        JOIN empresas e
          ON e.id_empresa = o.id_empresa
       WHERE NVL(o.activa, 0) = 1
       ORDER BY o.fecha_creacion DESC;
  END sp_listar_ofertas_publicas;

  PROCEDURE sp_postular_oferta(
    p_id_oferta           IN OFERTAS.ID_OFERTA%TYPE,
    p_id_usuario          IN USUARIOS.ID_USUARIO%TYPE,
    p_carta_presentacion  IN POSTULACIONES.CARTA_PRESENTACION%TYPE,
    o_id_postulacion      OUT POSTULACIONES.ID_POSTULACION%TYPE
  ) IS
    v_activa        OFERTAS.ACTIVA%TYPE;
    v_biografia     POSTULACIONES.CARTA_PRESENTACION%TYPE;
    v_dummy         NUMBER;
  BEGIN
    IF p_id_oferta IS NULL THEN
      RAISE_APPLICATION_ERROR(-20080, 'Debes seleccionar una oferta válida.');
    END IF;

    IF p_id_usuario IS NULL THEN
      RAISE_APPLICATION_ERROR(-20081, 'Debes iniciar sesión para postular a una oferta.');
    END IF;

    BEGIN
      SELECT activa
        INTO v_activa
        FROM ofertas
       WHERE id_oferta = p_id_oferta;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20082, 'La oferta seleccionada no existe.');
    END;

    IF NVL(v_activa, 0) <> 1 THEN
      RAISE_APPLICATION_ERROR(-20083, 'La oferta seleccionada no está disponible para nuevas postulaciones.');
    END IF;

    BEGIN
      SELECT 1
        INTO v_dummy
        FROM usuarios
       WHERE id_usuario = p_id_usuario
         AND NVL(activo, 0) = 1
       FETCH FIRST 1 ROWS ONLY;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20084, 'El usuario indicado no existe o no está activo.');
    END;

    SELECT COUNT(*)
      INTO v_dummy
      FROM postulaciones
     WHERE id_oferta = p_id_oferta
       AND id_usuario = p_id_usuario;

    IF v_dummy > 0 THEN
      RAISE_APPLICATION_ERROR(-20085, 'Ya has postulado a esta oferta.');
    END IF;

    v_biografia := p_carta_presentacion;

    INSERT INTO postulaciones (
      id_oferta,
      id_usuario,
      carta_presentacion,
      estado,
      fecha_creacion
    ) VALUES (
      p_id_oferta,
      p_id_usuario,
      v_biografia,
      'enviada',
      SYSTIMESTAMP
    ) RETURNING id_postulacion INTO o_id_postulacion;
  END sp_postular_oferta;
END sp_empresas_pkg;
/
