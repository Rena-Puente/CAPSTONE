create or replace FUNCTION fn_get_usuario_oauth(
    p_proveedor   IN VARCHAR2,
    p_provider_id IN VARCHAR2
) RETURN NUMBER IS
    v_id_usuario NUMBER;
BEGIN
    SELECT o.id_usuario
    INTO   v_id_usuario
    FROM   admin.cuentas_oauth o
    WHERE  o.proveedor = p_proveedor
       AND o.id_proveedor_usuario = p_provider_id
       AND ROWNUM = 1;

    RETURN v_id_usuario;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
END fn_get_usuario_oauth;