CREATE OR REPLACE PACKAGE sp_educacion_pkg AS
  -- Crear
  PROCEDURE sp_crear_educacion(
    p_id_usuario    IN  NUMBER,
    p_institucion   IN  VARCHAR2,
    p_grado         IN  VARCHAR2,
    p_area_estudio  IN  VARCHAR2,
    p_fecha_inicio  IN  DATE,
    p_fecha_fin     IN  DATE,
    p_descripcion   IN  VARCHAR2,
    o_id_educacion  OUT NUMBER
  );

  -- Actualizar
  PROCEDURE sp_actualizar_educacion(
    p_id_educacion  IN NUMBER,
    p_id_usuario    IN NUMBER,
    p_institucion   IN VARCHAR2,
    p_grado         IN VARCHAR2,
    p_area_estudio  IN VARCHAR2,
    p_fecha_inicio  IN DATE,
    p_fecha_fin     IN DATE,
    p_descripcion   IN VARCHAR2
  );

  -- Eliminar
  PROCEDURE sp_eliminar_educacion(
    p_id_educacion IN NUMBER,
    p_id_usuario   IN NUMBER
  );

  -- Obtener una fila
  PROCEDURE sp_obtener_educacion(
    p_id_educacion IN  NUMBER,
    p_id_usuario   IN  NUMBER,
    o_institucion  OUT VARCHAR2,
    o_grado        OUT VARCHAR2,
    o_area_estudio OUT VARCHAR2,
    o_fecha_inicio OUT DATE,
    o_fecha_fin    OUT DATE,
    o_descripcion  OUT VARCHAR2,
    o_existe       OUT NUMBER
  );

  -- Listar por usuario (para grilla)
  PROCEDURE sp_listar_educacion(
    p_id_usuario IN NUMBER,
    o_items      OUT SYS_REFCURSOR
  );

  -- Check de módulo (para progreso por secciones)
  PROCEDURE sp_educacion_chk(
    p_id_usuario          IN  NUMBER,
    o_tiene_educacion     OUT NUMBER, -- 1/0
    o_total_registros     OUT NUMBER,
    o_con_fechas_validas  OUT NUMBER  -- cuántos tienen rango válido (fin>=inicio o fin NULL)
  );
END sp_educacion_pkg;
/


CREATE OR REPLACE PACKAGE BODY sp_educacion_pkg AS

  -- Valida coherencia de fechas
  PROCEDURE validar_fechas(p_inicio IN DATE, p_fin IN DATE) IS
  BEGIN
    IF p_fin IS NOT NULL AND p_inicio IS NOT NULL AND p_fin < p_inicio THEN
      RAISE_APPLICATION_ERROR(-20001, 'FECHA_FIN no puede ser menor que FECHA_INICIO');
    END IF;
  END;

  PROCEDURE sp_crear_educacion(
    p_id_usuario    IN  NUMBER,
    p_institucion   IN  VARCHAR2,
    p_grado         IN  VARCHAR2,
    p_area_estudio  IN  VARCHAR2,
    p_fecha_inicio  IN  DATE,
    p_fecha_fin     IN  DATE,
    p_descripcion   IN  VARCHAR2,
    o_id_educacion  OUT NUMBER
  ) IS
  BEGIN
    IF p_institucion IS NULL OR TRIM(p_institucion) = '' THEN
      RAISE_APPLICATION_ERROR(-20002, 'INSTITUCION es obligatoria');
    END IF;

    validar_fechas(p_fecha_inicio, p_fecha_fin);

    INSERT INTO EDUCACION(
      ID_USUARIO, INSTITUCION, GRADO, AREA_ESTUDIO,
      FECHA_INICIO, FECHA_FIN, DESCRIPCION
    )
    VALUES (
      p_id_usuario, p_institucion, p_grado, p_area_estudio,
      p_fecha_inicio, p_fecha_fin, p_descripcion
    )
    RETURNING ID_EDUCACION INTO o_id_educacion;
  END sp_crear_educacion;

  PROCEDURE sp_actualizar_educacion(
    p_id_educacion  IN NUMBER,
    p_id_usuario    IN NUMBER,
    p_institucion   IN VARCHAR2,
    p_grado         IN VARCHAR2,
    p_area_estudio  IN VARCHAR2,
    p_fecha_inicio  IN DATE,
    p_fecha_fin     IN DATE,
    p_descripcion   IN VARCHAR2
  ) IS
  BEGIN
    IF p_institucion IS NULL OR TRIM(p_institucion) = '' THEN
      RAISE_APPLICATION_ERROR(-20002, 'INSTITUCION es obligatoria');
    END IF;

    validar_fechas(p_fecha_inicio, p_fecha_fin);

    UPDATE EDUCACION
       SET INSTITUCION  = p_institucion,
           GRADO        = p_grado,
           AREA_ESTUDIO = p_area_estudio,
           FECHA_INICIO = p_fecha_inicio,
           FECHA_FIN    = p_fecha_fin,
           DESCRIPCION  = p_descripcion
     WHERE ID_EDUCACION = p_id_educacion
       AND ID_USUARIO   = p_id_usuario;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20003, 'No se encontró el registro a actualizar (ID/USUARIO no coinciden).');
    END IF;
  END sp_actualizar_educacion;

  PROCEDURE sp_eliminar_educacion(
    p_id_educacion IN NUMBER,
    p_id_usuario   IN NUMBER
  ) IS
  BEGIN
    DELETE FROM EDUCACION
     WHERE ID_EDUCACION = p_id_educacion
       AND ID_USUARIO   = p_id_usuario;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20004, 'No se encontró el registro a eliminar (ID/USUARIO no coinciden).');
    END IF;
  END sp_eliminar_educacion;

  PROCEDURE sp_obtener_educacion(
    p_id_educacion IN  NUMBER,
    p_id_usuario   IN  NUMBER,
    o_institucion  OUT VARCHAR2,
    o_grado        OUT VARCHAR2,
    o_area_estudio OUT VARCHAR2,
    o_fecha_inicio OUT DATE,
    o_fecha_fin    OUT DATE,
    o_descripcion  OUT VARCHAR2,
    o_existe       OUT NUMBER
  ) IS
  BEGIN
    BEGIN
      SELECT INSTITUCION, GRADO, AREA_ESTUDIO,
             FECHA_INICIO, FECHA_FIN, DESCRIPCION
        INTO o_institucion, o_grado, o_area_estudio,
             o_fecha_inicio, o_fecha_fin, o_descripcion
        FROM EDUCACION
       WHERE ID_EDUCACION = p_id_educacion
         AND ID_USUARIO   = p_id_usuario;

      o_existe := 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        o_institucion := '';
        o_grado := '';
        o_area_estudio := '';
        o_fecha_inicio := NULL;
        o_fecha_fin := NULL;
        o_descripcion := '';
        o_existe := 0;
    END;
  END sp_obtener_educacion;

  PROCEDURE sp_listar_educacion(
    p_id_usuario IN NUMBER,
    o_items      OUT SYS_REFCURSOR
  ) IS
  BEGIN
    OPEN o_items FOR
      SELECT ID_EDUCACION, INSTITUCION, GRADO, AREA_ESTUDIO,
             FECHA_INICIO, FECHA_FIN, DESCRIPCION
        FROM EDUCACION
       WHERE ID_USUARIO = p_id_usuario
       ORDER BY NVL(FECHA_FIN, DATE '4712-12-31') DESC,
                FECHA_INICIO DESC;
  END sp_listar_educacion;

  PROCEDURE sp_educacion_chk(
    p_id_usuario          IN  NUMBER,
    o_tiene_educacion     OUT NUMBER,
    o_total_registros     OUT NUMBER,
    o_con_fechas_validas  OUT NUMBER
  ) IS
  BEGIN
    SELECT COUNT(*)
      INTO o_total_registros
      FROM EDUCACION
     WHERE ID_USUARIO = p_id_usuario;

    o_tiene_educacion := CASE WHEN o_total_registros > 0 THEN 1 ELSE 0 END;

    SELECT COUNT(*)
      INTO o_con_fechas_validas
      FROM EDUCACION
     WHERE ID_USUARIO = p_id_usuario
       AND (FECHA_INICIO IS NULL
            OR FECHA_FIN IS NULL
            OR FECHA_FIN >= FECHA_INICIO);
  END sp_educacion_chk;

END sp_educacion_pkg;
/
