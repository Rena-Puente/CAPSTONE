CREATE OR REPLACE PACKAGE carreras_pkg AS
  PROCEDURE sp_carrera_crear(
    p_categoria   IN  VARCHAR2,
    p_carrera     IN  VARCHAR2,
    o_id_carrera  OUT NUMBER
  );

  PROCEDURE sp_carrera_eliminar(
    p_id_carrera IN NUMBER   DEFAULT NULL,
    p_categoria  IN VARCHAR2 DEFAULT NULL,
    p_carrera    IN VARCHAR2 DEFAULT NULL
  );

  FUNCTION fn_carreras_por_categoria_json(
    p_categoria IN VARCHAR2 DEFAULT NULL
  ) RETURN CLOB;
END carreras_pkg;
/



CREATE OR REPLACE PACKAGE BODY carreras_pkg AS

  --------------------------------------------------------------------
  -- Crear carrera (con validaciones y prevención de duplicados)
  --------------------------------------------------------------------
  PROCEDURE sp_carrera_crear(
    p_categoria   IN  VARCHAR2,
    p_carrera     IN  VARCHAR2,
    o_id_carrera  OUT NUMBER
  ) AS
    v_dummy NUMBER;
  BEGIN
    IF p_categoria IS NULL OR TRIM(p_categoria) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20001, 'La categoría es obligatoria.');
    END IF;
    IF p_carrera IS NULL OR TRIM(p_carrera) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20002, 'La carrera es obligatoria.');
    END IF;

    -- prevenir duplicado (categoria + carrera) case/space-insensitive
    BEGIN
      SELECT 1 INTO v_dummy
        FROM carreras
       WHERE UPPER(TRIM(categoria)) = UPPER(TRIM(p_categoria))
         AND UPPER(TRIM(carrera))   = UPPER(TRIM(p_carrera))
       FETCH FIRST 1 ROWS ONLY;
      RAISE_APPLICATION_ERROR(-20003, 'Ya existe esa carrera en la categoría indicada.');
    EXCEPTION
      WHEN NO_DATA_FOUND THEN NULL;
    END;

    INSERT INTO carreras (categoria, carrera)
    VALUES (TRIM(p_categoria), TRIM(p_carrera))
    RETURNING id_carrera INTO o_id_carrera;

    COMMIT;
  END sp_carrera_crear;

  --------------------------------------------------------------------
  -- Eliminar carrera (por id o por categoria+carrera)
  --------------------------------------------------------------------
  PROCEDURE sp_carrera_eliminar(
    p_id_carrera IN NUMBER   DEFAULT NULL,
    p_categoria  IN VARCHAR2 DEFAULT NULL,
    p_carrera    IN VARCHAR2 DEFAULT NULL
  ) AS
    v_count NUMBER;
  BEGIN
    IF p_id_carrera IS NULL AND (p_categoria IS NULL OR p_carrera IS NULL) THEN
      RAISE_APPLICATION_ERROR(-20010, 'Indica id_carrera o bien categoria y carrera.');
    END IF;

    IF p_id_carrera IS NOT NULL THEN
      DELETE FROM carreras WHERE id_carrera = p_id_carrera;
    ELSE
      DELETE FROM carreras
       WHERE UPPER(TRIM(categoria)) = UPPER(TRIM(p_categoria))
         AND UPPER(TRIM(carrera))   = UPPER(TRIM(p_carrera));
    END IF;

    v_count := SQL%ROWCOUNT;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(-20011, 'No se encontró la carrera a eliminar.');
    END IF;

    COMMIT;
  END sp_carrera_eliminar;

  --------------------------------------------------------------------
  -- Listar como JSON agrupado por categoría (ordenado y compatible)
  -- Formato:
  -- [
  --   {"categoria":"X","items":[{"id":1,"carrera":"A"}, ...]},
  --   {"categoria":"Y","items":[...]}
  -- ]
  --------------------------------------------------------------------
  FUNCTION fn_carreras_por_categoria_json(
    p_categoria IN VARCHAR2 DEFAULT NULL
  ) RETURN CLOB IS
    v_json  CLOB;
  BEGIN
    /*
      Notas de implementación:
      - Se usa XMLAGG para concatenar piezas JSON en CLOB con ORDER BY,
        evitando problemas de versiones con JSON_ARRAYAGG ORDER BY.
      - Se garantizan dos órdenes:
          * Categorías: alfabético
          * Carreras dentro de cada categoría: alfabético
    */

    SELECT
      '[' ||
      RTRIM(
        XMLCAST(
          XMLAGG(
            XMLELEMENT(e, cat_json || ',')
            ORDER BY categoria
          ) AS CLOB
        ),
        ','
      ) ||
      ']'
    INTO v_json
    FROM (
      SELECT
        categoria,
        -- pieza JSON por categoría
        JSON_OBJECT(
          'categoria' VALUE categoria,
          'items'     VALUE (
            -- array JSON de items (id/carrera) ordenados
            '[' ||
            RTRIM(
              XMLCAST(
                XMLAGG(
                  XMLELEMENT(e,
                    JSON_OBJECT(
                      'id'      VALUE id_carrera,
                      'carrera' VALUE carrera
                      RETURNING CLOB
                    ) || ','
                  )
                  ORDER BY carrera
                ) AS CLOB
              ),
              ','
            ) ||
            ']'
          )
          RETURNING CLOB
        ) AS cat_json
      FROM carreras
      WHERE p_categoria IS NULL OR categoria = p_categoria
      GROUP BY categoria
    );

    RETURN v_json;
  END fn_carreras_por_categoria_json;

END carreras_pkg;
/
