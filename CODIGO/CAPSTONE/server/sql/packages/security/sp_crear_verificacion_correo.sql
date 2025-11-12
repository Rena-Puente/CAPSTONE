CREATE OR REPLACE PROCEDURE sp_crear_verificacion_correo (
    p_id_usuario IN usuarios.id_usuario%TYPE,
    o_token      OUT VARCHAR2
) AS
    v_token     VARCHAR2(128);
    v_intentos  PLS_INTEGER := 0;
BEGIN
    IF p_id_usuario IS NULL THEN
        RAISE_APPLICATION_ERROR(-20100, 'El identificador de usuario es obligatorio.');
    END IF;

    -- Invalidar cualquier verificación previa pendiente
    UPDATE usuarios_verificacion
       SET consumido = 'S',
           fecha_consumo = SYSTIMESTAMP
     WHERE id_usuario = p_id_usuario
       AND consumido = 'N';

    LOOP
        v_token := LOWER(DBMS_RANDOM.STRING('X', 48));

        BEGIN
            INSERT INTO usuarios_verificacion (
                id_usuario,
                token,
                expira,
                consumido,
                fecha_creacion
            )
            VALUES (
                p_id_usuario,
                v_token,
                SYSTIMESTAMP + NUMTODSINTERVAL(24, 'HOUR'),
                'N',
                SYSTIMESTAMP
            );

            EXIT;
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN
                v_intentos := v_intentos + 1;

                IF v_intentos >= 5 THEN
                    RAISE_APPLICATION_ERROR(-20101, 'No se pudo generar un token de verificación único.');
                END IF;
        END;
    END LOOP;

    UPDATE usuarios
       SET activo = 0,
           fecha_actualizacion = SYSTIMESTAMP
     WHERE id_usuario = p_id_usuario;

    o_token := v_token;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END sp_crear_verificacion_correo;
/

