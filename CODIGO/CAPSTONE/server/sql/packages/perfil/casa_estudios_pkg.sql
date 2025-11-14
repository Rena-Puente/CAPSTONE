CREATE OR REPLACE PACKAGE casa_estudios_pkg AS
  PROCEDURE sp_casa_crear(
    p_casa_estudios IN  VARCHAR2,
    o_id            OUT NUMBER
  );

  PROCEDURE sp_casa_eliminar(
    p_id            IN NUMBER   DEFAULT NULL,
    p_casa_estudios IN VARCHAR2 DEFAULT NULL
  );

  FUNCTION fn_casa_listar_json(
    p_casa_estudios IN VARCHAR2 DEFAULT NULL
  ) RETURN CLOB;
END casa_estudios_pkg;
/


CREATE OR REPLACE PACKAGE BODY casa_estudios_pkg AS

  --------------------------------------------------------------------
  -- Crear registro
  --------------------------------------------------------------------
  PROCEDURE sp_casa_crear(
    p_casa_estudios IN  VARCHAR2,
    o_id            OUT NUMBER
  ) AS
    v_dummy NUMBER;
  BEGIN
    IF p_casa_estudios IS NULL OR TRIM(p_casa_estudios) IS NULL THEN
      RAISE_APPLICATION_ERROR(-20101, 'CASA_ESTUDIOS es obligatorio.');
    END IF;

    -- Evitar duplicados por nombre (case/space-insensitive)
    BEGIN
      SELECT 1 INTO v_dummy
        FROM casa_estudios
       WHERE UPPER(TRIM(casa_estudios)) = UPPER(TRIM(p_casa_estudios))
       FETCH FIRST 1 ROWS ONLY;
      RAISE_APPLICATION_ERROR(-20102, 'La casa de estudios ya existe.');
    EXCEPTION
      WHEN NO_DATA_FOUND THEN NULL;
    END;

    INSERT INTO casa_estudios (casa_estudios)
    VALUES (TRIM(p_casa_estudios))
    RETURNING id_casa_estudios INTO o_id;

    COMMIT;
  END sp_casa_crear;

  --------------------------------------------------------------------
  -- Eliminar registro (por ID o por nombre)
  --------------------------------------------------------------------
  PROCEDURE sp_casa_eliminar(
    p_id            IN NUMBER   DEFAULT NULL,
    p_casa_estudios IN VARCHAR2 DEFAULT NULL
  ) AS
    v_count NUMBER;
  BEGIN
    IF p_id IS NULL AND (p_casa_estudios IS NULL OR TRIM(p_casa_estudios) IS NULL) THEN
      RAISE_APPLICATION_ERROR(-20110, 'Indica p_id o p_casa_estudios.');
    END IF;

    IF p_id IS NOT NULL THEN
      DELETE FROM casa_estudios WHERE id_casa_estudios = p_id;
    ELSE
      DELETE FROM casa_estudios
       WHERE UPPER(TRIM(casa_estudios)) = UPPER(TRIM(p_casa_estudios));
    END IF;

    v_count := SQL%ROWCOUNT;
    IF v_count = 0 THEN
      RAISE_APPLICATION_ERROR(-20111, 'No se encontró el registro a eliminar.');
    END IF;

    COMMIT;
  END sp_casa_eliminar;

  --------------------------------------------------------------------
  -- Listar como JSON (opcionalmente filtrado por nombre exacto)
  -- Salida: [{"id":1,"casa_estudios":"Duoc UC"}, ...]
  --------------------------------------------------------------------
FUNCTION fn_casa_listar_json(
  p_casa_estudios IN VARCHAR2 DEFAULT NULL
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
                'id'            VALUE id_casa_estudios,
                'casa_estudios' VALUE casa_estudios
                RETURNING CLOB
              ) || ','
            )
            ORDER BY LOWER(casa_estudios)
          ) AS CLOB
        ),
        ','
      ),
      ''
    ) ||
    ']'
  INTO v_json
  FROM casa_estudios
  WHERE
    p_casa_estudios IS NULL
    OR UPPER(TRIM(casa_estudios)) = UPPER(TRIM(p_casa_estudios));

  RETURN NVL(v_json, '[]');

EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN '[]';
END fn_casa_listar_json;


END casa_estudios_pkg;
/
