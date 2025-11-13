CREATE OR REPLACE PROCEDURE sp_listar_postulaciones_usuario(
  p_id_usuario     IN  POSTULACIONES.ID_USUARIO%TYPE,
  o_postulaciones  OUT SYS_REFCURSOR
) AS
BEGIN
  IF p_id_usuario IS NULL OR p_id_usuario <= 0 THEN
    OPEN o_postulaciones FOR
      SELECT
        CAST(NULL AS NUMBER)      AS id_postulacion,
        CAST(NULL AS NUMBER)      AS id_oferta,
        CAST(NULL AS NUMBER)      AS id_empresa,
        CAST(NULL AS VARCHAR2(1)) AS titulo_oferta,
        CAST(NULL AS VARCHAR2(1)) AS nombre_empresa,
        CAST(NULL AS VARCHAR2(1)) AS ciudad,
        CAST(NULL AS VARCHAR2(1)) AS pais,
        CAST(NULL AS VARCHAR2(1)) AS seniority,
        CAST(NULL AS VARCHAR2(1)) AS tipo_contrato,
        CAST(NULL AS VARCHAR2(1)) AS tipo_ubicacion,
        CAST(NULL AS VARCHAR2(1)) AS estado,
        CAST(NULL AS CLOB)        AS carta_presentacion,
        CAST(NULL AS TIMESTAMP)   AS fecha_postulacion,
        CAST(NULL AS TIMESTAMP)   AS fecha_actualizacion,
        CAST(NULL AS NUMBER)      AS oferta_activa,
        CAST(NULL AS TIMESTAMP)   AS fecha_oferta
      FROM dual
     WHERE 1 = 0;
    RETURN;
  END IF;

  OPEN o_postulaciones FOR
    SELECT
      p.id_postulacion,
      p.id_oferta,
      o.id_empresa,
      o.titulo                AS titulo_oferta,
      e.nombre                AS nombre_empresa,
      o.ciudad,
      o.pais,
      o.seniority,
      o.tipo_contrato,
      o.tipo_ubicacion,
      p.estado,
      p.carta_presentacion,
      p.fecha_creacion        AS fecha_postulacion,
      p.fecha_actualizacion,
      o.activa                AS oferta_activa,
      o.fecha_creacion        AS fecha_oferta
    FROM postulaciones p
    JOIN ofertas o
      ON o.id_oferta = p.id_oferta
    JOIN empresas e
      ON e.id_empresa = o.id_empresa
   WHERE p.id_usuario = p_id_usuario
   ORDER BY p.fecha_creacion DESC;
END sp_listar_postulaciones_usuario;
/
