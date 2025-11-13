CREATE OR REPLACE PROCEDURE sp_listar_postulaciones_usuario(
  p_id_usuario     IN  POSTULACIONES.ID_USUARIO%TYPE,
  o_postulaciones  OUT SYS_REFCURSOR
) AS
BEGIN
  OPEN o_postulaciones FOR
    SELECT
      p.ID_POSTULACION,
      p.ID_OFERTA,
      p.ID_USUARIO,
      p.CARTA_PRESENTACION,
      p.ESTADO,
      p.FECHA_CREACION           AS FECHA_POSTULACION,
      o.TITULO                   AS TITULO_OFERTA,
      o.TIPO_UBICACION,
      o.CIUDAD,
      o.PAIS,
      o.SENIORITY,
      o.TIPO_CONTRATO,
      o.ACTIVA                   AS OFERTA_ACTIVA,
      o.FECHA_CREACION           AS FECHA_OFERTA
    FROM POSTULACIONES p
    JOIN OFERTAS o
      ON o.ID_OFERTA = p.ID_OFERTA
    WHERE p.ID_USUARIO = p_id_usuario
    -- Si quieres solo ver postulaciones a ofertas aún activas, descomenta:
    --   AND o.ACTIVA = 1
    ORDER BY p.FECHA_CREACION DESC;
END sp_listar_postulaciones_usuario;
/
