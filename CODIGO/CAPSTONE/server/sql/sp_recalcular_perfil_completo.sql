create or replace PROCEDURE sp_recalcular_perfil_completo(p_id_usuario IN NUMBER) IS
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM perfiles
  WHERE id_usuario = p_id_usuario
    AND nombre_mostrar IS NOT NULL
    AND titular IS NOT NULL
    AND biografia IS NOT NULL AND LENGTH(biografia) >= 80
    AND pais IS NOT NULL
    AND ciudad IS NOT NULL
    AND url_avatar IS NOT NULL;

  IF v_count > 0 THEN
    UPDATE perfiles
    SET perfil_completo = 'S'
    WHERE id_usuario = p_id_usuario;
  ELSE
    UPDATE perfiles
    SET perfil_completo = 'N'
    WHERE id_usuario = p_id_usuario;
  END IF;

  COMMIT;
END;