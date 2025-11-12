CREATE OR REPLACE PROCEDURE sp_confirmar_verificacion_correo (
    p_token     IN VARCHAR2,
    o_resultado OUT VARCHAR2
) AS
    v_id_usuario usuarios_verificacion.id_usuario%TYPE;
    v_consumido  usuarios_verificacion.consumido%TYPE;
    v_expira     usuarios_verificacion.expira%TYPE;
BEGIN
    IF p_token IS NULL OR TRIM(p_token) = '' THEN
        o_resultado := 'ERROR:TOKEN_REQUIRED';
        RETURN;
    END IF;

    BEGIN
        SELECT id_usuario,
               consumido,
               expira
          INTO v_id_usuario,
               v_consumido,
               v_expira
          FROM usuarios_verificacion
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

    UPDATE usuarios_verificacion
       SET consumido = 'S',
           fecha_consumo = SYSTIMESTAMP
     WHERE token = TRIM(p_token);

    UPDATE usuarios
       SET activo = 1,
           fecha_actualizacion = SYSTIMESTAMP
     WHERE id_usuario = v_id_usuario;

    COMMIT;
    o_resultado := 'OK';
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        o_resultado := 'ERROR:' || SQLERRM;
END sp_confirmar_verificacion_correo;
/

