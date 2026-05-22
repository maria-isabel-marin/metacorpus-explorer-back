---
title: Implementacion CLI de Ingesta MIPVU (Excel -> PostgreSQL)
autor: Equipo MetaCorpus Explorer
fecha: 2026-04-21
version: 1.0.0
---

## 1. Objetivo

Documentar la implementacion del script administrativo `scripts/ingest.ts` para importar archivos MIPVU en formato `.xlsx` hacia PostgreSQL, asociados a un `corpus` especifico.

## 2. Alcance

El CLI implementa:

- lectura de Excel (`.xlsx`, primera hoja)
- normalizacion de encabezados y campos textuales
- deduplicacion de dominios y metaforas conceptuales por corpus
- validacion de unicidad de `orden` por fuente textual
- importacion idempotente de expresiones por (`corpus_id`, `id_registro`)
- reporte de importacion en consola

## 3. Parametros de ejecucion

Comando base:

```bash
npx ts-node scripts/ingest.ts --file corpus.xlsx --corpus cev-amazonia --name "CEV Amazonia" --license "CC-BY-4.0"
```

Parametros:

- `--file` (obligatorio): ruta al archivo `.xlsx`
- `--corpus` (obligatorio): slug del corpus destino
- `--name` (opcional): nombre del corpus (creacion/actualizacion)
- `--description` (opcional): descripcion del corpus
- `--license` (opcional): licencia del corpus

## 4. Reglas de normalizacion

### 4.1 Encabezados

Se normalizan encabezados de Excel a formato canonico:

- minusculas
- sin diacriticos
- separador `_`

Esto permite mapear variaciones como `año`, `ano`, `year` al mismo campo.

### 4.2 Tipologia

`tipologia` se normaliza a:

- minusculas
- sin acentos
- sin puntuacion final redundante

### 4.3 Dominios y metaforas

- dominios -> mayusculas sin diacriticos
- metaforas conceptuales -> mayusculas sin diacriticos

## 5. Reglas de integridad e idempotencia

1. **Orden por fuente textual**
   - validacion previa en memoria: no se permiten filas duplicadas con la misma combinacion `(fuente_textual, orden)` dentro del mismo Excel.
   - si el archivo no trae columna `orden`, se infiere desde el sufijo numerico del `id_registro` (ej. `CEV_45` -> `45`).

2. **Id de registro**
   - si no existe `id_registro`, se genera `AUTO_<hash>` deterministico.
   - se valida que no se repita en el archivo.

3. **Idempotencia de expresiones**
   - clave de idempotencia: `corpus_id + id_registro`.
   - si existe, se actualiza.
   - si no existe, se crea.

4. **Deduplicacion por corpus**
   - `domain`: `corpus_id + nombre + tipo`
   - `grammatical_category`: `corpus_id + abreviatura`
   - `conceptual_metaphor`: `corpus_id + nombre`

## 6. Manejo de errores

- Se captura violacion de unicidad en Prisma (`P2002`) para dar mensaje explicito cuando falla la restriccion `(corpus_id, fuente_textual_id, orden)`.
- Se valida existencia de `DATABASE_URL`.
- Se valida que el archivo exista y sea `.xlsx`.

## 7. Reporte de importacion

Al finalizar, el CLI imprime:

- corpus destino
- archivo origen
- filas leidas
- expresiones creadas / actualizadas
- fuentes textuales creadas
- categorias gramaticales creadas
- dominios creados
- metaforas conceptuales creadas

## 8. Dependencias tecnicas

- `typescript`
- `ts-node`
- `xlsx`
- `@types/xlsx`
- `@prisma/client`
- `@prisma/adapter-pg`
- `pg`

## 9. Archivos relacionados

- `scripts/ingest.ts`
- `package.json`
- `tsconfig.json`
- `README.md`

## 10. Validacion recomendada post-ingesta

```sql
-- Total de expresiones por corpus
SELECT c.slug, count(*) AS total
FROM metaphorical_expression me
JOIN corpus c ON c.id = me.corpus_id
GROUP BY c.slug;
```

```sql
-- Debe devolver 0 filas (sin duplicados de orden por fuente/corpus)
SELECT corpus_id, fuente_textual_id, orden, count(*)
FROM metaphorical_expression
GROUP BY corpus_id, fuente_textual_id, orden
HAVING count(*) > 1;
```
