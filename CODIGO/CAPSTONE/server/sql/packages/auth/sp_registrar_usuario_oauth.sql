create or replace PROCEDURE sp_registrar_usuario_oauth(
  p_proveedor    IN  VARCHAR2,
  p_provider_id  IN  VARCHAR2,
  p_correo       IN  VARCHAR2,
  p_nombre       IN  VARCHAR2,
  p_avatar       IN  VARCHAR2,
  p_id_usuario   OUT NUMBER
) AS
  v_id_usuario   admin.usuarios.id_usuario%TYPE;
  v_proveedor    VARCHAR2(100);
  v_dummy        PLS_INTEGER;

  -- Intenta setear avatar en PERFILES sin fallar si la columna no existe.
  PROCEDURE set_avatar(p_user_id NUMBER, p_url VARCHAR2) IS
  BEGIN
    IF p_url IS NULL THEN
      RETURN;
    END IF;

    BEGIN
      -- Caso común: columna AVATAR_URL
      EXECUTE IMMEDIATE
        'UPDATE admin.perfiles SET avatar_url = :1 WHERE id_usuario = :2'
        USING p_url, p_user_id;

      IF SQL%ROWCOUNT = 0 THEN
        NULL; -- perfil puede no existir aún; lo creamos más abajo
      END IF;

    EXCEPTION
      WHEN OTHERS THEN
        -- Si la columna no existe (ORA-00904) u otro nombre, probamos IMAGEN_URL
        IF SQLCODE = -904 THEN
          BEGIN
            EXECUTE IMMEDIATE
              'UPDATE admin.perfiles SET imagen_url = :1 WHERE id_usuario = :2'
              USING p_url, p_user_id;
          EXCEPTION
            WHEN OTHERS THEN
              NULL; -- lo ignoramos para no romper el flujo
          END;
        END IF;
    END;
  END set_avatar;

BEGIN
  v_proveedor := UPPER(TRIM(p_proveedor));

  -- 1) ¿Ya existe vínculo OAuth? Devuelve el usuario y termina.
  v_id_usuario := fn_get_usuario_oauth(v_proveedor, p_provider_id);
  IF v_id_usuario IS NOT NULL THEN
    p_id_usuario := v_id_usuario;
    RETURN;
  END IF;

  -- 2) ¿Existe usuario por correo?
  BEGIN
    SELECT u.id_usuario
      INTO v_id_usuario
      FROM admin.usuarios u
     WHERE LOWER(u.correo) = LOWER(p_correo)
       AND ROWNUM = 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      -- 2.a) Crear nuevo usuario (siguiendo tu patrón MAX+1)
      SELECT NVL(MAX(u.id_usuario), 0) + 1
        INTO v_id_usuario
        FROM admin.usuarios u;

      INSERT INTO admin.usuarios (id_usuario, correo, contrasena_hash, activo)
      VALUES (
        v_id_usuario,
        p_correo,
        fn_hash_pw('oauth-placeholder'),
        1
      );
  END;

  -- 3) Asegurar PERFIL: insert si no existe, si existe no pisa datos no nulos.
  BEGIN
    SELECT 1 INTO v_dummy
      FROM admin.perfiles p
     WHERE p.id_usuario = v_id_usuario;

    -- Perfil existe: solo completar campos vacíos
    UPDATE admin.perfiles
       SET nombre_mostrar = COALESCE(nombre_mostrar, p_nombre)
     WHERE id_usuario = v_id_usuario;

  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      -- Crear perfil con nombre
      INSERT INTO admin.perfiles (id_usuario, nombre_mostrar)
      VALUES (v_id_usuario, p_nombre);
  END;

  -- 3.a) Intentar guardar avatar en perfiles si la columna existe
  set_avatar(v_id_usuario, p_avatar);

  -- 4) Crear vínculo OAuth (ya validamos que no existía)
  INSERT INTO admin.cuentas_oauth (
      id_usuario, proveedor, id_proveedor_usuario
  ) VALUES (
      v_id_usuario, v_proveedor, p_provider_id
  );

  -- 5) devolver id
  p_id_usuario := v_id_usuario;
END sp_registrar_usuario_oauth;