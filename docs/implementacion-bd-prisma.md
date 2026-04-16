---
title: Implementación de Esquema PostgreSQL con Prisma
autor: Equipo MetaCorpus Explorer
fecha: 2026-04-16
version: 1.0.0
---

## 1. Objetivo

Documentar la implementación inicial del esquema de base de datos para MetaCorpus Explorer, orientada a soporte multi-tenant por `corpus_id`.

## 2. Alcance implementado

Se implementaron las siguientes entidades:

1. `corpus`
2. `metaphorical_expression`
3. `conceptual_metaphor`
4. `domain`
5. `semantic_relation`
6. `textual_source`
7. `grammatical_category`

Además:
- índices full-text (`tsvector`) con diccionario `spanish`
- índice compuesto `(corpus_id, fuente_textual_id, orden)`
- restricción `UNIQUE(corpus_id, fuente_textual_id, orden)`
- seed de datos con 2 corpus de prueba

## 3. Decisiones de diseño

### 3.1 Estrategia multi-tenant

`corpus` es la entidad raíz. Cada tabla hija incluye `corpus_id` y relaciones con claves compuestas para impedir cruces entre corpus distintos.

### 3.2 Restricciones de integridad

- `@@unique([id, corpus_id])` en tablas referenciables por claves compuestas.
- FKs de entidades hijas usando pares `(id_relacionado, corpus_id)`.
- `onDelete: Restrict` en relaciones opcionales con clave compuesta para evitar inconsistencias con `corpus_id` obligatorio.

### 3.3 Búsqueda full-text

Se añadieron columnas `search_vector` generadas en:
- `metaphorical_expression`
- `conceptual_metaphor`
- `domain`
- `textual_source`

Y se crearon índices `GIN` para consultas de texto en español.

## 4. Archivos principales

- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `prisma/seed.js`
- `prisma.config.ts`
- `README.md`

## 5. Configuración de conexión (Prisma 7+)

La URL de conexión se define en `prisma.config.ts`:

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: env('DATABASE_URL')
  }
});
```

Y en `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metacorpus_explorer?schema=public"
```

## 6. Evidencias de cumplimiento

1. **Esquema Prisma creado con migraciones:** Sí.
2. **Tabla `corpus` funcional:** Sí.
3. **Índices full-text funcionales:** Sí (`GIN` + `tsvector`).
4. **Índice compuesto de orden por fuente/corpus:** Sí.
5. **UNIQUE(corpus_id, fuente_textual_id, orden):** Sí.
6. **Seed con al menos 2 corpus:** Sí.

## 7. Pendientes sugeridos

- Incorporar pruebas automatizadas de integridad referencial.
- Agregar ejemplos de consultas API sobre full-text.
- Preparar script de bootstrap con Docker para PostgreSQL local.
