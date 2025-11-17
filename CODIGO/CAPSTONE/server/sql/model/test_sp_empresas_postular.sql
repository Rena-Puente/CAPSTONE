SET SERVEROUTPUT ON
PROMPT ==== Caso válido: postulación con respuestas ligadas ====
DECLARE
  v_id_postulacion POSTULACIONES.ID_POSTULACION%TYPE;
BEGIN
  sp_empresas_pkg.sp_postular_oferta(
    p_id_oferta          => 1,
    p_id_usuario         => 1,
    p_carta_presentacion => TO_CLOB('Gracias por considerar mi perfil.'),
    p_respuestas_json    => q'[
      {"texto":"Trabajo con Node.js y Oracle"},
      {"texto":"Disponibilidad inmediata", "obligatorio": true}
    ]',
    o_id_postulacion     => v_id_postulacion
  );
  DBMS_OUTPUT.put_line('Postulación registrada: ' || v_id_postulacion);
END;
/

PROMPT ==== Caso inválido: respuesta sin texto ====
DECLARE
  v_dummy POSTULACIONES.ID_POSTULACION%TYPE;
BEGIN
  sp_empresas_pkg.sp_postular_oferta(
    p_id_oferta          => 1,
    p_id_usuario         => 1,
    p_carta_presentacion => TO_CLOB('Debe generar error.'),
    p_respuestas_json    => q'[
      {"texto":""}
    ]',
    o_id_postulacion     => v_dummy
  );
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.put_line('Error esperado: ' || SQLERRM);
END;
/
