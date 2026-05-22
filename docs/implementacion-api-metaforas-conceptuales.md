---
title: Implementacion API de Metaforas Conceptuales Scoped a Corpus
autor: Equipo MetaCorpus Explorer
fecha: 2026-04-24
version: 1.0.0
---

## 1. Objetivo

Documentar la implementacion de la API REST para metaforas conceptuales acotadas por corpus:

- `GET /api/v1/corpora/{slug}/metaphors`
- `GET /api/v1/corpora/{slug}/metaphors/{id}`
- `GET /api/v1/corpora/{slug}/metaphors/{id}/expressions`
- `GET /api/v1/corpora/{slug}/metaphors/{id}/related`

## 2. Alcance implementado

Se implementaron endpoints en `app/server.ts` con estas garantias:

1. **Aislamiento por corpus**: todas las consultas filtran por `corpus_id` derivado de `slug` activo.
2. **Listado con filtros combinables** en `metaphors` por dominio fuente, dominio meta y tipologia.
3. **Detalle enriquecido** de metafora con estadisticas, correspondencias y muestra de expresiones.
4. **Paginacion** en expresiones asociadas por `limit` y `offset`.
5. **Relacion de metaforas** por dominios compartidos o adyacentes (jerarquia padre/hijo).

## 3. Contrato de endpoints

### 3.1 GET /api/v1/corpora/{slug}/metaphors

**Descripcion:** lista metaforas conceptuales del corpus activo.

**Query params:**

- `limit` (default `20`, max `100`)
- `offset` (default `0`)
- `dominio_fuente` (filtro parcial, case-insensitive)
- `dominio_meta` (filtro parcial, case-insensitive)
- `tipologia` (filtro parcial, case-insensitive)

**Salida principal:**

- `corpus_slug`, `total`, `limit`, `offset`
- `items[]` con:
  - `id`, `nombre`, `descripcion`, `tipologia`
  - `dominio_fuente`, `dominio_meta`
  - `total_expresiones`

### 3.2 GET /api/v1/corpora/{slug}/metaphors/{id}

**Descripcion:** retorna detalle de una metafora conceptual del corpus activo.

**Salida principal:**

- `id`, `nombre`, `descripcion`, `tipologia`
- `dominio_fuente`, `dominio_meta`
- `estadisticas`:
  - `total_expresiones`
  - `correspondencias_ontologicas_distintas`
  - `correspondencias_epistemicas_distintas`
- `correspondencias` agrupadas con frecuencia:
  - `ontologicas[]`
  - `epistemicas[]`
- `expresiones_asociadas[]` (muestra limitada a 20)

### 3.3 GET /api/v1/corpora/{slug}/metaphors/{id}/expressions

**Descripcion:** lista paginada de expresiones de una metafora.

**Query params:**

- `limit` (default `20`, max `100`)
- `offset` (default `0`)

**Salida principal:**

- `corpus_slug`
- `metaphor` (`id`, `nombre`)
- `total`, `limit`, `offset`
- `items[]` ordenado por `orden ASC, id ASC`

### 3.4 GET /api/v1/corpora/{slug}/metaphors/{id}/related

**Descripcion:** obtiene metaforas relacionadas a la metafora origen.

**Criterio de relacion:**

- comparte dominio base, o
- comparte dominio padre, o
- participa en dominio adyacente de la jerarquia (padre/hijo)

**Salida principal:**

- `source_metaphor` (`id`, `nombre`)
- `total`
- `items[]` (maximo 50) con resumen y `total_expresiones`

## 4. Reglas de negocio

1. **Solo corpus activos**
   - si `slug` no existe o no esta activo, responde `404`.

2. **Aislamiento estricto por tenant**
   - todas las consultas incluyen `corpus_id` para evitar fuga de datos entre corpus.

3. **Consistencia de orden y paginacion**
   - listados deterministas para facilitar consumo y pruebas.

4. **Correspondecias con frecuencia**
   - calculadas con `groupBy` sobre expresiones del corpus + metafora.

## 5. Implementacion tecnica

### 5.1 Archivo principal

- `app/server.ts`

### 5.2 Helpers reutilizados

- `parseNumberParam(...)`
- `parseStringParam(...)`
- `findActiveCorpusBySlug(...)`

### 5.3 Modelo de datos utilizado

- `Corpus`
- `ConceptualMetaphor`
- `MetaphoricalExpression`
- `Domain`

## 6. Manejo de errores

- `404`:
  - corpus inexistente/inactivo
  - metafora no encontrada en el corpus
- `500`:
  - error interno no controlado

Formato:

```json
{ "error": "mensaje" }
```

## 7. Ejecucion y validacion rapida

Levantar API:

```bash
npm install
npm run api
```

Pruebas manuales base:

```bash
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors?limit=5&offset=0"
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors/{id}"
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors/{id}/expressions?limit=5&offset=0"
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors/{id}/related"
```

## 8. Archivos relacionados

- `app/server.ts`
- `scripts/smoke-metaphors-api.ts`
- `package.json`
- `README.md`
- `prisma/schema.prisma`
