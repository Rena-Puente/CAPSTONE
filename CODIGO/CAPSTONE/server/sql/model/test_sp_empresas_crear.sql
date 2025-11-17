SET SERVEROUTPUT ON
PROMPT ==== Caso válido: creación de oferta con preguntas controladas ====
DECLARE
  v_id_oferta OFERTAS.ID_OFERTA%TYPE;
BEGIN
  sp_empresas_pkg.sp_crear_oferta(
    p_id_empresa      => 1,
    p_titulo          => 'Backend Engineer',
    p_descripcion     => TO_CLOB('Oferta de ejemplo para pruebas locales.'),
    p_tipo_ubicacion  => 'remoto',
    p_ciudad          => 'Santiago',
    p_pais            => 'Chile',
    p_seniority       => 'semi senior',
    p_tipo_contrato   => 'full-time',
    p_preguntas_json  => q'[
      {"texto":"¿Cuál es tu expectativa salarial?", "obligatorio": true},
      {"texto":"¿Con qué stack has trabajado recientemente?", "obligatorio": false}
    ]',
    o_id_oferta       => v_id_oferta
  );
  DBMS_OUTPUT.put_line('Oferta creada con ID: ' || v_id_oferta);
END;
/

PROMPT ==== Caso inválido: más de 3 preguntas o sin texto ====
DECLARE
  v_dummy OFERTAS.ID_OFERTA%TYPE;
BEGIN
  sp_empresas_pkg.sp_crear_oferta(
    p_id_empresa      => 1,
    p_titulo          => 'Oferta inválida',
    p_descripcion     => TO_CLOB('Debe fallar por validaciones.'),
    p_tipo_ubicacion  => 'hibrido',
    p_ciudad          => 'Lima',
    p_pais            => 'Perú',
    p_seniority       => 'junior',
    p_tipo_contrato   => 'part-time',
    p_preguntas_json  => q'[
      {"texto":"Pregunta 1", "obligatorio": true},
      {"texto":"Pregunta 2", "obligatorio": false},
      {"texto":"Pregunta 3", "obligatorio": true},
      {"texto":"Pregunta 4"}
    ]',
    o_id_oferta       => v_dummy
  );
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.put_line('Error esperado: ' || SQLERRM);
END;
/
