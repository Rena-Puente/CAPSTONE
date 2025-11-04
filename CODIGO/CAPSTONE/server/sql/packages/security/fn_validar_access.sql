create or replace FUNCTION fn_validar_access(p_token IN VARCHAR2)
RETURN NUMBER
IS
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO v_count
    FROM sesiones_usuario
   WHERE token_acceso = p_token
     AND NVL(revocado,'N') = 'N'
     AND expira_token > SYSTIMESTAMP;

  RETURN CASE WHEN v_count = 1 THEN 1 ELSE 0 END;
END;