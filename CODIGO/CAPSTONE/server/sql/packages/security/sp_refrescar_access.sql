create or replace PROCEDURE sp_refrescar_access(
  p_refresh_token IN  VARCHAR2,
  o_access_token  OUT VARCHAR2,
  o_expira_access OUT TIMESTAMP
) AS
  v_id_usuario  NUMBER;
BEGIN
  -- validar refresh por HASH + vigencia + no revocado
  SELECT id_usuario
    INTO v_id_usuario
    FROM refresh_tokens
   WHERE token_hash = fn_hash_pw(p_refresh_token)
     AND NVL(revocado,'N') = 'N'
     AND expira_refresh > SYSTIMESTAMP
   FETCH FIRST 1 ROWS ONLY;

  o_access_token  := gen_token(64);
  o_expira_access := SYSTIMESTAMP + INTERVAL '15' MINUTE;

  INSERT INTO sesiones_usuario (id_usuario, token_acceso, expira_token)
  VALUES (v_id_usuario, o_access_token, o_expira_access);
END;