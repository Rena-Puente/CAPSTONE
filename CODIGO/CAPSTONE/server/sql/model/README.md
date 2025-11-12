# Modelo relacional de ofertas y postulaciones

El modelo de base de datos para el módulo de empleos gira en torno a cinco
entidades principales. El siguiente diagrama ER resume cómo se relacionan entre
sí los usuarios, las empresas y las postulaciones:

```mermaid
erDiagram
  USUARIOS ||--o{ PERFILES : "posee"
  USUARIOS ||--o{ POSTULACIONES : "realiza"
  EMPRESAS ||--o{ OFERTAS : "publica"
  OFERTAS ||--o{ POSTULACIONES : "recibe"
  EMPRESAS ||--o{ POSTULACIONES : "recibe"

  USUARIOS {
    NUMBER ID_USUARIO PK
    VARCHAR CORREO
    NUMBER ID_TIPO_USUARIO
  }

  PERFILES {
    NUMBER ID_USUARIO PK
    VARCHAR NOMBRE_MOSTRAR
    VARCHAR SLUG
  }

  EMPRESAS {
    NUMBER ID_EMPRESA PK
    VARCHAR NOMBRE
    VARCHAR EMAIL
    VARCHAR RUT_EMPRESA
  }

  OFERTAS {
    NUMBER ID_OFERTA PK
    NUMBER ID_EMPRESA FK
    VARCHAR TITULO
    VARCHAR PAIS
    VARCHAR CIUDAD
    VARCHAR SENIORITY
    VARCHAR TIPO_CONTRATO
    VARCHAR TIPO_UBICACION
    TIMESTAMP FECHA_CREACION
    NUMBER ACTIVA
  }

  POSTULACIONES {
    NUMBER ID_POSTULACION PK
    NUMBER ID_OFERTA FK
    NUMBER ID_USUARIO FK
    CLOB CARTA_PRESENTACION
    VARCHAR ESTADO
    TIMESTAMP FECHA_CREACION
  }
```

Las claves foráneas más relevantes son:

* `OFERTAS.ID_EMPRESA` → `EMPRESAS.ID_EMPRESA`
* `POSTULACIONES.ID_OFERTA` → `OFERTAS.ID_OFERTA`
* `POSTULACIONES.ID_USUARIO` → `USUARIOS.ID_USUARIO`
* `PERFILES.ID_USUARIO` → `USUARIOS.ID_USUARIO`

Esta visualización sirve como guía para validar las restricciones de
pertenencia antes de crear o modificar procedimientos PL/SQL, asegurando que
los cambios mantengan la integridad referencial del módulo.
