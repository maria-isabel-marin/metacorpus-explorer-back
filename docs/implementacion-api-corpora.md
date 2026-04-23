---
title: Implementacion API REST de Corpora
autor: Equipo MetaCorpus Explorer
fecha: 2026-04-23
version: 1.0.0
---

## 1. Objetivo

Documentar la implementacion de los endpoints REST para consulta de corpus disponibles en MetaCorpus Explorer:

- `GET /api/v1/corpora`
- `GET /api/v1/corpora/{slug}`

## 2. Alcance implementado

Se implemento una API HTTP con Express en `app/server.ts` que expone:

1. **Listado de corpus activos** (`activo=true`) con resumen y total de registros.
2. **Detalle de un corpus activo por slug** con metadatos, bloque FAIR, estadisticas agregadas, DOI y cadena de citacion.

## 3. Contratos de endpoints

### 3.1 GET /api/v1/corpora

**Descripcion:** lista corpus activos.

**Filtro aplicado:**

- `where: { activo: true }`

**Campos de salida por item:**

- `nombre`
- `slug`
- `descripcion`
- `idioma`
- `numero_registros`
- `version`
- `licencia`

**Fuente de `numero_registros`:**

- conteo de `expresiones_metaforicas` por corpus mediante `_count` de Prisma.

### 3.2 GET /api/v1/corpora/{slug}

**Descripcion:** retorna detalle de un corpus activo por su `slug`.

**Filtro aplicado:**

- `where: { slug, activo: true }`

**Respuesta incluye:**

- metadatos base del corpus (`nombre`, `descripcion`, `idioma`, `version`, etc.)
- `doi`
- `autores`
- `metadatos_extra`
- `fair`:
  - `findable`
  - `accessible`
  - `interoperable`
  - `reusable`
- `estadisticas_agregadas`:
  - `numero_registros`
  - `fuentes_textuales`
  - `dominios`
  - `dominios_por_tipo`
  - `metaforas_conceptuales`
  - `relaciones_semanticas`
  - `categorias_gramaticales`
- `como_citar`

**Estado 404:**

- se retorna cuando no existe corpus con ese slug o no esta activo.

## 4. Reglas de negocio y criterios de aceptacion

1. **Solo corpus activos**
   - ambos endpoints excluyen corpus con `activo=false`.

2. **Conteos correctos por corpus**
   - el total de registros por corpus se calcula con `_count.expresiones_metaforicas`.
   - las estadisticas de detalle usan `_count` sobre relaciones del corpus.
   - `dominios_por_tipo` se calcula con `groupBy` de Prisma sobre `domain.tipo` filtrando por `corpus_id`.

3. **Detalle FAIR**
   - se incluye un bloque `fair` derivado de metadatos del corpus para interoperabilidad y reutilizacion.

## 5. Implementacion tecnica

### 5.1 Archivo principal

- `app/server.ts`

### 5.2 Stack usado

- `express`
- `@prisma/client`
- `@prisma/adapter-pg`
- `pg`
- `dotenv`

### 5.3 Conexion a base de datos

- se usa `DATABASE_URL` desde `.env`
- Prisma Client se instancia con adapter PostgreSQL (`PrismaPg + Pool`)

## 6. Manejo de errores

- `404` cuando el corpus solicitado no existe/no esta activo.
- `500` para errores no controlados con respuesta JSON:

```json
{ "error": "mensaje" }
```

## 7. Ejecucion y pruebas manuales

Levantar API:

```bash
npm install
npm run api
```

Pruebas rapidas:

```bash
curl http://localhost:3000/api/v1/corpora
curl http://localhost:3000/api/v1/corpora/cev-amazonia-2024
```

Validacion SQL sugerida para conteos:

```sql
SELECT c.slug, count(*) AS total_registros
FROM metaphorical_expression me
JOIN corpus c ON c.id = me.corpus_id
WHERE c.activo = true
GROUP BY c.slug
ORDER BY c.slug;
```

## 8. Archivos relacionados

- `app/server.ts`
- `package.json`
- `tsconfig.json`
- `README.md`
- `prisma/schema.prisma`
