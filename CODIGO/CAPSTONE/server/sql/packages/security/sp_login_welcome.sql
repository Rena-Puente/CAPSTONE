CREATE OR REPLACE PROCEDURE sp_login_welcome(
  p_correo          IN  VARCHAR2,
  p_password        IN  VARCHAR2,
  p_ip              IN  VARCHAR2 DEFAULT NULL,
  p_ua              IN  VARCHAR2 DEFAULT NULL,
  o_id_usuario      OUT NUMBER,
  o_id_tipo_usuario OUT NUMBER,
  o_id_empresa      OUT NUMBER,
  o_access_token    OUT VARCHAR2,
  o_refresh_token   OUT VARCHAR2,
  o_expira_access   OUT TIMESTAMP,
  o_expira_refresh  OUT TIMESTAMP
) AS
  c_tipo_usuario_empresa CONSTANT NUMBER := 3;
  v_email_normal    usuarios.correo%TYPE;
  v_password_input  VARCHAR2(4000);
  v_sync_usuario    usuarios.id_usuario%TYPE;
  v_empresa_id      empresas.id_empresa%TYPE;
BEGIN
  o_id_usuario := NULL;
  o_id_tipo_usuario := NULL;
  o_id_empresa := NULL;
  o_access_token := NULL;
  o_refresh_token := NULL;
  o_expira_access := NULL;
  o_expira_refresh := NULL;

  v_email_normal := TRIM(p_correo);
  v_password_input := p_password;

  IF v_email_normal IS NULL OR v_email_normal = '' THEN
    RAISE_APPLICATION_ERROR(-20060, 'El correo es obligatorio para iniciar sesión.');
  END IF;

  IF v_password_input IS NULL OR v_password_input = '' THEN
    RAISE_APPLICATION_ERROR(-20061, 'La contraseña es obligatoria para iniciar sesión.');
  END IF;

  v_email_normal := LOWER(v_email_normal);

  sp_empresas_pkg.sp_preparar_login_empresa(
    p_email      => v_email_normal,
    p_contrasena => v_password_input,
    o_id_usuario => v_sync_usuario,
    o_id_empresa => v_empresa_id
  );

  IF v_empresa_id IS NOT NULL THEN
    o_id_empresa := v_empresa_id;
  END IF;

  sp_login_emitir(
    p_correo          => v_email_normal,
    p_password        => v_password_input,
    p_ip              => p_ip,
    p_ua              => p_ua,
    o_id_usuario      => o_id_usuario,
    o_id_tipo_usuario => o_id_tipo_usuario,
    o_access_token    => o_access_token,
    o_refresh_token   => o_refresh_token,
    o_expira_access   => o_expira_access,
    o_expira_refresh  => o_expira_refresh
  );

  IF o_id_tipo_usuario = c_tipo_usuario_empresa AND o_id_empresa IS NULL THEN
    BEGIN
      SELECT e.id_empresa
        INTO o_id_empresa
        FROM empresas e
       WHERE LOWER(TRIM(e.email)) = v_email_normal
       FETCH FIRST 1 ROWS ONLY;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        o_id_empresa := NULL;
    END;
  END IF;
END;
/