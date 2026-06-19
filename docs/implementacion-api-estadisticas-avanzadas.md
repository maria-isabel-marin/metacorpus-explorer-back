---
title: Implementacion API de Estadisticas Avanzadas
autor: Equipo MetaCorpus Explorer
fecha: 2026-06-16
version: 1.0.0
---

## 1. Objetivo

Documentar la implementacion de la API REST para estadisticas avanzadas de visualizacion:

- `GET /api/v1/corpora/{slug}/stats/density`
- `GET /api/v1/corpora/{slug}/stats/proximity`
- `GET /api/v1/corpora/{slug}/stats/domain-matrix`

## 2. Alcance implementado

Se implementaron endpoints en `app/server.ts` para soportar los graficos avanzados del dashboard de estadisticas:

1. **Densidad metafórica por orden**: distribucion de expresiones en buckets segun su posicion (campo `orden`).
2. **Proximidad textual**: datos para scatter plot mostrando expresiones cercanas en el texto.
3. **Matriz de dominios**: heatmap de co-ocurrencia entre dominios fuente y meta.

Todos los endpoints filtran por `corpus_id` derivado del `slug` activo.

## 3. Contrato de endpoints

### 3.1 GET /api/v1/corpora/{slug}/stats/density

**Descripcion:** calcula la densidad metafórica por rangos de orden (posicion en texto).

**Query params:**

- `bucket` (default `100`, min `10`, max `1000`): tamaño del bucket para agrupar expresiones

**Salida principal:**

- `corpus_slug`: identificador del corpus
- `bucket_size`: tamaño usado para los buckets
- `total_expressions`: total de expresiones analizadas
- `max_orden`: valor maximo del campo orden
- `buckets[]` con:
  - `range`: rango textual (ej: "0-99")
  - `start`, `end`: limites numericos
  - `count`: cantidad de expresiones en el bucket
  - `byTypology`: desglose por tipologia (Estructural, Ontologica, Orientacional, Otra)

### 3.2 GET /api/v1/corpora/{slug}/stats/proximity

**Descripcion:** datos para grafico de dispersion (scatter) de proximidad textual.

**Query params:**

- `range` (default `50`, min `10`, max `200`): ventana de proximidad (±orden)
- `limit` (default `1000`, min `100`, max `5000`): maximo de puntos a retornar

**Salida principal:**

- `corpus_slug`: identificador del corpus
- `range`: ventana de proximidad usada
- `total_points`: cantidad de puntos en la respuesta
- `data[]` con cada punto:
  - `x`: orden (posicion en texto)
  - `y`: cantidad de expresiones cercanas
  - `metaphorId`, `metaphorName`: metáfora asociada
  - `expression`: texto de la expresion
  - `focus`: foco de la metáfora
  - `typology`: tipologia
  - `domainSource`, `domainTarget`: dominios

### 3.3 GET /api/v1/corpora/{slug}/stats/domain-matrix

**Descripcion:** matriz de co-ocurrencia dominio fuente × dominio meta para heatmap.

**Query params:**

- `minCount` (default `1`, min `1`, max `100`): minimo de expresiones para incluir celda
- `limit` (default `50`, min `10`, max `100`): maximo de dominios a retornar

**Salida principal:**

- `corpus_slug`: identificador del corpus
- `source_domains[]`: lista de dominios fuente
- `target_domains[]`: lista de dominios meta
- `min_count`: filtro minimo aplicado
- `matrix`: objeto anidado `{ [source]: { [target]: { count, metaphorIds[] } } }`

## 4. Consideraciones tecnicas

- Los endpoints usan Prisma ORM para consultas a PostgreSQL.
- Los datos se calculan en tiempo real sobre el corpus activo.
- Se recomienda implementar cache para corpus grandes.
- El endpoint `proximity` puede ser costoso para corpus muy grandes (>10k expresiones).

## 5. Ejemplos de uso

```bash
# Densidad con buckets de 200
curl "/api/v1/corpora/micorpus/stats/density?bucket=200"

# Proximidad con ventana de 100
curl "/api/v1/corpora/micorpus/stats/proximity?range=100&limit=500"

# Matriz con minimo 5 expresiones
curl "/api/v1/corpora/micorpus/stats/domain-matrix?minCount=5"
```
