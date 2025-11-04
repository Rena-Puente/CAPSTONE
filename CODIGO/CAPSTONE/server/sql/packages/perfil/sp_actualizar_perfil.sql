create or replace PROCEDURE sp_actualizar_perfil (
  p_id_usuario     IN NUMBER,
  p_nombre_mostrar IN VARCHAR2,
  p_titular        IN VARCHAR2,
  p_biografia      IN VARCHAR2,
  p_pais           IN VARCHAR2,
  p_ciudad         IN VARCHAR2,
  p_url_avatar     IN VARCHAR2,
  p_slug           IN VARCHAR2
) AS
  v_slug perfiles.slug%TYPE;
  v_conflicts NUMBER;

  FUNCTION normalize_slug(
    p_candidate IN VARCHAR2,
    p_nombre    IN VARCHAR2,
    p_id        IN NUMBER
  ) RETURN VARCHAR2 IS
    l_slug VARCHAR2(40);
    l_base VARCHAR2(40);
    l_fallback VARCHAR2(40);
  BEGIN
    l_base := TRIM(NVL(p_candidate, ''));

    IF l_base IS NOT NULL THEN
      l_base := NLS_LOWER(l_base);
    END IF;

    l_base := REGEXP_REPLACE(l_base, '[^a-z0-9]+', '-');
    l_base := REGEXP_REPLACE(l_base, '^-+|-+$', '');
    l_base := REGEXP_REPLACE(l_base, '-{2,}', '-');

    IF l_base IS NULL OR LENGTH(l_base) < 3 THEN
      l_fallback := TRIM(NVL(p_nombre, ''));
      l_fallback := NLS_LOWER(l_fallback);
      l_fallback := REGEXP_REPLACE(l_fallback, '[^a-z0-9]+', '-');
      l_fallback := REGEXP_REPLACE(l_fallback, '^-+|-+$', '');
      l_fallback := REGEXP_REPLACE(l_fallback, '-{2,}', '-');

      IF l_fallback IS NULL OR LENGTH(l_fallback) < 3 THEN
        l_fallback := 'perfil-' || TO_CHAR(p_id);
      END IF;

      l_base := l_fallback;
    END IF;

    IF LENGTH(l_base) > 40 THEN
      l_base := SUBSTR(l_base, 1, 40);
      l_base := REGEXP_REPLACE(l_base, '-+$', '');

      IF l_base IS NULL OR LENGTH(l_base) < 3 THEN
        l_base := SUBSTR('perfil-' || TO_CHAR(p_id), 1, 40);
      END IF;
    END IF;

    l_slug := l_base;

    RETURN l_slug;
  END normalize_slug;
BEGIN
  v_slug := normalize_slug(p_slug, p_nombre_mostrar, p_id_usuario);

  IF v_slug IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_conflicts
      FROM perfiles
     WHERE slug = v_slug
       AND id_usuario <> p_id_usuario;

    IF v_conflicts > 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'La URL personalizada ya está en uso, elige otra por favor.');
    END IF;
  END IF;

  UPDATE perfiles
  SET nombre_mostrar = p_nombre_mostrar,
      titular        = p_titular,
      biografia      = p_biografia,
      pais           = p_pais,
      ciudad         = p_ciudad,
      url_avatar     = p_url_avatar,
      slug           = v_slug
  WHERE id_usuario = p_id_usuario;

  -- recalcular automáticamente si está completo
  sp_recalcular_perfil_completo(p_id_usuario);

  COMMIT;
END;
