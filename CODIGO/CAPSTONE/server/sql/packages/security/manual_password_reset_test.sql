-- Script de prueba manual para la funcionalidad de recuperación de contraseña.
-- Ejecutar en un entorno de desarrollo / QA.
-- 1. Ajusta el correo de prueba en la variable v_correo.
-- 2. Ejecuta el bloque para generar un token y revisa el resultado.
-- 3. Copia el token generado y utilízalo en el segundo bloque para confirmar el cambio.

SET SERVEROUTPUT ON;
DECLARE
  v_token     VARCHAR2(256);
  v_resultado VARCHAR2(512);
BEGIN
  sp_crear_recuperacion_contrasena(
    p_correo    => 'correo@ejemplo.com',
    o_token     => v_token,
    o_resultado => v_resultado
  );

  DBMS_OUTPUT.PUT_LINE('Resultado solicitud: ' || v_resultado);
  DBMS_OUTPUT.PUT_LINE('Token generado: ' || v_token);
END;
/

DECLARE
  v_resultado VARCHAR2(512);
BEGIN
  sp_confirmar_recuperacion_contrasena(
    p_token     => 'PEGA_EL_TOKEN_AQUI',
    p_password  => 'NuevaContraseña123',
    p_password2 => 'NuevaContraseña123',
    o_resultado => v_resultado
  );

  DBMS_OUTPUT.PUT_LINE('Resultado confirmación: ' || v_resultado);
END;
/
