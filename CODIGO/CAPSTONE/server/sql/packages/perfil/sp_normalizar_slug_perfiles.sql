create or replace PROCEDURE sp_normalizar_slug_perfiles AS
  CURSOR c_perfiles IS
    SELECT id_usuario, nombre_mostrar
      FROM perfiles
     ORDER BY id_usuario
     FOR UPDATE;

  TYPE slug_set IS TABLE OF BOOLEAN INDEX BY VARCHAR2(40);
  l_usados slug_set;

  FUNCTION build_base_slug(p_texto IN VARCHAR2, p_id IN NUMBER) RETURN VARCHAR2 IS
    l_valor VARCHAR2(4000);
    l_slug VARCHAR2(40);
  BEGIN
    l_valor := TRIM(NVL(p_texto, ''));

    IF l_valor IS NOT NULL THEN
      l_valor := NLS_LOWER(l_valor);
    END IF;

    l_valor := REGEXP_REPLACE(l_valor, '[^a-z0-9]+', '-');
    l_valor := REGEXP_REPLACE(l_valor, '^-+|-+$', '');
    l_valor := REGEXP_REPLACE(l_valor, '-{2,}', '-');

    IF l_valor IS NULL OR LENGTH(l_valor) < 3 THEN
      l_valor := 'perfil-' || TO_CHAR(p_id);
    END IF;

    IF LENGTH(l_valor) > 40 THEN
      l_valor := SUBSTR(l_valor, 1, 40);
      l_valor := REGEXP_REPLACE(l_valor, '-+$', '');

      IF l_valor IS NULL OR LENGTH(l_valor) < 3 THEN
        l_valor := SUBSTR('perfil-' || TO_CHAR(p_id), 1, 40);
      END IF;
    END IF;

    l_slug := l_valor;

    RETURN l_slug;
  END build_base_slug;

  FUNCTION ensure_unique_slug(
    p_slug IN VARCHAR2,
    p_id   IN NUMBER
  ) RETURN VARCHAR2 IS
    l_candidate VARCHAR2(40);
    l_suffix NUMBER := 1;
    l_base VARCHAR2(40);
    l_prefix VARCHAR2(40);
    l_available_length PLS_INTEGER;
  BEGIN
    l_base := NVL(p_slug, 'perfil-' || TO_CHAR(p_id));
    l_base := REGEXP_REPLACE(l_base, '-+$', '');
    l_candidate := l_base;

    LOOP
      EXIT WHEN NOT l_usados.EXISTS(l_candidate);

      l_suffix := l_suffix + 1;
      l_available_length := 40 - LENGTH(l_suffix) - 1;

      IF l_available_length < 1 THEN
        l_available_length := 1;
      END IF;

      l_prefix := SUBSTR(l_base, 1, l_available_length);
      l_prefix := REGEXP_REPLACE(l_prefix, '-+$', '');

      IF l_prefix IS NULL OR LENGTH(l_prefix) < 1 THEN
        l_prefix := SUBSTR('perfil-' || TO_CHAR(p_id), 1, l_available_length);
        l_prefix := REGEXP_REPLACE(l_prefix, '-+$', '');
        IF l_prefix IS NULL OR LENGTH(l_prefix) < 1 THEN
          l_prefix := 'perfil';
        END IF;
      END IF;

      l_candidate := l_prefix || '-' || TO_CHAR(l_suffix);

      IF LENGTH(l_candidate) > 40 THEN
        l_candidate := SUBSTR(l_candidate, 1, 40);
      END IF;
    END LOOP;

    RETURN l_candidate;
  END ensure_unique_slug;
BEGIN
  FOR reg IN (SELECT slug FROM perfiles WHERE slug IS NOT NULL) LOOP
    l_usados(reg.slug) := TRUE;
  END LOOP;

  FOR perfil IN c_perfiles LOOP
    DECLARE
      l_base_slug VARCHAR2(40);
      l_slug VARCHAR2(40);
    BEGIN
      l_base_slug := build_base_slug(perfil.nombre_mostrar, perfil.id_usuario);
      l_slug := ensure_unique_slug(l_base_slug, perfil.id_usuario);

      UPDATE perfiles
         SET slug = l_slug
       WHERE CURRENT OF c_perfiles;

      l_usados(l_slug) := TRUE;
    END;
  END LOOP;

  COMMIT;
END;
