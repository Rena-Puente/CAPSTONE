create or replace PROCEDURE sp_revocar_refresh(p_refresh_token IN VARCHAR2) AS
  v_user NUMBER;
BEGIN
  UPDATE refresh_tokens
     SET revocado = 'S'
   WHERE token_hash = fn_hash_pw(p_refresh_token)
   RETURNING id_usuario INTO v_user;

  -- opcional: revocar todas las sesiones vigentes del usuario
  UPDATE sesiones_usuario
     SET revocado = 'S'
   WHERE id_usuario = v_user
     AND expira_token > SYSTIMESTAMP;
END;
