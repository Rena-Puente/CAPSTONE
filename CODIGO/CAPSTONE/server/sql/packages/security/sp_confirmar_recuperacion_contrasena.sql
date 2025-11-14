-- Procedimiento que valida un token de recuperación vigente, actualiza la
-- contraseña del usuario encriptándola con salt+iteraciones y marca el token
-- como consumido. Revoca cualquier sesión o refresh token activo asociado.
CREATE OR REPLACE PROCEDURE sp_confirmar_recuperacion_contrasena (
    p_token      IN VARCHAR2,
    p_password   IN VARCHAR2,
    p_password2  IN VARCHAR2,
    o_resultado  OUT VARCHAR2
) AS
    v_id_usuario   usuarios_recuperacion.id_usuario%TYPE;
    v_consumido    usuarios_recuperacion.consumido%TYPE;
    v_expira       usuarios_recuperacion.expira%TYPE;
    v_iters_actual usuarios.pw_iters%TYPE;
    v_iters_nuevo  usuarios.pw_iters%TYPE;
    v_salt_nuevo   usuarios.pw_salt%TYPE;
    v_hash_nuevo   usuarios.contrasena_hash%TYPE;
BEGIN
    o_resultado := 'OK';

    IF p_token IS NULL OR TRIM(p_token) = '' THEN
        o_resultado := 'ERROR:TOKEN_REQUIRED';
        RETURN;
    END IF;

    IF p_password IS NULL OR p_password2 IS NULL
       OR TRIM(p_password) = '' OR TRIM(p_password2) = '' THEN
        o_resultado := 'ERROR:PASS_REQUIRED';
        RETURN;
    END IF;

    IF p_password <> p_password2 THEN
        o_resultado := 'ERROR:PASS_NO_MATCH';
        RETURN;
    END IF;

    BEGIN
        SELECT id_usuario,
               consumido,
               expira
          INTO v_id_usuario,
               v_consumido,
               v_expira
          FROM usuarios_recuperacion
         WHERE token = TRIM(p_token)
         ORDER BY fecha_creacion DESC
         FETCH FIRST 1 ROWS ONLY;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            o_resultado := 'ERROR:TOKEN_INVALID';
            RETURN;
    END;

    IF v_consumido = 'S' THEN
        o_resultado := 'ERROR:TOKEN_USED';
        RETURN;
    END IF;

    IF v_expira IS NOT NULL AND v_expira < SYSTIMESTAMP THEN
        o_resultado := 'ERROR:TOKEN_EXPIRED';
        RETURN;
    END IF;

    BEGIN
        SELECT NVL(pw_iters, 100000)
          INTO v_iters_actual
          FROM usuarios
         WHERE id_usuario = v_id_usuario
         FOR UPDATE;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            o_resultado := 'ERROR:USER_NOT_FOUND';
            RETURN;
    END;

    v_iters_nuevo := CASE
        WHEN v_iters_actual IS NULL OR v_iters_actual < 10000 THEN 100000
        ELSE v_iters_actual
    END;

    v_salt_nuevo := LOWER(DBMS_RANDOM.STRING('X', 32));
    v_hash_nuevo := fn_hash_pw_salted(TRIM(p_password), v_salt_nuevo, v_iters_nuevo);

    UPDATE usuarios
       SET contrasena_hash    = v_hash_nuevo,
           pw_salt            = v_salt_nuevo,
           pw_iters           = v_iters_nuevo,
           fecha_actualizacion = SYSTIMESTAMP
     WHERE id_usuario = v_id_usuario;

    UPDATE usuarios_recuperacion
       SET consumido     = 'S',
           fecha_consumo = SYSTIMESTAMP
     WHERE token = TRIM(p_token);

    UPDATE sesiones_usuario
       SET revocado = 'S'
     WHERE id_usuario = v_id_usuario
       AND NVL(revocado, 'N') = 'N';

    UPDATE refresh_tokens
       SET revocado = 'S'
     WHERE id_usuario = v_id_usuario
       AND NVL(revocado, 'N') = 'N';

    COMMIT;
    o_resultado := 'OK';
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        o_resultado := 'ERROR:' || SQLERRM;
END sp_confirmar_recuperacion_contrasena;
/
