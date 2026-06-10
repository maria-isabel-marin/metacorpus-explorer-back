---
title: Implementacion API de Dominios y Relaciones Semanticas
autor: Equipo MetaCorpus Explorer
fecha: 2026-06-10
version: 1.0.0
---

## 1. Objetivo

Documentar la implementacion de los endpoints REST para dominios semanticos y relaciones semanticas acotados por corpus:

- `GET /api/v1/corpora/{slug}/domains`
- `GET /api/v1/corpora/{slug}/domain-relations`

Ademas se documenta la ampliacion del endpoint existente:

- `GET /api/v1/corpora` — ahora incluye `fecha_publicacion`

## 2. Alcance implementado

Se implementaron dos nuevos endpoints en `app/server.ts` con estas garantias:

1. **Aislamiento por corpus**: todas las consultas filtran por `corpus_id` derivado de `slug` activo.
2. **Calculo dinamico de jerarquia**: el campo `nivel_jerarquico` se calcula recorriendo la cadena de `dominio_padre_id` en memoria.
3. **Frecuencia calculada desde metaforas**: el campo `frecuencia` es la suma de metaforas donde el dominio aparece como fuente o meta.
4. **Filtro por tipo de dominio** en el listado (`fuente` o `meta`).
5. **Relaciones semanticas reales** desde la tabla `SemanticRelation`, sin datos mock.

## 3. Contrato de endpoints

### 3.1 GET /api/v1/corpora/{slug}/domains

**Descripcion:** lista todos los dominios del corpus activo.

**Query params:**

- `tipo` (opcional): `fuente` | `meta` — filtra por tipo de dominio

**Salida principal:**

```json
{
  "data": {
    "corpus_slug": "string",
    "total": 42,
    "items": [
      {
        "id": "uuid",
        "nombre": "CONSTRUCCION",
        "tipo": "fuente",
        "macrodominio": null,
        "frecuencia": 37,
        "descripcion": null,
        "dominio_padre_id": null,
        "nivel_jerarquico": 0
      }
    ]
  }
}
```

**Notas sobre los campos:**

- `macrodominio`: siempre `null`. El modelo `Domain` no tiene este campo; se reserva para una extension futura del schema.
- `nivel_jerarquico`: calculado recorriendo recursivamente `dominio_padre_id`. El nodo raiz devuelve `0`.
- `frecuencia`: suma de `metaforas_fuente._count` + `metaforas_meta._count` (metaforas conceptuales que referencian al dominio).

### 3.2 GET /api/v1/corpora/{slug}/domain-relations

**Descripcion:** lista las relaciones semanticas entre dominios del corpus activo.

**Salida principal:**

```json
{
  "data": {
    "corpus_slug": "string",
    "total": 12,
    "items": [
      {
        "dominio_id": "uuid-origen",
        "dominio_nombre": "EDIFICIO",
        "relacionado_con_id": "uuid-destino",
        "relacionado_con_nombre": "CONSTRUCCION",
        "tipo_relacion": "hiperonimia"
      }
    ]
  }
}
```

**Valores posibles de `tipo_relacion`** (en minusculas, derivados del enum `SemanticRelationType`):

- `hiperonimia`, `hiponimia`, `cohiponimia`, `meronimia`, `holonimia`, `sinonimia`, `antonimia`

### 3.3 GET /api/v1/corpora (ampliado)

Se agrego el campo `fecha_publicacion` (formato `YYYY-MM-DD` o `null`) a la respuesta del listado de corpus. Anteriormente este campo solo estaba disponible en el endpoint de detalle `/api/v1/corpora/{slug}`.

## 4. Reglas de negocio

1. **Solo corpus activos**
   - si `slug` no existe o no esta activo, responde `404`.

2. **Aislamiento estricto por tenant**
   - todas las consultas incluyen `corpus_id` para evitar fuga de datos entre corpus.

3. **Orden determinista**
   - dominios ordenados por `nombre ASC`.
   - relaciones ordenadas por `tipo_relacion ASC`.

4. **Calculo de jerarquia protegido contra ciclos**
   - `getNivel()` usa un `Set` de nodos visitados para evitar recursion infinita en caso de ciclos en los datos.

## 5. Implementacion tecnica

### 5.1 Archivo principal

- `app/server.ts`

### 5.2 Helpers reutilizados

- `parseStringParam(...)` — para leer el query param `tipo`
- `findActiveCorpusBySlug(...)` — resolucion de corpus por slug
- `toIsoDate(...)` — serializacion de fecha en el listado de corpus

### 5.3 Modelos de datos utilizados

- `Corpus`
- `Domain`
- `SemanticRelation`

### 5.4 Logica de nivel jerarquico

```typescript
const idToParent = new Map<string, string | null>(
  domains.map((d) => [d.id, d.dominio_padre_id])
);

function getNivel(id: string, visited = new Set<string>()): number {
  if (visited.has(id)) return 0;
  visited.add(id);
  const parentId = idToParent.get(id);
  if (!parentId) return 0;
  return 1 + getNivel(parentId, visited);
}
```

## 6. Manejo de errores

- `404`:
  - corpus inexistente o inactivo
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
# Todos los dominios
curl "http://localhost:3000/api/v1/corpora/{slug}/domains"

# Solo dominios fuente
curl "http://localhost:3000/api/v1/corpora/{slug}/domains?tipo=fuente"

# Solo dominios meta
curl "http://localhost:3000/api/v1/corpora/{slug}/domains?tipo=meta"

# Relaciones semanticas
curl "http://localhost:3000/api/v1/corpora/{slug}/domain-relations"

# Listado de corpus (ahora incluye fecha_publicacion)
curl "http://localhost:3000/api/v1/corpora"
```

## 8. Archivos relacionados

- `app/server.ts`
- `prisma/schema.prisma`
- `package.json`
- `README.md`
