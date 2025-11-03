create or replace PROCEDURE sp_revocar_access(p_access_token IN VARCHAR2) AS
BEGIN
  UPDATE sesiones_usuario
     SET revocado = 'S'
   WHERE token_acceso = p_access_token;
END;
