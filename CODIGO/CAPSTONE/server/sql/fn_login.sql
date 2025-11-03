create or replace FUNCTION fn_login(p_correo IN VARCHAR2, p_password IN VARCHAR2)
  RETURN NUMBER
AS
  v_id NUMBER;
BEGIN
  SELECT id_usuario
    INTO v_id
    FROM usuarios
   WHERE LOWER(TRIM(correo)) = LOWER(TRIM(p_correo))
     AND contrasena_hash = fn_hash_pw(TRIM(p_password))
     AND activo = 1;

  RETURN v_id;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN NULL;
END;
