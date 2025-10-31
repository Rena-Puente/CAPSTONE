create or replace PACKAGE sp_usuario_habilidades_pkg AS
  ------------------------------------------------------------------------------
  -- Altas / Cambios / Bajas
  ------------------------------------------------------------------------------
  PROCEDURE sp_agregar_habilidad_usuario(
    p_id_usuario         IN NUMBER,
    p_id_habilidad       IN NUMBER,
    p_nivel              IN NUMBER   DEFAULT NULL,  -- 1..5 o NULL
    p_anios_experiencia  IN NUMBER   DEFAULT NULL,  -- >= 0 (puede ser 3.1 si tu columna lo soporta)
    p_cantidad_respaldo  IN NUMBER   DEFAULT 0      -- >= 0
  );

  PROCEDURE sp_actualizar_habilidad_usuario(
    p_id_usuario         IN NUMBER,
    p_id_habilidad       IN NUMBER,
    p_nivel              IN NUMBER   DEFAULT NULL,
    p_anios_experiencia  IN NUMBER   DEFAULT NULL,
    p_cantidad_respaldo  IN NUMBER   DEFAULT NULL   -- si NULL, mantiene actual
  );

  PROCEDURE sp_eliminar_habilidad_usuario(
    p_id_usuario    IN NUMBER,
    p_id_habilidad  IN NUMBER
  );

  -- UPSERT conveniente: crea o actualiza en una sola llamada
  PROCEDURE sp_upsert_habilidad_usuario(
    p_id_usuario         IN NUMBER,
    p_id_habilidad       IN NUMBER,
    p_nivel              IN NUMBER   DEFAULT NULL,
    p_anios_experiencia  IN NUMBER   DEFAULT NULL,
    p_cantidad_respaldo  IN NUMBER   DEFAULT 0
  );

  -- Variante por NOMBRE de habilidad (busca en catálogo, no crea catálogo nuevo)
  PROCEDURE sp_upsert_habilidad_usuario_by_nombre(
    p_id_usuario         IN NUMBER,
    p_nombre_habilidad   IN VARCHAR2,
    p_nivel              IN NUMBER   DEFAULT NULL,
    p_anios_experiencia  IN NUMBER   DEFAULT NULL,
    p_cantidad_respaldo  IN NUMBER   DEFAULT 0,
    o_id_habilidad       OUT NUMBER
  );

  ------------------------------------------------------------------------------
  -- Lecturas
  ------------------------------------------------------------------------------
  PROCEDURE sp_obtener_habilidad_usuario(
    p_id_usuario         IN  NUMBER,
    p_id_habilidad       IN  NUMBER,
    o_nivel              OUT NUMBER,
    o_anios_experiencia  OUT NUMBER,
    o_cantidad_respaldo  OUT NUMBER,
    o_existe             OUT NUMBER     -- 1/0
  );

  -- Listado “amigable” con nombre y categoría (ideal para la grilla)
  PROCEDURE sp_listar_habilidades_usuario(
    p_id_usuario IN NUMBER,
    o_items      OUT SYS_REFCURSOR
  );

  ------------------------------------------------------------------------------
  -- Utilidades
  ------------------------------------------------------------------------------
  -- Incrementa/decrementa respaldos (delta puede ser negativo). No baja de 0.
  PROCEDURE sp_incrementar_respaldo(
    p_id_usuario    IN NUMBER,
    p_id_habilidad  IN NUMBER,
    p_delta         IN NUMBER
  );

  -- Resumen para “progreso por sección”
  PROCEDURE sp_usuario_habilidades_chk(
    p_id_usuario          IN  NUMBER,
    o_total_habilidades   OUT NUMBER,
    o_promedio_nivel      OUT NUMBER,  -- promedio solo de filas con NIVEL no nulo
    o_max_nivel           OUT NUMBER,
    o_min_nivel           OUT NUMBER
  );
END sp_usuario_habilidades_pkg;
/

create or replace PACKAGE BODY sp_usuario_habilidades_pkg AS

  ------------------------------------------------------------------------------
  -- Helpers de validación
  ------------------------------------------------------------------------------
  PROCEDURE validar_inputs(
    p_nivel IN NUMBER,
    p_anios IN NUMBER,
    p_resp  IN NUMBER
  ) IS
  BEGIN
    IF p_nivel IS NOT NULL AND (p_nivel < 1 OR p_nivel > 5) THEN
      RAISE_APPLICATION_ERROR(-20101, 'NIVEL debe ser entre 1 y 5 (o NULL).');
    END IF;

    IF p_anios IS NOT NULL AND p_anios < 0 THEN
      RAISE_APPLICATION_ERROR(-20102, 'ANIOS_EXPERIENCIA no puede ser negativo.');
    END IF;

    IF p_resp IS NOT NULL AND p_resp < 0 THEN
      RAISE_APPLICATION_ERROR(-20103, 'CANTIDAD_RESPALDO no puede ser negativo.');
    END IF;
  END;

  PROCEDURE validar_existencia_catalogo(p_id_habilidad IN NUMBER) IS
    v_dummy NUMBER;
  BEGIN
    SELECT 1 INTO v_dummy
      FROM HABILIDADES
     WHERE ID_HABILIDAD = p_id_habilidad;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20110, 'La habilidad no existe en el catálogo.');
  END;

  ------------------------------------------------------------------------------
  -- Altas / Cambios / Bajas
  ------------------------------------------------------------------------------
  PROCEDURE sp_agregar_habilidad_usuario(
    p_id_usuario         IN NUMBER,
    p_id_habilidad       IN NUMBER,
    p_nivel              IN NUMBER,
    p_anios_experiencia  IN NUMBER,
    p_cantidad_respaldo  IN NUMBER
  ) IS
    v_count NUMBER;
  BEGIN
    validar_inputs(p_nivel, p_anios_experiencia, p_cantidad_respaldo);
    validar_existencia_catalogo(p_id_habilidad);

    SELECT COUNT(*) INTO v_count
      FROM USUARIO_HABILIDADES
     WHERE ID_USUARIO = p_id_usuario
       AND ID_HABILIDAD = p_id_habilidad;

    IF v_count > 0 THEN
      RAISE_APPLICATION_ERROR(-20120, 'El usuario ya tiene esta habilidad asignada.');
    END IF;

    INSERT INTO USUARIO_HABILIDADES(
      ID_USUARIO, ID_HABILIDAD, NIVEL, ANIOS_EXPERIENCIA, CANTIDAD_RESPALDO
    ) VALUES (
      p_id_usuario, p_id_habilidad, p_nivel, p_anios_experiencia, NVL(p_cantidad_respaldo, 0)
    );
  END sp_agregar_habilidad_usuario;

  PROCEDURE sp_actualizar_habilidad_usuario(
    p_id_usuario         IN NUMBER,
    p_id_habilidad       IN NUMBER,
    p_nivel              IN NUMBER,
    p_anios_experiencia  IN NUMBER,
    p_cantidad_respaldo  IN NUMBER
  ) IS
    v_rows NUMBER;
  BEGIN
    validar_inputs(p_nivel, p_anios_experiencia, p_cantidad_respaldo);

    UPDATE USUARIO_HABILIDADES
       SET NIVEL = p_nivel,
           ANIOS_EXPERIENCIA = p_anios_experiencia,
           CANTIDAD_RESPALDO = COALESCE(p_cantidad_respaldo, CANTIDAD_RESPALDO)
     WHERE ID_USUARIO = p_id_usuario
       AND ID_HABILIDAD = p_id_habilidad;

    v_rows := SQL%ROWCOUNT;
    IF v_rows = 0 THEN
      RAISE_APPLICATION_ERROR(-20121, 'No hay registro para actualizar (usuario/habilidad).');
    END IF;
  END sp_actualizar_habilidad_usuario;

  PROCEDURE sp_eliminar_habilidad_usuario(
    p_id_usuario    IN NUMBER,
    p_id_habilidad  IN NUMBER
  ) IS
    v_rows NUMBER;
  BEGIN
    DELETE FROM USUARIO_HABILIDADES
     WHERE ID_USUARIO = p_id_usuario
       AND ID_HABILIDAD = p_id_habilidad;

    v_rows := SQL%ROWCOUNT;
    IF v_rows = 0 THEN
      RAISE_APPLICATION_ERROR(-20122, 'No hay registro para eliminar (usuario/habilidad).');
    END IF;
  END sp_eliminar_habilidad_usuario;

  PROCEDURE sp_upsert_habilidad_usuario(
    p_id_usuario         IN NUMBER,
    p_id_habilidad       IN NUMBER,
    p_nivel              IN NUMBER,
    p_anios_experiencia  IN NUMBER,
    p_cantidad_respaldo  IN NUMBER
  ) IS
  BEGIN
    validar_inputs(p_nivel, p_anios_experiencia, p_cantidad_respaldo);
    validar_existencia_catalogo(p_id_habilidad);

    MERGE INTO USUARIO_HABILIDADES UH
    USING (
      SELECT p_id_usuario   AS ID_USUARIO,
             p_id_habilidad AS ID_HABILIDAD,
             p_nivel        AS NIVEL,
             p_anios_experiencia AS ANIOS_EXPERIENCIA,
             NVL(p_cantidad_respaldo,0) AS CANTIDAD_RESPALDO
      FROM DUAL
    ) S
    ON (UH.ID_USUARIO = S.ID_USUARIO AND UH.ID_HABILIDAD = S.ID_HABILIDAD)
    WHEN MATCHED THEN UPDATE SET
         UH.NIVEL = S.NIVEL,
         UH.ANIOS_EXPERIENCIA = S.ANIOS_EXPERIENCIA,
         UH.CANTIDAD_RESPALDO = S.CANTIDAD_RESPALDO
    WHEN NOT MATCHED THEN
      INSERT (ID_USUARIO, ID_HABILIDAD, NIVEL, ANIOS_EXPERIENCIA, CANTIDAD_RESPALDO)
      VALUES (S.ID_USUARIO, S.ID_HABILIDAD, S.NIVEL, S.ANIOS_EXPERIENCIA, S.CANTIDAD_RESPALDO);
  END sp_upsert_habilidad_usuario;

  PROCEDURE sp_upsert_habilidad_usuario_by_nombre(
    p_id_usuario         IN NUMBER,
    p_nombre_habilidad   IN VARCHAR2,
    p_nivel              IN NUMBER,
    p_anios_experiencia  IN NUMBER,
    p_cantidad_respaldo  IN NUMBER,
    o_id_habilidad       OUT NUMBER
  ) IS
  BEGIN
    -- Busca la habilidad por nombre (case-insensitive, ajusta si prefieres exact match)
    SELECT ID_HABILIDAD INTO o_id_habilidad
      FROM HABILIDADES
     WHERE UPPER(NOMBRE) = UPPER(TRIM(p_nombre_habilidad))
     FETCH FIRST 1 ROWS ONLY;

    sp_upsert_habilidad_usuario(
      p_id_usuario, o_id_habilidad, p_nivel, p_anios_experiencia, p_cantidad_respaldo
    );
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20130, 'La habilidad indicada no existe en el catálogo.');
  END sp_upsert_habilidad_usuario_by_nombre;

  ------------------------------------------------------------------------------
  -- Lecturas
  ------------------------------------------------------------------------------
  PROCEDURE sp_obtener_habilidad_usuario(
    p_id_usuario         IN  NUMBER,
    p_id_habilidad       IN  NUMBER,
    o_nivel              OUT NUMBER,
    o_anios_experiencia  OUT NUMBER,
    o_cantidad_respaldo  OUT NUMBER,
    o_existe             OUT NUMBER
  ) IS
  BEGIN
    BEGIN
      SELECT NIVEL, ANIOS_EXPERIENCIA, CANTIDAD_RESPALDO
        INTO o_nivel, o_anios_experiencia, o_cantidad_respaldo
        FROM USUARIO_HABILIDADES
       WHERE ID_USUARIO = p_id_usuario
         AND ID_HABILIDAD = p_id_habilidad;

      o_existe := 1;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        o_nivel := NULL;
        o_anios_experiencia := NULL;
        o_cantidad_respaldo := NULL;
        o_existe := 0;
    END;
  END sp_obtener_habilidad_usuario;

  PROCEDURE sp_listar_habilidades_usuario(
    p_id_usuario IN NUMBER,
    o_items      OUT SYS_REFCURSOR
  ) IS
  BEGIN
    OPEN o_items FOR
      SELECT UH.ID_HABILIDAD,
             H.NOMBRE,
             H.CATEGORIA,
             UH.NIVEL,
             UH.ANIOS_EXPERIENCIA,
             UH.CANTIDAD_RESPALDO
        FROM USUARIO_HABILIDADES UH
        JOIN HABILIDADES H ON H.ID_HABILIDAD = UH.ID_HABILIDAD
       WHERE UH.ID_USUARIO = p_id_usuario
       ORDER BY UH.NIVEL DESC NULLS LAST,
                UH.ANIOS_EXPERIENCIA DESC NULLS LAST,
                H.NOMBRE ASC;
  END sp_listar_habilidades_usuario;

  ------------------------------------------------------------------------------
  -- Utilidades
  ------------------------------------------------------------------------------
  PROCEDURE sp_incrementar_respaldo(
    p_id_usuario    IN NUMBER,
    p_id_habilidad  IN NUMBER,
    p_delta         IN NUMBER
  ) IS
  BEGIN
    IF p_delta = 0 THEN
      RETURN;
    END IF;

    UPDATE USUARIO_HABILIDADES
       SET CANTIDAD_RESPALDO = GREATEST(0, NVL(CANTIDAD_RESPALDO,0) + p_delta)
     WHERE ID_USUARIO = p_id_usuario
       AND ID_HABILIDAD = p_id_habilidad;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20140, 'No existe la relación usuario/habilidad para ajustar respaldos.');
    END IF;
  END sp_incrementar_respaldo;

  PROCEDURE sp_usuario_habilidades_chk(
    p_id_usuario          IN  NUMBER,
    o_total_habilidades   OUT NUMBER,
    o_promedio_nivel      OUT NUMBER,
    o_max_nivel           OUT NUMBER,
    o_min_nivel           OUT NUMBER
  ) IS
  BEGIN
    SELECT COUNT(*)
      INTO o_total_habilidades
      FROM USUARIO_HABILIDADES
     WHERE ID_USUARIO = p_id_usuario;

    -- Promedio solo sobre niveles informados (no nulos)
    SELECT AVG(NIVEL), MAX(NIVEL), MIN(NIVEL)
      INTO o_promedio_nivel, o_max_nivel, o_min_nivel
      FROM USUARIO_HABILIDADES
     WHERE ID_USUARIO = p_id_usuario
       AND NIVEL IS NOT NULL;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      o_total_habilidades := 0;
      o_promedio_nivel := NULL;
      o_max_nivel := NULL;
      o_min_nivel := NULL;
  END sp_usuario_habilidades_chk;

END sp_usuario_habilidades_pkg;
/
