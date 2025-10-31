CREATE OR REPLACE PACKAGE sp_experiencia_pkg AS
  -- Crear
  PROCEDURE sp_crear_experiencia(
    p_id_usuario     IN  NUMBER,
    p_titulo         IN  VARCHAR2,
    p_empresa        IN  VARCHAR2,
    p_fecha_inicio   IN  DATE,
    p_fecha_fin      IN  DATE,
    p_ubicacion      IN  VARCHAR2,
    p_descripcion    IN  CLOB,
    o_id_experiencia OUT NUMBER
  );

  -- Actualizar
  PROCEDURE sp_actualizar_experiencia(
    p_id_experiencia IN NUMBER,
    p_id_usuario     IN NUMBER,
    p_titulo         IN VARCHAR2,
    p_empresa        IN VARCHAR2,
    p_fecha_inicio   IN DATE,
    p_fecha_fin      IN DATE,
    p_ubicacion      IN VARCHAR2,
    p_descripcion    IN CLOB
  );

  -- Eliminar
  PROCEDURE sp_eliminar_experiencia(
    p_id_experiencia IN NUMBER,
    p_id_usuario     IN NUMBER
  );

  -- Obtener una fila
  PROCEDURE sp_obtener_experiencia(
    p_id_experiencia IN  NUMBER,
    p_id_usuario     IN  NUMBER,
    o_titulo         OUT VARCHAR2,
    o_empresa        OUT VARCHAR2,
    o_fecha_inicio   OUT DATE,
    o_fecha_fin      OUT DATE,
    o_ubicacion      OUT VARCHAR2,
    o_descripcion    OUT CLOB,
    o_existe         OUT NUMBER
  );

  -- Listar por usuario (para grilla)
  PROCEDURE sp_listar_experiencia(
    p_id_usuario IN NUMBER,
    o_items      OUT SYS_REFCURSOR
  );

  -- Check de módulo (para “progreso por secciones”)
  PROCEDURE sp_experiencia_chk(
    p_id_usuario           IN  NUMBER,
    o_tiene_experiencia    OUT NUMBER, -- 1/0
    o_total_registros      OUT NUMBER,
    o_con_fechas_validas   OUT NUMBER, -- fin>=inicio o fin NULL
    o_actuales             OUT NUMBER  -- sin FECHA_FIN (vigentes)
  );
END sp_experiencia_pkg;
/

CREATE OR REPLACE PACKAGE BODY sp_experiencia_pkg AS

  -- Valida coherencia de fechas
  PROCEDURE validar_fechas(p_inicio IN DATE, p_fin IN DATE) IS
  BEGIN
    IF p_fin IS NOT NULL AND p_inicio IS NOT NULL AND p_fin < p_inicio THEN
      RAISE_APPLICATION_ERROR(-20011, 'FECHA_FIN no puede ser menor que FECHA_INICIO');
    END IF;
  END;

  PROCEDURE sp_crear_experiencia(
    p_id_usuario     IN  NUMBER,
    p_titulo         IN  VARCHAR2,
    p_empresa        IN  VARCHAR2,
    p_fecha_inicio   IN  DATE,
    p_fecha_fin      IN  DATE,
    p_ubicacion      IN  VARCHAR2,
    p_descripcion    IN  CLOB,
    o_id_experiencia OUT NUMBER
  ) IS
  BEGIN
    IF p_titulo IS NULL OR TRIM(p_titulo) = '' THEN
      RAISE_APPLICATION_ERROR(-20012, 'TITULO es obligatorio');
    END IF;

    validar_fechas(p_fecha_inicio, p_fecha_fin);

    INSERT INTO EXPERIENCIAS(
      ID_USUARIO, TITULO, EMPRESA, FECHA_INICIO, FECHA_FIN, UBICACION, DESCRIPCION
    )
    VALUES (
      p_id_usuario, p_titulo, p_empresa, p_fecha_inicio, p_fecha_fin, p_ubicacion, p_descripcion
    )
    RETURNING ID_EXPERIENCIA INTO o_id_experiencia;
  END sp_crear_experiencia;

  PROCEDURE sp_actualizar_experiencia(
    p_id_experiencia IN NUMBER,
    p_id_usuario     IN NUMBER,
    p_titulo         IN VARCHAR2,
    p_empresa        IN VARCHAR2,
    p_fecha_inicio   IN DATE,
    p_fecha_fin      IN DATE,
    p_ubicacion      IN VARCHAR2,
    p_descripcion    IN CLOB
  ) IS
  BEGIN
    IF p_titulo IS NULL OR TRIM(p_titulo) = '' THEN
      RAISE_APPLICATION_ERROR(-20012, 'TITULO es obligatorio');
    END IF;

    validar_fechas(p_fecha_inicio, p_fecha_fin);

    UPDATE EXPERIENCIAS
       SET TITULO        = p_titulo,
           EMPRESA       = p_empresa,
           FECHA_INICIO  = p_fecha_inicio,
           FECHA_FIN     = p_fecha_fin,
           UBICACION     = p_ubicacion,
           DESCRIPCION   = p_descripcion
     WHERE ID_EXPERIENCIA = p_id_experiencia
       AND ID_USUARIO     = p_id_usuario;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20013, 'No se encontró el registro a actualizar (ID/USUARIO no coinciden).');
    END IF;
  END sp_actualizar_experiencia;

  PROCEDURE sp_eliminar_experiencia(
    p_id_experiencia IN NUMBER,
    p_id_usuario     IN NUMBER
  ) IS
  BEGIN
    DELETE FROM EXPERIENCIAS
     WHERE ID_EXPERIENCIA = p_id_experiencia
       AND ID_USUARIO     = p_id_usuario;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20014, 'No se encontró el registro a eliminar (ID/USUARIO no coinciden).');
    END IF;
  END sp_eliminar_experiencia;

  PROCEDURE sp_obtener_experiencia(
    p_id_experiencia IN  NUMBER,
    p_id_usuario     IN  NUMBER,
    o_titulo         OUT VARCHAR2,
    o_empresa        OUT VARCHAR2,
    o_fecha_inicio   OUT DATE,
    o_fecha_fin      OUT DATE,
    o_ubicacion      OUT VARCHAR2,
    o_descripcion    OUT CLOB,
    o_existe         OUT NUMBER
  ) IS
  BEGIN
    BEGIN
      SELECT TITULO, EMPRESA, FECHA_INICIO, FECHA_FIN, UBICACION, DESCRIPCION
        INTO o_titulo, o_empresa, o_fecha_inicio, o_fecha_fin, o_ubicacion, o_descripcion
        FROM EXPERIENCIAS
       WHERE ID_EXPERIENCIA = p_id_experiencia
         AND ID_USUARIO     = p_id_usuario;

      o_existe := 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        o_titulo := '';
        o_empresa := '';
        o_fecha_inicio := NULL;
        o_fecha_fin := NULL;
        o_ubicacion := '';
        DBMS_LOB.CREATETEMPORARY(o_descripcion, TRUE);
        DBMS_LOB.TRIM(o_descripcion, 0);
        o_existe := 0;
    END;
  END sp_obtener_experiencia;

  PROCEDURE sp_listar_experiencia(
    p_id_usuario IN NUMBER,
    o_items      OUT SYS_REFCURSOR
  ) IS
  BEGIN
    OPEN o_items FOR
      SELECT ID_EXPERIENCIA, TITULO, EMPRESA, FECHA_INICIO, FECHA_FIN, UBICACION
        FROM EXPERIENCIAS
       WHERE ID_USUARIO = p_id_usuario
       ORDER BY NVL(FECHA_FIN, DATE '4712-12-31') DESC,
                FECHA_INICIO DESC;
  END sp_listar_experiencia;

  PROCEDURE sp_experiencia_chk(
    p_id_usuario           IN  NUMBER,
    o_tiene_experiencia    OUT NUMBER,
    o_total_registros      OUT NUMBER,
    o_con_fechas_validas   OUT NUMBER,
    o_actuales             OUT NUMBER
  ) IS
  BEGIN
    SELECT COUNT(*)
      INTO o_total_registros
      FROM EXPERIENCIAS
     WHERE ID_USUARIO = p_id_usuario;

    o_tiene_experiencia := CASE WHEN o_total_registros > 0 THEN 1 ELSE 0 END;

    SELECT COUNT(*)
      INTO o_con_fechas_validas
      FROM EXPERIENCIAS
     WHERE ID_USUARIO = p_id_usuario
       AND (FECHA_INICIO IS NULL
            OR FECHA_FIN IS NULL
            OR FECHA_FIN >= FECHA_INICIO);

    SELECT COUNT(*)
      INTO o_actuales
      FROM EXPERIENCIAS
     WHERE ID_USUARIO = p_id_usuario
       AND FECHA_FIN IS NULL;
  END sp_experiencia_chk;

END sp_experiencia_pkg;
/