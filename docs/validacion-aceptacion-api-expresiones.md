---
title: Validacion de Aceptacion - API de Expresiones Metaforicas
autor: Equipo MetaCorpus Explorer
fecha: 2026-04-22
version: 1.0.0
---

## 1. Objetivo

Definir una bateria de pruebas manuales para validar criterios de aceptacion de la tarea **API de expresiones metaforicas (scoped a corpus)**.

## 2. Precondiciones

1. Dependencias instaladas:

```bash
npm install
```

2. API en ejecucion:

```bash
npm run api
```

3. Base de datos con datos cargados (seed o ingesta CLI).

## 3. Variables de apoyo

```bash
BASE_URL="http://localhost:3000"
CORPUS_OK="cev-amazonia-2024"
CORPUS_ALT="medios-politica-2025"
```

> Si no usas bash, reemplaza manualmente variables en cada comando.

## 4. Casos de prueba de aceptacion

## 4.1 Listado paginado base

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions?limit=10&offset=0"
```

Esperado:

- HTTP 200
- `@context` y `@type` presentes
- `limit=10`, `offset=0`
- `items` arreglo

## 4.2 Ordenamiento por `orden`

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions?limit=10&sort=orden&order=asc"
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions?limit=10&sort=orden&order=desc"
```

Esperado:

- HTTP 200
- en `asc`, los `items[].orden` van no-decreciente
- en `desc`, los `items[].orden` van no-creciente

## 4.3 Ordenamiento por `id`

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions?limit=10&sort=id&order=asc"
```

Esperado:

- HTTP 200
- orden lexicografico por `id`

## 4.4 Filtros combinables

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions?tipologia=estructural&cat_gramatical=V&fuente=Amazonia"
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions?metafora=POLITICA%20ES%20GUERRA&dominio_fuente=GUERRA&dominio_meta=POLITICA"
```

Esperado:

- HTTP 200
- todos los resultados cumplen simultaneamente los filtros enviados

## 4.5 Detalle por ID (incluye `orden`)

1. obtener un id valido:

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions?limit=1"
```

2. consultar detalle con ese `id`:

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions/{ID_OBTENIDO}"
```

Esperado:

- HTTP 200
- `data.orden` presente
- `data.fuente_textual`, `data.cat_gramatical`, `data.metafora_conceptual` presentes

## 4.6 Nearby por rango

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions/{ID_OBTENIDO}/nearby?range=5"
```

Esperado:

- HTTP 200
- `anchor` corresponde a la expresion consultada
- `items` contiene expresiones de la misma fuente textual
- `items[].orden` dentro de `anchor.orden +/- 5`

## 4.7 Busqueda full-text

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions/search?q=democracia&limit=10&offset=0"
```

Esperado:

- HTTP 200
- `@type = "SearchResult"`
- `q`, `total`, `items` presentes

Validacion de error esperado:

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions/search"
```

- HTTP 400 por falta de `q`

## 4.8 Concordancia KWIC

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_OK/expressions/concordance?q=rio&limit=10&offset=0"
```

Esperado:

- HTTP 200
- `@type = "ConcordanceResult"`
- cada item incluye `kwic.left`, `kwic.keyword`, `kwic.right`

## 4.9 Aislamiento por corpus

1. tomar un `id` del corpus A (`$CORPUS_OK`)
2. consultar ese mismo `id` en corpus B (`$CORPUS_ALT`):

```bash
curl "$BASE_URL/api/v1/corpora/$CORPUS_ALT/expressions/{ID_DE_CORPUS_OK}"
```

Esperado:

- HTTP 404
- no se filtran datos entre corpus

## 4.10 OpenAPI generado

```bash
curl "$BASE_URL/api/v1/openapi.json"
```

Esperado:

- HTTP 200
- documento OpenAPI 3 (`openapi`, `paths`, etc.)
- presencia de rutas de expressions

## 5. Checklist rapido de aceptacion

- [ ] endpoints funcionales
- [ ] paginacion `limit/offset`
- [ ] filtros combinables
- [ ] aislamiento por corpus
- [ ] ordenamiento por `orden`
- [ ] endpoint nearby funcional
- [ ] respuestas JSON-LD
- [ ] OpenAPI via swagger-jsdoc

## 6. Ejecucion automatizada (smoke test)

Con la API ya levantada (`npm run api`), puedes ejecutar:

```bash
npm run smoke:expressions-api
```

Variables opcionales:

- `BASE_URL` (default: `http://localhost:3000`)
- `CORPUS_OK` (default: `cev-amazonia-2024`)
- `CORPUS_ALT` (default: `medios-politica-2025`)
- `SEARCH_Q` (default: `democracia`)
- `CONCORDANCE_Q` (default: `rio`)

Notas de comportamiento:

- si `CORPUS_OK` no existe/esta inactivo, el script selecciona automaticamente el primer corpus activo.
- si no hay un segundo corpus activo, se omite la prueba de aislamiento cruzado.
