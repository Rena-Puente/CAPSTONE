create or replace FUNCTION fn_login(
  p_correo   IN VARCHAR2,
  p_password IN VARCHAR2
) RETURN NUMBER
AS
  v_id       NUMBER;
  v_salt     VARCHAR2(64);
  v_iters    NUMBER;
  v_hash_db  VARCHAR2(64);
  v_hash_in  VARCHAR2(64);
  v_activo   NUMBER;
BEGIN
  -- Trae credenciales y estado
  SELECT id_usuario, pw_salt, pw_iters, contrasena_hash, activo
    INTO v_id,      v_salt,  v_iters,  v_hash_db,       v_activo
    FROM usuarios
   WHERE LOWER(TRIM(correo)) = LOWER(TRIM(p_correo))
   FETCH FIRST 1 ROWS ONLY;

  IF v_activo <> 1 THEN
    RETURN NULL;
  END IF;

  -- Recalcula el hash con salt + iteraciones
  v_hash_in := fn_hash_pw_salted(TRIM(p_password), v_salt, v_iters);

  IF v_hash_in = v_hash_db THEN
    RETURN v_id;
  ELSE
    RETURN NULL;
  END IF;

EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN NULL;
END;