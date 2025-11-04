create or replace PROCEDURE sp_registrar_usuario (
    p_correo      IN VARCHAR2,
    p_password    IN VARCHAR2,
    p_password2   IN VARCHAR2,
    p_resultado   OUT VARCHAR2
) AS
    v_count   NUMBER;
BEGIN
    -- Validar que las contraseñas coincidan
    IF p_password <> p_password2 THEN
        p_resultado := 'ERROR:PASS_NO_MATCH';
        RETURN;
    END IF;

    -- Verificar si ya existe el correo (case-insensitive)
    SELECT COUNT(*)
      INTO v_count
      FROM usuarios
     WHERE LOWER(correo) = LOWER(p_correo);

    IF v_count > 0 THEN
        p_resultado := 'ERROR:EMAIL_EXISTS';
        RETURN;
    END IF;

    -- Insertar el nuevo usuario (elige una de estas dos líneas según tu modelo)
    INSERT INTO usuarios (id_usuario, correo, contrasena_hash, activo)
    VALUES ( /* seq_usuarios.NEXTVAL */ (SELECT NVL(MAX(id_usuario),0)+1 FROM usuarios),
             p_correo,
             fn_hash_pw(p_password),   -- <- mismo hash que usa fn_login
             1 );

    COMMIT;
    p_resultado := 'OK';
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        p_resultado := 'ERROR:' || SQLERRM;
END sp_registrar_usuario;