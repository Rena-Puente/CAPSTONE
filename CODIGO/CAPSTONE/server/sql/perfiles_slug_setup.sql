ALTER TABLE perfiles ADD (
  slug VARCHAR2(40)
);

BEGIN
  sp_normalizar_slug_perfiles;
END;
/

ALTER TABLE perfiles MODIFY (
  slug NOT NULL
);

ALTER TABLE perfiles ADD CONSTRAINT perfiles_slug_uk UNIQUE (slug);
