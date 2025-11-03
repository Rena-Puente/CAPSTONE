create or replace PROCEDURE sp_obtener_perfil_chk (
  p_id_usuario        IN  NUMBER,

  -- valores ('' si vienen NULL o no existe la fila)
  o_nombre_mostrar    OUT VARCHAR2,
  o_titular           OUT VARCHAR2,
  o_biografia         OUT VARCHAR2,
  o_pais              OUT VARCHAR2,
  o_ciudad            OUT VARCHAR2,
  o_url_avatar        OUT VARCHAR2,

  -- estado global y existencia
  o_perfil_completo   OUT CHAR,     -- 'S' / 'N'
  o_existe            OUT NUMBER,   -- 1 existe fila en PERFILES; 0 no existe

  -- checks por campo (1 = ok, 0 = vacío/no cumple)
  o_ok_nombre_mostrar OUT NUMBER,
  o_ok_titular        OUT NUMBER,
  o_ok_biografia      OUT NUMBER,   -- usa regla: LENGTH >= 80
  o_ok_pais           OUT NUMBER,
  o_ok_ciudad         OUT NUMBER,
  o_ok_url_avatar     OUT NUMBER,

  -- resumen
  o_campos_requeridos OUT NUMBER,   -- siempre 6 (los requeridos)
  o_campos_ok         OUT NUMBER    -- suma de los 6 checks
) AS
  -- valores crudos desde BD (permitimos NULL para evaluar correctamente)
  v_nombre_mostrar VARCHAR2(4000);
  v_titular        VARCHAR2(4000);
  v_biografia      VARCHAR2(4000);
  v_pais           VARCHAR2(4000);
  v_ciudad         VARCHAR2(4000);
  v_url_avatar     VARCHAR2(4000);
BEGIN
  -- Intento de lectura
  BEGIN
    SELECT nombre_mostrar, titular, biografia, pais, ciudad, url_avatar
      INTO v_nombre_mostrar, v_titular, v_biografia, v_pais, v_ciudad, v_url_avatar
      FROM perfiles
     WHERE id_usuario = p_id_usuario;

    o_existe := 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      v_nombre_mostrar := NULL;
      v_titular        := NULL;
      v_biografia      := NULL;
      v_pais           := NULL;
      v_ciudad         := NULL;
      v_url_avatar     := NULL;
      o_existe         := 0;
  END;

  -- Entregamos valores “limpios” ('' si están NULL)
  o_nombre_mostrar := NVL(v_nombre_mostrar, '');
  o_titular        := NVL(v_titular, '');
  o_biografia      := NVL(v_biografia, '');
  o_pais           := NVL(v_pais, '');
  o_ciudad         := NVL(v_ciudad, '');
  o_url_avatar     := NVL(v_url_avatar, '');

  -- Checks por campo (1 ok / 0 vacío). Bio con regla de >= 80 chars
  o_ok_nombre_mostrar := CASE WHEN v_nombre_mostrar IS NOT NULL AND TRIM(v_nombre_mostrar) <> '' THEN 1 ELSE 0 END;
  o_ok_titular        := CASE WHEN v_titular        IS NOT NULL AND TRIM(v_titular)        <> '' THEN 1 ELSE 0 END;
  o_ok_biografia      := CASE WHEN v_biografia      IS NOT NULL AND LENGTH(TRIM(v_biografia)) >= 80 THEN 1 ELSE 0 END;
  o_ok_pais           := CASE WHEN v_pais           IS NOT NULL AND TRIM(v_pais)           <> '' THEN 1 ELSE 0 END;
  o_ok_ciudad         := CASE WHEN v_ciudad         IS NOT NULL AND TRIM(v_ciudad)         <> '' THEN 1 ELSE 0 END;
  o_ok_url_avatar     := CASE WHEN v_url_avatar     IS NOT NULL AND TRIM(v_url_avatar)     <> '' THEN 1 ELSE 0 END;

  -- Resumen
  o_campos_requeridos := 6;
  o_campos_ok := o_ok_nombre_mostrar
               + o_ok_titular
               + o_ok_biografia
               + o_ok_pais
               + o_ok_ciudad
               + o_ok_url_avatar;

  -- Estado global calculado (coherente con tu recalculador)
  o_perfil_completo := CASE
                         WHEN o_campos_ok = o_campos_requeridos THEN 'S'
                         ELSE 'N'
                       END;
END;