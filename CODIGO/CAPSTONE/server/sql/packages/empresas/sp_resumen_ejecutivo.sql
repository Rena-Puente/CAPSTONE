create or replace PROCEDURE sp_resumen_ejecutivo(
  p_fecha_inicio IN DATE,
  p_fecha_fin    IN DATE,
  o_resultado    OUT CLOB
) AS
  v_ini DATE := TRUNC(NVL(p_fecha_inicio, DATE '2000-01-01'));
  v_fin DATE := TRUNC(NVL(p_fecha_fin, DATE '2100-12-31'));

  v_postulantes_mes     CLOB;
  v_empresas_mes        CLOB;
  v_ofertas_mes         CLOB;
  v_postulaciones_mes   CLOB;
  v_avg_post_x_oferta   VARCHAR2(50);
  v_ofertas_activas     VARCHAR2(50);
  v_empresas_inactivas  VARCHAR2(50);
BEGIN
  -- POSTULANTES POR MES (USUARIOS - TIMESTAMP)

  SELECT NVL((
           SELECT LISTAGG(
                    '{"mes": "' || mes || '", "total": ' || total || '}', ','
                  ) WITHIN GROUP (ORDER BY mes)
           FROM (
             SELECT TO_CHAR(CAST(u.fecha_creacion AS DATE), 'YYYY-MM') AS mes,
                    COUNT(*) AS total
             FROM usuarios u
             WHERE TRUNC(CAST(u.fecha_creacion AS DATE)) BETWEEN v_ini AND v_fin
             GROUP BY TO_CHAR(CAST(u.fecha_creacion AS DATE), 'YYYY-MM')
           )
         ), '')
  INTO v_postulantes_mes
  FROM dual;

  ------------------------------------------------------------------
  -- EMPRESAS POR MES (DATE)
  ------------------------------------------------------------------
  SELECT NVL((
           SELECT LISTAGG(
                    '{"mes": "' || mes || '", "total": ' || total || '}', ','
                  ) WITHIN GROUP (ORDER BY mes)
           FROM (
             SELECT TO_CHAR(CAST(e.fecha_creacion AS DATE), 'YYYY-MM') AS mes,
                    COUNT(*) AS total
             FROM empresas e
             WHERE TRUNC(CAST(e.fecha_creacion AS DATE)) BETWEEN v_ini AND v_fin
             GROUP BY TO_CHAR(CAST(e.fecha_creacion AS DATE), 'YYYY-MM')
           )
         ), '')
  INTO v_empresas_mes
  FROM dual;

  ------------------------------------------------------------------
  -- OFERTAS POR MES (asumo OFERTAS.FECHA_CREACION es DATE o TIMESTAMP)
  ------------------------------------------------------------------
  SELECT NVL((
           SELECT LISTAGG(
                    '{"mes": "' || mes || '", "total": ' || total || '}', ','
                  ) WITHIN GROUP (ORDER BY mes)
           FROM (
             SELECT TO_CHAR(CAST(o.fecha_creacion AS DATE), 'YYYY-MM') AS mes,
                    COUNT(*) AS total
             FROM ofertas o
             WHERE TRUNC(CAST(o.fecha_creacion AS DATE)) BETWEEN v_ini AND v_fin
             GROUP BY TO_CHAR(CAST(o.fecha_creacion AS DATE), 'YYYY-MM')
           )
         ), '')
  INTO v_ofertas_mes
  FROM dual;

  ------------------------------------------------------------------
  -- POSTULACIONES POR MES (POSTULACIONES.FECHA_CREACION = TIMESTAMP)
  ------------------------------------------------------------------
  SELECT NVL((
           SELECT LISTAGG(
                    '{"mes": "' || mes || '", "total": ' || total || '}', ','
                  ) WITHIN GROUP (ORDER BY mes)
           FROM (
             SELECT TO_CHAR(CAST(p.fecha_creacion AS DATE), 'YYYY-MM') AS mes,
                    COUNT(*) AS total
             FROM postulaciones p
             WHERE TRUNC(CAST(p.fecha_creacion AS DATE)) BETWEEN v_ini AND v_fin
             GROUP BY TO_CHAR(CAST(p.fecha_creacion AS DATE), 'YYYY-MM')
           )
         ), '')
  INTO v_postulaciones_mes
  FROM dual;

  ------------------------------------------------------------------
  -- PROMEDIO DE POSTULANTES POR OFERTA (sobre POSTULACIONES)
  ------------------------------------------------------------------
  SELECT NVL((
           SELECT TO_CHAR(ROUND(AVG(cnt), 2), 'FM9990D00')
           FROM (
             SELECT id_oferta, COUNT(*) AS cnt
             FROM postulaciones
             WHERE TRUNC(CAST(fecha_creacion AS DATE)) BETWEEN v_ini AND v_fin
             GROUP BY id_oferta
           )
         ), '0')
  INTO v_avg_post_x_oferta
  FROM dual;

  ------------------------------------------------------------------
  -- OFERTAS ACTIVAS (visión actual, sin filtro de fecha)
  ------------------------------------------------------------------
  SELECT TO_CHAR(COUNT(*))
  INTO v_ofertas_activas
  FROM ofertas
  WHERE activa = 1;

  ------------------------------------------------------------------
  -- EMPRESAS SIN OFERTAS (INACTIVAS)
  ------------------------------------------------------------------
  SELECT TO_CHAR(COUNT(*))
  INTO v_empresas_inactivas
  FROM empresas e
  WHERE NOT EXISTS (
    SELECT 1
    FROM ofertas o
    WHERE o.id_empresa = e.id_empresa
  );

  ------------------------------------------------------------------
  -- ARMAR JSON FINAL
  ------------------------------------------------------------------
  o_resultado :=
      '{'
    || '"postulantes_por_mes": ['      || v_postulantes_mes     || '],'
    || '"empresas_por_mes": ['         || v_empresas_mes        || '],'
    || '"ofertas_por_mes": ['          || v_ofertas_mes         || '],'
    || '"postulaciones_por_mes": ['    || v_postulaciones_mes   || '],'
    || '"avg_postulantes_por_oferta": '|| v_avg_post_x_oferta   || ','
    || '"ofertas_activas": '           || v_ofertas_activas     || ','
    || '"empresas_inactivas": '        || v_empresas_inactivas
    || '}';

END;