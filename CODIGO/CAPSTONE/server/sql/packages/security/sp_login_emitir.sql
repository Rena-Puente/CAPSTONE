CREATE OR REPLACE PROCEDURE sp_login_emitir(
  p_correo          IN  VARCHAR2,
  p_password        IN  VARCHAR2,
  p_ip              IN  VARCHAR2 DEFAULT NULL,
  p_ua              IN  VARCHAR2 DEFAULT NULL,
  o_id_usuario      OUT NUMBER,
  o_id_tipo_usuario OUT NUMBER,
  o_access_token    OUT VARCHAR2,
  o_refresh_token   OUT VARCHAR2,
  o_expira_access   OUT TIMESTAMP,
  o_expira_refresh  OUT TIMESTAMP
) AS
  v_salt   VARCHAR2(64);
  v_iters  NUMBER;
  v_hash   VARCHAR2(64);
  v_hash_db VARCHAR2(64);
  v_activo NUMBER;
BEGIN
  -- Trae credenciales y rol del usuario
  SELECT id_usuario, id_tipo_usuario, pw_salt, pw_iters, contrasena_hash, activo
    INTO o_id_usuario, o_id_tipo_usuario, v_salt, v_iters, v_hash_db, v_activo
    FROM usuarios
   WHERE LOWER(TRIM(correo)) = LOWER(TRIM(p_correo))
   FETCH FIRST 1 ROWS ONLY;

  IF v_activo <> 1 THEN
    RAISE_APPLICATION_ERROR(-20050, 'Usuario inactivo.');
  END IF;

  -- Recalcula hash con salt+iters
  v_hash := fn_hash_pw_salted(TRIM(p_password), v_salt, v_iters);

  IF v_hash <> v_hash_db THEN
    RAISE_APPLICATION_ERROR(-20051, 'Credenciales inválidas.');
  END IF;

  -- Emite sesión (usa tu SP existente)
  sp_emitir_sesion(
    p_id_usuario     => o_id_usuario,
    p_minutos_access => 15,
    p_dias_refresh   => 30,
    p_ip             => p_ip,
    p_ua             => p_ua,
    o_access_token   => o_access_token,
    o_refresh_token  => o_refresh_token,
    o_expira_access  => o_expira_access,
    o_expira_refresh => o_expira_refresh
  );
END;
/
