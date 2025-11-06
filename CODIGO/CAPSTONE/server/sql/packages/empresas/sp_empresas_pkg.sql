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
END sp_empresas_pkg;
/
