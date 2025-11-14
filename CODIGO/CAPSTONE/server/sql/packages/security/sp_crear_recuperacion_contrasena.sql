-- Procedimiento encargado de generar un token de recuperación de contraseña
-- para un usuario existente. La respuesta o_resultado siempre expone un
-- mensaje genérico para evitar la enumeración de correos.
CREATE OR REPLACE PROCEDURE sp_crear_recuperacion_contrasena (
    p_correo    IN VARCHAR2,
    o_token     OUT VARCHAR2,
    o_resultado OUT VARCHAR2
) AS
    v_correo_normal usuarios.correo%TYPE;
    v_id_usuario    usuarios.id_usuario%TYPE;
    v_token         VARCHAR2(128);
    v_intentos      PLS_INTEGER := 0;
BEGIN
    o_token := NULL;
    o_resultado := 'OK';

    IF p_correo IS NULL OR TRIM(p_correo) = '' THEN
        o_resultado := 'ERROR:EMAIL_REQUIRED';
        RETURN;
    END IF;

    v_correo_normal := LOWER(TRIM(p_correo));

    BEGIN
        SELECT id_usuario
          INTO v_id_usuario
          FROM usuarios
         WHERE LOWER(TRIM(correo)) = v_correo_normal
         FETCH FIRST 1 ROWS ONLY;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            o_resultado := 'OK';
            RETURN; -- no revelamos si el correo existe o no
    END;

    UPDATE usuarios_recuperacion
       SET consumido = 'S',
           fecha_consumo = SYSTIMESTAMP
     WHERE id_usuario = v_id_usuario
       AND consumido = 'N';

    LOOP
        v_token := LOWER(DBMS_RANDOM.STRING('X', 48));

        BEGIN
            INSERT INTO usuarios_recuperacion (
                id_usuario,
                token,
                expira,
                consumido,
                fecha_creacion
            )
            VALUES (
                v_id_usuario,
                v_token,
                SYSTIMESTAMP + NUMTODSINTERVAL(1, 'HOUR'),
                'N',
                SYSTIMESTAMP
            );

            EXIT;
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN
                v_intentos := v_intentos + 1;

                IF v_intentos >= 5 THEN
                    ROLLBACK;
                    o_resultado := 'ERROR:TOKEN_GENERATION';
                    RETURN;
                END IF;
        END;
    END LOOP;

    o_token := v_token;
    o_resultado := 'OK';
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        o_token := NULL;
        o_resultado := 'ERROR:' || SQLERRM;
END sp_crear_recuperacion_contrasena;
/
