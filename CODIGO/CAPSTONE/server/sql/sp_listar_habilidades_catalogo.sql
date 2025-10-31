CREATE OR REPLACE PROCEDURE sp_listar_habilidades_catalogo(
  p_categoria IN VARCHAR2 DEFAULT NULL,
  o_items     OUT SYS_REFCURSOR
) IS
BEGIN
  IF p_categoria IS NULL THEN
    OPEN o_items FOR
      SELECT id_habilidad, nombre, categoria
        FROM habilidades
       ORDER BY categoria ASC, nombre ASC;
  ELSE
    OPEN o_items FOR
      SELECT id_habilidad, nombre, categoria
        FROM habilidades
       WHERE UPPER(categoria) = UPPER(TRIM(p_categoria))
       ORDER BY categoria ASC, nombre ASC;
  END IF;
END sp_listar_habilidades_catalogo;
/
