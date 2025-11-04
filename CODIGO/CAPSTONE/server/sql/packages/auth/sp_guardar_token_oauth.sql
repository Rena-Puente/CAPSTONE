create or replace PROCEDURE sp_guardar_token_oauth(
  p_id_usuario    IN NUMBER,
  p_proveedor     IN VARCHAR2,
  p_provider_id   IN VARCHAR2,
  p_access_token  IN VARCHAR2,
  p_refresh_token IN VARCHAR2,
  p_scope         IN VARCHAR2,
  p_expira        IN DATE
) AS
  v_proveedor VARCHAR2(100);
BEGIN
  v_proveedor := UPPER(TRIM(p_proveedor));

  MERGE INTO admin.cuentas_oauth o
  USING (
    SELECT p_id_usuario      AS id_usuario,
           v_proveedor       AS proveedor,
           p_provider_id     AS id_proveedor_usuario
      FROM dual
  ) src
  ON (
    o.id_usuario            = src.id_usuario
    AND o.proveedor         = src.proveedor
    AND o.id_proveedor_usuario = src.id_proveedor_usuario
  )
  WHEN MATCHED THEN
    UPDATE SET
      o.token_acceso    = p_access_token,
      o.token_refresco  = p_refresh_token,
      o.alcance_token   = p_scope,
      o.expira_token    = p_expira
  WHEN NOT MATCHED THEN
    INSERT (
      id_usuario,
      proveedor,
      id_proveedor_usuario,
      token_acceso,
      token_refresco,
      alcance_token,
      expira_token
    ) VALUES (
      p_id_usuario,
      v_proveedor,
      p_provider_id,
      p_access_token,
      p_refresh_token,
      p_scope,
      p_expira
    );
END sp_guardar_token_oauth;