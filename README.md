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
