create or replace PROCEDURE sp_actualizar_perfil (
  p_id_usuario     IN NUMBER,
  p_nombre_mostrar IN VARCHAR2,
  p_titular        IN VARCHAR2,
  p_biografia      IN VARCHAR2,
  p_pais           IN VARCHAR2,
  p_ciudad         IN VARCHAR2,
  p_url_avatar     IN VARCHAR2
) AS
BEGIN
  UPDATE perfiles
  SET nombre_mostrar = p_nombre_mostrar,
      titular        = p_titular,
      biografia      = p_biografia,
      pais           = p_pais,
      ciudad         = p_ciudad,
      url_avatar     = p_url_avatar
  WHERE id_usuario = p_id_usuario;

  -- recalcular automáticamente si está completo
  sp_recalcular_perfil_completo(p_id_usuario);

  COMMIT;
END;