create or replace FUNCTION fn_get_role_from_access(p_token IN VARCHAR2)
  RETURN NUMBER
IS
  v_role usuarios.id_tipo_usuario%TYPE;
BEGIN
  SELECT u.id_tipo_usuario
    INTO v_role
    FROM sesiones_usuario s
       JOIN usuarios u
      ON u.id_usuario = s.id_usuario
   WHERE s.token_acceso = TRIM(p_token)
     AND NVL(s.revocado, 'N') = 'N'
     AND s.expira_token > SYSTIMESTAMP
    FETCH FIRST 1 ROW ONLY;
  RETURN v_role;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN NULL;
END;
/