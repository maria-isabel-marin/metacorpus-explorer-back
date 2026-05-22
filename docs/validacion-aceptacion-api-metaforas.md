---
title: Validacion de Aceptacion API de Metaforas Conceptuales
autor: Equipo MetaCorpus Explorer
fecha: 2026-04-24
version: 1.0.0
---

## 1. Objetivo

Definir una guia de validacion (manual + automatizada) para los endpoints de metaforas conceptuales scoped a corpus.

## 2. Precondiciones

1. Base de datos migrada y con datos cargados.
2. Variable `DATABASE_URL` configurada.
3. API levantada en `http://localhost:3000` (o `BASE_URL` personalizado).

Arranque recomendado:

```bash
npm install
npm run api
```

## 3. Criterios de aceptacion a cubrir

1. Endpoints funcionales para listado, detalle, expresiones y relacionadas.
2. Filtros operativos en listado (`dominio_fuente`, `dominio_meta`, `tipologia`).
3. Paginacion funcional en expresiones por metafora (`limit`, `offset`).
4. Aislamiento por corpus (sin fuga de datos entre slugs).
5. Metaforas relacionadas correctamente excluyen la metafora origen.

## 4. Casos manuales (curl)

> Reemplazar `{slug}` y `{id}` por valores reales.

### Caso A: listado base

```bash
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors?limit=5&offset=0"
```

Esperado:

- HTTP `200`
- `data.items` arreglo
- `data.limit=5`, `data.offset=0`

### Caso B: filtros combinables

```bash
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors?dominio_fuente=viaje&dominio_meta=politica&tipologia=estructural&limit=10&offset=0"
```

Esperado:

- HTTP `200`
- sin error por combinacion de filtros

### Caso C: detalle de metafora

```bash
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors/{id}"
```

Esperado:

- HTTP `200`
- bloque `estadisticas`
- bloque `correspondencias` con listas `ontologicas` y `epistemicas`
- `expresiones_asociadas` presente

### Caso D: expresiones por metafora paginadas

```bash
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors/{id}/expressions?limit=5&offset=0"
```

Esperado:

- HTTP `200`
- `data.items` arreglo
- `limit` y `offset` reflejados en respuesta

### Caso E: metaforas relacionadas

```bash
curl "http://localhost:3000/api/v1/corpora/{slug}/metaphors/{id}/related"
```

Esperado:

- HTTP `200`
- `data.source_metaphor.id == {id}`
- `data.items` no contiene `{id}`

### Caso F: corpus inexistente/inactivo

```bash
curl "http://localhost:3000/api/v1/corpora/slug-inexistente/metaphors"
```

Esperado:

- HTTP `404`
- mensaje de error indicando corpus no encontrado/activo

## 5. Prueba automatizada (smoke test)

Script incluido:

- `scripts/smoke-metaphors-api.ts`

Ejecucion:

```bash
npm run smoke:metaphors-api
```

Cobertura del smoke:

1. Descubre corpus activos.
2. Selecciona automaticamente un corpus con al menos una metafora.
3. Valida listado base de metaforas.
4. Valida filtro por tipologia (si existe dato).
5. Valida filtro por dominio fuente (si existe dato).
6. Valida detalle de metafora.
7. Valida paginacion en expresiones por metafora.
8. Valida endpoint de relacionadas.
9. Valida aislamiento por corpus contra un segundo slug activo (si existe).

## 6. Resultado esperado del smoke

Salida esperada (ejemplo):

```text
Iniciando smoke tests contra http://localhost:3000
OK  - Listado de corpus activos disponible
OK  - Corpus seleccionado para pruebas: <slug>
OK  - Listado de metaforas con paginacion
OK  - Detalle de metafora conceptual
OK  - Expresiones por metafora con paginacion
OK  - Metaforas relacionadas por dominios
Smoke tests de API de metaforas finalizados correctamente.
```

Si ocurre un fallo:

- el script imprime `ERROR - ...`
- finaliza con `process.exitCode = 1`

## 7. Archivos relacionados

- `app/server.ts`
- `scripts/smoke-metaphors-api.ts`
- `package.json`
- `docs/implementacion-api-metaforas-conceptuales.md`
