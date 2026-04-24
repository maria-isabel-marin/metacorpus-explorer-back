---
title: Implementacion API de Expresiones Metaforicas (Scoped a Corpus)
autor: Equipo MetaCorpus Explorer
fecha: 2026-04-23
version: 1.0.0
---

## 1. Objetivo

Documentar la implementacion de la API REST para consulta de expresiones metaforicas, aislada por corpus usando `slug` y `corpus_id`.

## 2. Alcance implementado

Endpoints implementados:

1. `GET /api/v1/corpora/{slug}/expressions`
2. `GET /api/v1/corpora/{slug}/expressions/{id}`
3. `GET /api/v1/corpora/{slug}/expressions/{id}/nearby?range=5`
4. `GET /api/v1/corpora/{slug}/expressions/search?q={query}`
5. `GET /api/v1/corpora/{slug}/expressions/concordance?q={query}`

Adicionalmente:

- respuesta JSON-LD (`@context`, `@type`)
- OpenAPI generado con `swagger-jsdoc` en `GET /api/v1/openapi.json`

## 3. Contrato funcional

### 3.1 Listado paginado y filtrable

`GET /api/v1/corpora/{slug}/expressions`

Query params soportados:

- `limit` y `offset`
- `sort=orden|id`
- `order=asc|desc`
- filtros combinables:
  - `metafora`
  - `dominio_fuente`
  - `dominio_meta`
  - `tipologia`
  - `cat_gramatical`
  - `fuente`

Reglas:

- aislamiento por `corpus_id`
- ordenamiento por `orden` (por defecto) o por `id`

### 3.2 Detalle de expresion

`GET /api/v1/corpora/{slug}/expressions/{id}`

- retorna todos los campos de la expresion
- incluye `orden`
- incluye relaciones relevantes (`fuente_textual`, `categoria_gramatical`, `metafora_conceptual`)

### 3.3 Nearby por orden en misma fuente

`GET /api/v1/corpora/{slug}/expressions/{id}/nearby?range=5`

- toma una expresion ancla
- busca expresiones en la misma `fuente_textual_id`
- rango de `orden` adyacente `orden ± range`

### 3.4 Busqueda full-text

`GET /api/v1/corpora/{slug}/expressions/search?q={query}`

- usa `to_tsvector` + `plainto_tsquery` con `pg_catalog.spanish`
- campos considerados: `expresion_metaforica`, `contexto`, `foco`
- resultados paginados (`limit/offset`) y ordenados por `ts_rank`

### 3.5 Concordancia KWIC

`GET /api/v1/corpora/{slug}/expressions/concordance?q={query}`

- busca coincidencias textuales en expresion/contexto/foco
- retorna lineas de concordancia con:
  - contexto izquierdo
  - keyword
  - contexto derecho

## 4. Aislamiento por corpus

Todos los endpoints de expresiones validan primero el corpus activo por `slug` y luego ejecutan consultas con `corpus_id` del corpus resuelto.

Con esto se evita filtrar o retornar datos de otro corpus.

## 5. Formato de respuesta

Se devuelve JSON-LD en endpoints de expresiones:

- `@context`: mapeo semantico base
- `@type`: tipo de respuesta (`Collection`, `SearchResult`, `ConcordanceResult`, etc.)

## 6. OpenAPI

Se genera especificacion OpenAPI con `swagger-jsdoc` y se expone en:

```http
GET /api/v1/openapi.json
```

## 7. Archivos modificados

- `app/server.ts`
- `package.json`
- `README.md`

## 8. Validacion manual sugerida

```bash
npm install
npm run api
```

Pruebas:

```bash
curl "http://localhost:3000/api/v1/corpora/cev-amazonia-2024/expressions?limit=10&offset=0&sort=orden&order=asc"
curl "http://localhost:3000/api/v1/corpora/cev-amazonia-2024/expressions/search?q=democracia"
curl "http://localhost:3000/api/v1/openapi.json"
```
