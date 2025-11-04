create or replace PROCEDURE sp_emitir_sesion(
  p_id_usuario     IN  NUMBER,
  p_minutos_access IN  NUMBER   DEFAULT 15,
  p_dias_refresh   IN  NUMBER   DEFAULT 30,
  p_ip             IN  VARCHAR2 DEFAULT NULL,
  p_ua             IN  VARCHAR2 DEFAULT NULL,
  o_access_token   OUT VARCHAR2,
  o_refresh_token  OUT VARCHAR2,
  o_expira_access  OUT TIMESTAMP,
  o_expira_refresh OUT TIMESTAMP
) AS
  v_access  VARCHAR2(256);
  v_refresh VARCHAR2(256);
BEGIN
  v_access  := gen_token(64);   -- access
  v_refresh := gen_token(96);   -- refresh

  o_access_token  := v_access;
  o_refresh_token := v_refresh;

  o_expira_access  := SYSTIMESTAMP + NUMTODSINTERVAL(p_minutos_access, 'MINUTE');
  o_expira_refresh := SYSTIMESTAMP + NUMTODSINTERVAL(p_dias_refresh,   'DAY');

  INSERT INTO sesiones_usuario (
    id_usuario, token_acceso, expira_token, ip_creacion, user_agent
  ) VALUES (
    p_id_usuario, v_access, o_expira_access, p_ip, p_ua
  );

  INSERT INTO refresh_tokens (
    id_usuario, token_hash, expira_refresh, revocado
  ) VALUES (
    p_id_usuario, fn_hash_pw(v_refresh), o_expira_refresh, 'N'
  );

  COMMIT;
END;