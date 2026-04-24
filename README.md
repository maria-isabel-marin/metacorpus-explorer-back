# MetaCorpus Explorer Back

Backend base para MetaCorpus Explorer usando PostgreSQL + Prisma.

## 1) Requisitos

- Node.js 20+
- PostgreSQL 14+
- npm 10+

## 2) Configuración inicial

1. Instalar dependencias:

```bash
npm install
```

2. Crear archivo `.env` (puedes copiar desde `.env.example`) y definir:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/metacorpus_explorer?schema=public"
```

> Debes crear la base de datos `metacorpus_explorer` previamente en PostgreSQL.

## 3) Prisma: migraciones y cliente

```bash
npm run prisma:migrate
npm run prisma:generate
```

Si estás en entorno no interactivo/producción:

```bash
npm run prisma:deploy
npm run prisma:generate
```

## 4) Seed de datos de prueba

```bash
npm run prisma:seed
```

El seed crea:
- 2 corpus de prueba
- categorías gramaticales
- dominios
- metáforas conceptuales
- relaciones semánticas
- fuentes textuales
- expresiones metafóricas

## 5) Validación de criterios de aceptación

### 5.1 Tabla raíz `corpus`

```sql
SELECT id, slug, nombre, idioma, version, activo FROM corpus;
```

### 5.2 Restricción compuesta de orden por fuente y corpus

```sql
-- Debe existir índice/unique compuesto
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'metaphorical_expression'
  AND indexdef ILIKE '%(corpus_id, fuente_textual_id, orden)%';
```

### 5.3 Full-text search en español

```sql
SELECT id, expresion_metaforica
FROM metaphorical_expression
WHERE to_tsvector(
  'pg_catalog.spanish'::regconfig,
  coalesce(expresion_metaforica, '') || ' ' ||
  coalesce(contexto, '') || ' ' ||
  coalesce(foco, '') || ' ' ||
  coalesce(significado_contextual, '') || ' ' ||
  coalesce(significado_basico, '') || ' ' ||
  coalesce(observaciones, '')
) @@ plainto_tsquery('spanish', 'democracia cimientos');
```

### 5.4 Aislamiento multi-tenant por `corpus_id` en FKs

```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
```

## 6) Estructura relevante

- `prisma/schema.prisma`: modelos Prisma y relaciones
- `prisma/migrations/0001_init/migration.sql`: DDL inicial + índices full-text
- `prisma/seed.js`: seed con 2 corpus
- `prisma.config.ts`: configuración de datasource para Prisma 7+

## 7) Notas

- El `url` ya no se define en `schema.prisma`; se configura en `prisma.config.ts`.
- El cliente Prisma se instancia con adapter PostgreSQL (`@prisma/adapter-pg`).

## 8) CLI de ingestión MIPVU (Excel)

El proyecto incluye un script administrativo en TypeScript que **no forma parte del runtime de exploración**.

Archivo:

- `scripts/ingest.ts`

Dependencias requeridas (ya declaradas en `package.json`):

- `ts-node`
- `typescript`
- `xlsx`

Ejemplos de uso:

```bash
npx ts-node scripts/ingest.ts --file corpus.xlsx --corpus cev-amazonia --name "CEV Amazonia" --license "CC-BY-4.0"
npx ts-node scripts/ingest.ts --file corpus2.xlsx --corpus cev-pacifico --name "CEV Pacífico"
```

También disponible como script npm:

```bash
npm run ingest -- --file corpus.xlsx --corpus cev-amazonia --name "CEV Amazonia"
```

Qué hace el CLI:

- Lee `.xlsx` (primera hoja).
- Normaliza encabezados y campos textuales.
- Deduplica dominios (`FUENTE`/`META`) y metáforas conceptuales por corpus.
- Preserva `orden` y valida unicidad por fuente textual dentro del archivo antes de insertar.
- Si no existe columna `orden`, lo infiere desde el sufijo numérico de `id`/`id_registro` (ej: `CEV_123` -> `orden=123`).
- Respeta idempotencia por `id_registro` + `corpus_id` (reimportación actualiza en lugar de duplicar).
- Reporta métricas de importación en consola.

## 9) API REST de corpus

Levantar API:

```bash
npm run api
```

Por defecto expone en `http://localhost:3000` (puedes cambiar con `PORT`).

### 9.1 Listado de corpus activos

```http
GET /api/v1/corpora
```

Devuelve solo corpus con `activo=true` y resumen con:

- `nombre`
- `slug`
- `descripcion`
- `idioma`
- `numero_registros` (conteo de expresiones metafóricas del corpus)
- `version`
- `licencia`

### 9.2 Detalle de un corpus por slug

```http
GET /api/v1/corpora/{slug}
```

Devuelve:

- metadatos base del corpus
- `fair` (findable, accessible, interoperable, reusable)
- `estadisticas_agregadas` (registros, dominios, fuentes, metáforas, relaciones, categorías)
- `como_citar`
- `doi`

Si el corpus no existe o no está activo, responde `404`.

## 10) API REST de expresiones metafóricas (scoped a corpus)

Todos los endpoints están aislados por corpus usando `slug` y `corpus_id`.

### 10.1 Endpoints

- `GET /api/v1/corpora/{slug}/expressions`
  - listado paginado (`limit`, `offset`)
  - filtros combinables: `metafora`, `dominio_fuente`, `dominio_meta`, `tipologia`, `cat_gramatical`, `fuente`
  - ordenamiento: `sort=orden|id` y `order=asc|desc`

- `GET /api/v1/corpora/{slug}/expressions/{id}`
  - detalle completo de expresión (incluye `orden`)

- `GET /api/v1/corpora/{slug}/expressions/{id}/nearby?range=5`
  - expresiones adyacentes por `orden` en la misma `fuente_textual`

- `GET /api/v1/corpora/{slug}/expressions/search?q={query}`
  - búsqueda full-text (`expresion_metaforica`, `contexto`, `foco`)

- `GET /api/v1/corpora/{slug}/expressions/concordance?q={query}`
  - concordancia KWIC

### 10.2 JSON-LD y OpenAPI

- Las respuestas de expresiones se devuelven en formato JSON-LD (`@context`, `@type`).
- Especificación OpenAPI generada con `swagger-jsdoc`:

```http
GET /api/v1/openapi.json
```

Guía de pruebas de aceptación:

- `docs/validacion-aceptacion-api-expresiones.md`

Smoke test automatizado (con la API corriendo):

```bash
npm run smoke:expressions-api
```
