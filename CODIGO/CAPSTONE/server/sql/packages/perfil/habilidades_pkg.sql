CREATE OR REPLACE PACKAGE habilidades_pkg AS

  PROCEDURE sp_habilidad_crear(
    p_nombre    IN VARCHAR2,
    p_categoria IN VARCHAR2,
    o_id        OUT NUMBER
  );

  PROCEDURE sp_habilidad_eliminar(
    p_id        IN NUMBER   DEFAULT NULL,
    p_nombre    IN VARCHAR2 DEFAULT NULL
  );

  FUNCTION fn_habilidad_listar_json(
    p_categoria IN VARCHAR2 DEFAULT NULL
  ) RETURN CLOB;

END habilidades_pkg;

CREATE OR REPLACE PACKAGE BODY habilidades_pkg AS

  --------------------------------------------------------------------
  -- Crear habilidad
  --------------------------------------------------------------------
  PROCEDURE sp_habilidad_crear(
    p_nombre    IN VARCHAR2,
    p_categoria IN VARCHAR2,
    o_id        OUT NUMBER
  ) AS
    v_dummy NUMBER;
  BEGIN
    IF p_nombre IS NULL OR TRIM(p_nombre) IS NULL THEN
      RAISE_APPLICATION_ERROR(-21001, 'El nombre de la habilidad es obligatorio.');
    END IF;

    -- prevenir duplicados
    BEGIN
      SELECT 1 INTO v_dummy
      FROM habilidades
      WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(p_nombre))
      FETCH FIRST 1 ROWS ONLY;

      RAISE_APPLICATION_ERROR(-21002, 'La habilidad ya existe.');
    EXCEPTION
      WHEN NO_DATA_FOUND THEN NULL;
    END;

    INSERT INTO habilidades (nombre, categoria)
    VALUES (TRIM(p_nombre), TRIM(p_categoria))
    RETURNING id_habilidad INTO o_id;

    COMMIT;
  END sp_habilidad_crear;

  --------------------------------------------------------------------
  -- Eliminar habilidad
  --------------------------------------------------------------------
  PROCEDURE sp_habilidad_eliminar(
    p_id     IN NUMBER   DEFAULT NULL,
    p_nombre IN VARCHAR2 DEFAULT NULL
  ) AS
    v_count NUMBER;
  BEGIN
    IF p_id IS NULL AND (p_nombre IS NULL OR TRIM(p_nombre) IS NULL) THEN
      RAISE_APPLICATION_ERROR(-21010, 'Indica p_id o p_nombre.');
    END IF;

    IF p_id IS NOT NULL THEN
      DELETE FROM habilidades WHERE id_habilidad = p_id;
    ELSE
      DELETE FROM habilidades
      WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(p_nombre));
    END IF;

    v_count := SQL%ROWCOUNT;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(-21011, 'No se encontró la habilidad a eliminar.');
    END IF;

    COMMIT;
  END sp_habilidad_eliminar;

  --------------------------------------------------------------------
  -- Listar habilidades como JSON
  -- Orden alfabético: primero por categoría, luego por nombre
  --------------------------------------------------------------------
  FUNCTION fn_habilidad_listar_json(
    p_categoria IN VARCHAR2 DEFAULT NULL
  ) RETURN CLOB IS
    v_json CLOB;
  BEGIN
    SELECT
      '[' ||
      NVL(
        RTRIM(
          XMLCAST(
            XMLAGG(
              XMLELEMENT(e,
                JSON_OBJECT(
                  'id'        VALUE id_habilidad,
                  'nombre'    VALUE nombre,
                  'categoria' VALUE categoria
                  RETURNING CLOB
                ) || ','
              )
              ORDER BY LOWER(TRIM(categoria)), LOWER(TRIM(nombre))
            ) AS CLOB
          ),
          ','
        ),
        ''
      ) ||
      ']'
    INTO v_json
    FROM habilidades
    WHERE
      p_categoria IS NULL
      OR UPPER(TRIM(categoria)) = UPPER(TRIM(p_categoria));

    RETURN NVL(v_json, '[]');

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN '[]';
  END fn_habilidad_listar_json;

END habilidades_pkg;