CREATE OR REPLACE PROCEDURE sp_registrar_usuario (
    p_correo      IN VARCHAR2,
    p_password    IN VARCHAR2,
    p_password2   IN VARCHAR2,
    p_resultado   OUT VARCHAR2
) AS
    v_count     NUMBER;
    v_salt      VARCHAR2(32);
    v_iters     PLS_INTEGER := 10000; -- define tu estándar (mismo que usarás siempre)
    v_hash      VARCHAR2(64);
BEGIN
    -- Validar email
    IF p_correo IS NULL OR TRIM(p_correo) = '' THEN
        p_resultado := 'ERROR:EMAIL_REQUIRED';
        RETURN;
    END IF;

    -- Validar contraseñas
    IF p_password IS NULL OR p_password2 IS NULL
       OR TRIM(p_password) = '' OR TRIM(p_password2) = '' THEN
        p_resultado := 'ERROR:PASS_REQUIRED';
        RETURN;
    END IF;

    IF p_password <> p_password2 THEN
        p_resultado := 'ERROR:PASS_NO_MATCH';
        RETURN;
    END IF;

    -- Verificar si ya existe el correo
    SELECT COUNT(*)
      INTO v_count
      FROM usuarios
     WHERE LOWER(TRIM(correo)) = LOWER(TRIM(p_correo));

    IF v_count > 0 THEN
        p_resultado := 'ERROR:EMAIL_EXISTS';
        RETURN;
    END IF;

    -- Generar salt
    v_salt := LOWER(DBMS_RANDOM.STRING('X', 32)); -- 32 chars hex-like

    -- Generar hash con salt + iteraciones
    v_hash := fn_hash_pw_salted(TRIM(p_password), v_salt, v_iters);

    INSERT INTO usuarios (
        id_usuario,
        correo,
        contrasena_hash,
        pw_salt,
        pw_iters,
        activo
    )
    VALUES (
        (SELECT NVL(MAX(id_usuario),0)+1 FROM usuarios), -- mejor usar SEQ real
        LOWER(TRIM(p_correo)),
        v_hash,
        v_salt,
        v_iters,
        1
    );

    COMMIT;
    p_resultado := 'OK';

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        p_resultado := 'ERROR:' || SQLERRM;
END sp_registrar_usuario;