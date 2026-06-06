import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const swaggerJsdoc = require('swagger-jsdoc') as (options: unknown) => unknown;

const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: new (args?: unknown) => unknown;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no está definida en variables de entorno.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter }) as any;

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(cors({
  origin: [
    'http://metacorpus-explorer-front.railway.internal:8080',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

type SortField = 'orden' | 'id';
type SortDirection = 'asc' | 'desc';

const jsonLdContext = {
  '@vocab': 'https://metacorpus.example/vocab#',
  id: '@id',
  type: '@type',
  corpus_slug: 'corpusSlug',
  numero_registros: 'recordCount',
  expresion_metaforica: 'metaphoricalExpression',
  fuente_textual: 'textualSource',
  cat_gramatical: 'grammaticalCategory',
  metafora_conceptual: 'conceptualMetaphor'
};

// ========== FUNCIONES AUXILIARES COMUNES ==========
function parseNumberParam(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function parseSortField(value: unknown): SortField {
  return value === 'id' ? 'id' : 'orden';
}

function parseSortDirection(value: unknown): SortDirection {
  return value === 'desc' ? 'desc' : 'asc';
}

function parseStringParam(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function buildKwic(text: string, query: string, windowSize = 40): { left: string; keyword: string; right: string } {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const startIndex = lowerText.indexOf(lowerQuery);

  if (startIndex === -1) {
    return {
      left: text.slice(0, windowSize),
      keyword: query,
      right: text.slice(windowSize, windowSize * 2)
    };
  }

  const endIndex = startIndex + query.length;
  const leftStart = Math.max(0, startIndex - windowSize);
  const rightEnd = Math.min(text.length, endIndex + windowSize);

  return {
    left: text.slice(leftStart, startIndex),
    keyword: text.slice(startIndex, endIndex),
    right: text.slice(endIndex, rightEnd)
  };
}

async function findActiveCorpusBySlug(slug: string): Promise<{ id: string; slug: string; nombre: string } | null> {
  return prisma.corpus.findFirst({
    where: {
      slug,
      activo: true
    },
    select: {
      id: true,
      slug: true,
      nombre: true
    }
  });
}

function serializeExpression(expression: any): Record<string, unknown> {
  return {
    '@type': 'MetaphoricalExpression',
    id: expression.id,
    id_registro: expression.id_registro,
    orden: expression.orden,
    pagina: expression.pagina,
    expresion_metaforica: expression.expresion_metaforica,
    contexto: expression.contexto,
    foco: expression.foco,
    foco_lematizado: expression.foco_lematizado,
    significado_contextual: expression.significado_contextual,
    significado_basico: expression.significado_basico,
    corresp_ontologicas: expression.corresp_ontologicas,
    corresp_epistemicas: expression.corresp_epistemicas,
    tipologia: expression.tipologia,
    observaciones: expression.observaciones,
    fuente_textual: expression.fuente_textual,
    cat_gramatical: expression.categoria_gramatical,
    metafora_conceptual: expression.metafora_conceptual
  };
}

function getExpressionSelect(): Record<string, unknown> {
  return {
    id: true,
    id_registro: true,
    orden: true,
    pagina: true,
    expresion_metaforica: true,
    contexto: true,
    foco: true,
    foco_lematizado: true,
    significado_contextual: true,
    significado_basico: true,
    corresp_ontologicas: true,
    corresp_epistemicas: true,
    tipologia: true,
    observaciones: true,
    fuente_textual_id: true,
    fuente_textual: {
      select: {
        id: true,
        titulo_1: true,
        titulo_2: true,
        titulo_3: true,
        autor: true,
        anio: true,
        referencia_bib: true
      }
    },
    categoria_gramatical: {
      select: {
        id: true,
        nombre: true,
        abreviatura: true
      }
    },
    metafora_conceptual: {
      select: {
        id: true,
        nombre: true,
        tipologia: true,
        dominio_fuente: {
          select: {
            id: true,
            nombre: true,
            tipo: true
          }
        },
        dominio_meta: {
          select: {
            id: true,
            nombre: true,
            tipo: true
          }
        }
      }
    }
  };
}

const openApiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'MetaCorpus Explorer API',
      version: '1.0.0',
      description: 'API REST para corpus y expresiones metafóricas.'
    },
    servers: [{ url: `http://localhost:${port}` }],
    paths: {
      '/api/v1/corpora/{slug}/expressions': {
        get: {
          summary: 'Listado paginado de expresiones metafóricas por corpus',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['orden', 'id'], default: 'orden' } },
            { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
            { name: 'metafora', in: 'query', schema: { type: 'string' } },
            { name: 'dominio_fuente', in: 'query', schema: { type: 'string' } },
            { name: 'dominio_meta', in: 'query', schema: { type: 'string' } },
            { name: 'tipologia', in: 'query', schema: { type: 'string' } },
            { name: 'cat_gramatical', in: 'query', schema: { type: 'string' } },
            { name: 'fuente', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Colección de expresiones en JSON-LD' },
            '404': { description: 'Corpus no encontrado o inactivo' }
          }
        }
      },
      '/api/v1/corpora/{slug}/expressions/{id}': {
        get: {
          summary: 'Detalle de una expresión metafórica',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            '200': { description: 'Detalle de expresión en JSON-LD' },
            '404': { description: 'No encontrado' }
          }
        }
      },
      '/api/v1/corpora/{slug}/expressions/{id}/nearby': {
        get: {
          summary: 'Expresiones adyacentes por orden en la misma fuente textual',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'range', in: 'query', schema: { type: 'integer', default: 5 } }
          ],
          responses: {
            '200': { description: 'Contexto cercano de expresiones' },
            '404': { description: 'No encontrado' }
          }
        }
      },
      '/api/v1/corpora/{slug}/expressions/search': {
        get: {
          summary: 'Búsqueda full-text por expresión, contexto y foco',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: {
            '200': { description: 'Resultados de búsqueda full-text' },
            '404': { description: 'Corpus no encontrado o inactivo' }
          }
        }
      },
      '/api/v1/corpora/{slug}/expressions/concordance': {
        get: {
          summary: 'Concordancia KWIC',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: {
            '200': { description: 'Concordancias KWIC en JSON-LD' },
            '404': { description: 'Corpus no encontrado o inactivo' }
          }
        }
      },
      // Nuevos endpoints para metáforas conceptuales (MET-40)
      '/api/v1/corpora/{slug}/metaphors': {
        get: {
          summary: 'Listado paginado de metáforas conceptuales por corpus',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'dominio_fuente', in: 'query', schema: { type: 'string' } },
            { name: 'dominio_meta', in: 'query', schema: { type: 'string' } },
            { name: 'tipologia', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Colección de metáforas conceptuales' },
            '404': { description: 'Corpus no encontrado o inactivo' }
          }
        }
      },
      '/api/v1/corpora/{slug}/metaphors/{id}': {
        get: {
          summary: 'Detalle de una metáfora conceptual',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            '200': { description: 'Detalle de metáfora conceptual' },
            '404': { description: 'No encontrado' }
          }
        }
      },
      '/api/v1/corpora/{slug}/metaphors/{id}/expressions': {
        get: {
          summary: 'Expresiones asociadas a una metáfora conceptual',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: {
            '200': { description: 'Expresiones asociadas' },
            '404': { description: 'No encontrado' }
          }
        }
      },
      '/api/v1/corpora/{slug}/metaphors/{id}/related': {
        get: {
          summary: 'Metáforas relacionadas por dominios compartidos',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            '200': { description: 'Metáforas relacionadas' },
            '404': { description: 'No encontrado' }
          }
        }
      }
    }
  },
  apis: []
});

function toIsoDate(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

function getAuthorNames(autores: unknown): string[] {
  if (!Array.isArray(autores)) {
    return [];
  }

  const names: string[] = [];
  for (const autor of autores) {
    if (!autor || typeof autor !== 'object') {
      continue;
    }

    const maybeNombre = (autor as { nombre?: unknown }).nombre;
    if (typeof maybeNombre === 'string' && maybeNombre.trim()) {
      names.push(maybeNombre.trim());
    }
  }

  return names;
}

function buildCitation(corpus: {
  nombre: string;
  autores: unknown;
  fecha_publicacion: Date | null;
  version: string;
  doi: string | null;
}): string {
  const authors = getAuthorNames(corpus.autores);
  const authorsText = authors.length > 0 ? authors.join(', ') : corpus.nombre;
  const year = corpus.fecha_publicacion ? corpus.fecha_publicacion.getUTCFullYear() : 's.f.';
  const doiText = corpus.doi ? ` DOI: ${corpus.doi}` : '';

  return `${authorsText} (${year}). ${corpus.nombre} (v${corpus.version}).${doiText}`.trim();
}

// ========== ENDPOINTS DE EXPRESIONES METAFÓRICAS ==========

app.get('/api/v1/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

app.get('/api/v1/corpora/:slug/expressions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const limit = parseNumberParam(req.query.limit, 20, 1, 100);
    const offset = parseNumberParam(req.query.offset, 0, 0);
    const sortField = parseSortField(req.query.sort);
    const sortDirection = parseSortDirection(req.query.order);

    const metafora = parseStringParam(req.query.metafora);
    const dominioFuente = parseStringParam(req.query.dominio_fuente);
    const dominioMeta = parseStringParam(req.query.dominio_meta);
    const tipologia = parseStringParam(req.query.tipologia);
    const catGramatical = parseStringParam(req.query.cat_gramatical);
    const fuente = parseStringParam(req.query.fuente);

    const where: Record<string, unknown> = { corpus_id: corpus.id };

    if (tipologia) {
      where.tipologia = { contains: tipologia, mode: 'insensitive' };
    }

    if (catGramatical) {
      where.categoria_gramatical = {
        is: {
          OR: [
            { nombre: { contains: catGramatical, mode: 'insensitive' } },
            { abreviatura: { contains: catGramatical, mode: 'insensitive' } }
          ]
        }
      };
    }

    if (fuente) {
      where.fuente_textual = {
        is: {
          OR: [
            { titulo_1: { contains: fuente, mode: 'insensitive' } },
            { titulo_2: { contains: fuente, mode: 'insensitive' } },
            { titulo_3: { contains: fuente, mode: 'insensitive' } },
            { autor: { contains: fuente, mode: 'insensitive' } },
            { referencia_bib: { contains: fuente, mode: 'insensitive' } }
          ]
        }
      };
    }

    if (metafora || dominioFuente || dominioMeta) {
      const conceptualWhere: Record<string, unknown> = {};

      if (metafora) {
        conceptualWhere.nombre = { contains: metafora, mode: 'insensitive' };
      }

      if (dominioFuente) {
        conceptualWhere.dominio_fuente = {
          is: {
            nombre: { contains: dominioFuente, mode: 'insensitive' }
          }
        };
      }

      if (dominioMeta) {
        conceptualWhere.dominio_meta = {
          is: {
            nombre: { contains: dominioMeta, mode: 'insensitive' }
          }
        };
      }

      where.metafora_conceptual = { is: conceptualWhere };
    }

    const [total, items] = await Promise.all([
      prisma.metaphoricalExpression.count({ where }),
      prisma.metaphoricalExpression.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy:
          sortField === 'orden'
            ? [{ orden: sortDirection }, { id: 'asc' }]
            : [{ id: sortDirection }],
        select: getExpressionSelect()
      })
    ]);

    res.json({
      '@context': jsonLdContext,
      '@type': 'Collection',
      corpus_slug: corpus.slug,
      total,
      limit,
      offset,
      sort: sortField,
      order: sortDirection,
      items: items.map((item: any) => serializeExpression(item))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/corpora/:slug/expressions/:id([0-9a-fA-F-]{36})', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const expression = await prisma.metaphoricalExpression.findFirst({
      where: {
        id: req.params.id,
        corpus_id: corpus.id
      },
      select: getExpressionSelect()
    });

    if (!expression) {
      res.status(404).json({ error: `No existe expresión '${req.params.id}' en el corpus '${corpus.slug}'.` });
      return;
    }

    res.json({
      '@context': jsonLdContext,
      data: serializeExpression(expression)
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  '/api/v1/corpora/:slug/expressions/:id([0-9a-fA-F-]{36})/nearby',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const corpus = await findActiveCorpusBySlug(req.params.slug);
      if (!corpus) {
        res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
        return;
      }

      const range = parseNumberParam(req.query.range, 5, 1, 50);

      const target = await prisma.metaphoricalExpression.findFirst({
        where: {
          id: req.params.id,
          corpus_id: corpus.id
        },
        select: getExpressionSelect()
      });

      if (!target) {
        res.status(404).json({ error: `No existe expresión '${req.params.id}' en el corpus '${corpus.slug}'.` });
        return;
      }

      const nearby = await prisma.metaphoricalExpression.findMany({
        where: {
          corpus_id: corpus.id,
          fuente_textual_id: target.fuente_textual_id,
          orden: {
            gte: target.orden - range,
            lte: target.orden + range
          },
          NOT: {
            id: target.id
          }
        },
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
        select: getExpressionSelect()
      });

      res.json({
        '@context': jsonLdContext,
        '@type': 'ExpressionNearbyResult',
        corpus_slug: corpus.slug,
        range,
        anchor: serializeExpression(target),
        items: nearby.map((item: any) => serializeExpression(item))
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get('/api/v1/corpora/:slug/expressions/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const q = parseStringParam(req.query.q);
    if (!q) {
      res.status(400).json({ error: "El parámetro 'q' es obligatorio." });
      return;
    }

    const limit = parseNumberParam(req.query.limit, 20, 1, 100);
    const offset = parseNumberParam(req.query.offset, 0, 0);

    const countRows = await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(*)::int AS total
      FROM metaphorical_expression me
      WHERE me.corpus_id = $1::uuid
        AND to_tsvector(
          'pg_catalog.spanish'::regconfig,
          coalesce(me.expresion_metaforica, '') || ' ' ||
          coalesce(me.contexto, '') || ' ' ||
          coalesce(me.foco, '')
        ) @@ plainto_tsquery('pg_catalog.spanish'::regconfig, $2)
      `,
      corpus.id,
      q
    );

    const rankedRows = await prisma.$queryRawUnsafe(
      `
      SELECT me.id
      FROM metaphorical_expression me
      WHERE me.corpus_id = $1::uuid
        AND to_tsvector(
          'pg_catalog.spanish'::regconfig,
          coalesce(me.expresion_metaforica, '') || ' ' ||
          coalesce(me.contexto, '') || ' ' ||
          coalesce(me.foco, '')
        ) @@ plainto_tsquery('pg_catalog.spanish'::regconfig, $2)
      ORDER BY ts_rank(
        to_tsvector(
          'pg_catalog.spanish'::regconfig,
          coalesce(me.expresion_metaforica, '') || ' ' ||
          coalesce(me.contexto, '') || ' ' ||
          coalesce(me.foco, '')
        ),
        plainto_tsquery('pg_catalog.spanish'::regconfig, $2)
      ) DESC, me.orden ASC
      LIMIT $3 OFFSET $4
      `,
      corpus.id,
      q,
      limit,
      offset
    );

    const total = Array.isArray(countRows) && countRows[0] ? Number((countRows[0] as any).total) : 0;
    const expressionIds = Array.isArray(rankedRows) ? rankedRows.map((row: any) => row.id) : [];

    let items: any[] = [];
    if (expressionIds.length > 0) {
      const expressions = await prisma.metaphoricalExpression.findMany({
        where: {
          corpus_id: corpus.id,
          id: { in: expressionIds }
        },
        select: getExpressionSelect()
      });

      const byId = new Map(expressions.map((expression: any) => [expression.id, expression]));
      items = expressionIds
        .map((id: string) => byId.get(id))
        .filter(Boolean)
        .map((expression: any) => serializeExpression(expression));
    }

    res.json({
      '@context': jsonLdContext,
      '@type': 'SearchResult',
      corpus_slug: corpus.slug,
      q,
      total,
      limit,
      offset,
      items
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/corpora/:slug/expressions/concordance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const q = parseStringParam(req.query.q);
    if (!q) {
      res.status(400).json({ error: "El parámetro 'q' es obligatorio." });
      return;
    }

    const limit = parseNumberParam(req.query.limit, 20, 1, 100);
    const offset = parseNumberParam(req.query.offset, 0, 0);

    const expressions = await prisma.metaphoricalExpression.findMany({
      where: {
        corpus_id: corpus.id,
        OR: [
          { expresion_metaforica: { contains: q, mode: 'insensitive' } },
          { contexto: { contains: q, mode: 'insensitive' } },
          { foco: { contains: q, mode: 'insensitive' } }
        ]
      },
      orderBy: [{ orden: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
      select: {
        id: true,
        id_registro: true,
        orden: true,
        expresion_metaforica: true,
        contexto: true,
        foco: true,
        fuente_textual: {
          select: {
            id: true,
            titulo_1: true,
            autor: true
          }
        }
      }
    });

    const total = await prisma.metaphoricalExpression.count({
      where: {
        corpus_id: corpus.id,
        OR: [
          { expresion_metaforica: { contains: q, mode: 'insensitive' } },
          { contexto: { contains: q, mode: 'insensitive' } },
          { foco: { contains: q, mode: 'insensitive' } }
        ]
      }
    });

    const items = expressions.map((expression: any) => {
      const baseText = expression.contexto || expression.expresion_metaforica || expression.foco || '';
      const kwic = buildKwic(baseText, q);

      return {
        '@type': 'ConcordanceLine',
        expression_id: expression.id,
        id_registro: expression.id_registro,
        orden: expression.orden,
        fuente_textual: expression.fuente_textual,
        kwic
      };
    });

    res.json({
      '@context': jsonLdContext,
      '@type': 'ConcordanceResult',
      corpus_slug: corpus.slug,
      q,
      total,
      limit,
      offset,
      items
    });
  } catch (error) {
    next(error);
  }
});

// ========== ENDPOINTS DE METÁFORAS CONCEPTUALES ==========

app.get('/api/v1/corpora/:slug/metaphors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const limit = parseNumberParam(req.query.limit, 20, 1, 100);
    const offset = parseNumberParam(req.query.offset, 0, 0);
    const dominioFuente = parseStringParam(req.query.dominio_fuente);
    const dominioMeta = parseStringParam(req.query.dominio_meta);
    const tipologia = parseStringParam(req.query.tipologia);

    const where: Record<string, unknown> = {
      corpus_id: corpus.id
    };

    if (tipologia) {
      where.tipologia = { contains: tipologia, mode: 'insensitive' };
    }

    if (dominioFuente) {
      where.dominio_fuente = {
        is: {
          nombre: { contains: dominioFuente, mode: 'insensitive' }
        }
      };
    }

    if (dominioMeta) {
      where.dominio_meta = {
        is: {
          nombre: { contains: dominioMeta, mode: 'insensitive' }
        }
      };
    }

    const [total, metaphors] = await Promise.all([
      prisma.conceptualMetaphor.count({ where }),
      prisma.conceptualMetaphor.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          tipologia: true,
          dominio_fuente: {
            select: {
              id: true,
              nombre: true,
              tipo: true
            }
          },
          dominio_meta: {
            select: {
              id: true,
              nombre: true,
              tipo: true
            }
          },
          _count: {
            select: {
              expresiones_metaforicas: true
            }
          }
        }
      })
    ]);

    res.json({
      data: {
        corpus_slug: corpus.slug,
        total,
        limit,
        offset,
        items: metaphors.map((metaphor: any) => ({
          id: metaphor.id,
          nombre: metaphor.nombre,
          descripcion: metaphor.descripcion,
          tipologia: metaphor.tipologia,
          dominio_fuente: metaphor.dominio_fuente,
          dominio_meta: metaphor.dominio_meta,
          total_expresiones: metaphor._count.expresiones_metaforicas
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/corpora/:slug/metaphors/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const metaphor = await prisma.conceptualMetaphor.findFirst({
      where: {
        id: req.params.id,
        corpus_id: corpus.id
      },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        tipologia: true,
        dominio_fuente_id: true,
        dominio_meta_id: true,
        dominio_fuente: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            dominio_padre_id: true
          }
        },
        dominio_meta: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            dominio_padre_id: true
          }
        }
      }
    });

    if (!metaphor) {
      res.status(404).json({ error: `No existe metáfora '${req.params.id}' en el corpus '${corpus.slug}'.` });
      return;
    }

    const [totalExpresiones, expresionesAsociadas, ontologicas, epistemicas] = await Promise.all([
      prisma.metaphoricalExpression.count({
        where: {
          corpus_id: corpus.id,
          metafora_conceptual_id: metaphor.id
        }
      }),
      prisma.metaphoricalExpression.findMany({
        where: {
          corpus_id: corpus.id,
          metafora_conceptual_id: metaphor.id
        },
        take: 20,
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          id_registro: true,
          orden: true,
          expresion_metaforica: true,
          corresp_ontologicas: true,
          corresp_epistemicas: true,
          fuente_textual: {
            select: {
              id: true,
              titulo_1: true,
              autor: true
            }
          }
        }
      }),
      prisma.metaphoricalExpression.groupBy({
        by: ['corresp_ontologicas'],
        where: {
          corpus_id: corpus.id,
          metafora_conceptual_id: metaphor.id,
          corresp_ontologicas: {
            not: null
          }
        },
        _count: {
          _all: true
        }
      }),
      prisma.metaphoricalExpression.groupBy({
        by: ['corresp_epistemicas'],
        where: {
          corpus_id: corpus.id,
          metafora_conceptual_id: metaphor.id,
          corresp_epistemicas: {
            not: null
          }
        },
        _count: {
          _all: true
        }
      })
    ]);

    res.json({
      data: {
        id: metaphor.id,
        nombre: metaphor.nombre,
        descripcion: metaphor.descripcion,
        tipologia: metaphor.tipologia,
        dominio_fuente: metaphor.dominio_fuente,
        dominio_meta: metaphor.dominio_meta,
        estadisticas: {
          total_expresiones: totalExpresiones,
          correspondencias_ontologicas_distintas: ontologicas.length,
          correspondencias_epistemicas_distintas: epistemicas.length
        },
        correspondencias: {
          ontologicas: ontologicas
            .filter((item: any) => item.corresp_ontologicas && String(item.corresp_ontologicas).trim())
            .map((item: any) => ({
              valor: item.corresp_ontologicas,
              frecuencia: item._count._all
            })),
          epistemicas: epistemicas
            .filter((item: any) => item.corresp_epistemicas && String(item.corresp_epistemicas).trim())
            .map((item: any) => ({
              valor: item.corresp_epistemicas,
              frecuencia: item._count._all
            }))
        },
        expresiones_asociadas: expresionesAsociadas
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/corpora/:slug/metaphors/:id/expressions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const metaphor = await prisma.conceptualMetaphor.findFirst({
      where: {
        id: req.params.id,
        corpus_id: corpus.id
      },
      select: {
        id: true,
        nombre: true
      }
    });

    if (!metaphor) {
      res.status(404).json({ error: `No existe metáfora '${req.params.id}' en el corpus '${corpus.slug}'.` });
      return;
    }

    const limit = parseNumberParam(req.query.limit, 20, 1, 100);
    const offset = parseNumberParam(req.query.offset, 0, 0);

    const [total, items] = await Promise.all([
      prisma.metaphoricalExpression.count({
        where: {
          corpus_id: corpus.id,
          metafora_conceptual_id: metaphor.id
        }
      }),
      prisma.metaphoricalExpression.findMany({
        where: {
          corpus_id: corpus.id,
          metafora_conceptual_id: metaphor.id
        },
        skip: offset,
        take: limit,
        orderBy: [{ orden: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          id_registro: true,
          orden: true,
          pagina: true,
          expresion_metaforica: true,
          contexto: true,
          foco: true,
          tipologia: true,
          fuente_textual: {
            select: {
              id: true,
              titulo_1: true,
              autor: true,
              anio: true
            }
          }
        }
      })
    ]);

    res.json({
      data: {
        corpus_slug: corpus.slug,
        metaphor: {
          id: metaphor.id,
          nombre: metaphor.nombre
        },
        total,
        limit,
        offset,
        items
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/corpora/:slug/metaphors/:id/related', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corpus = await findActiveCorpusBySlug(req.params.slug);
    if (!corpus) {
      res.status(404).json({ error: `No se encontró corpus activo para slug '${req.params.slug}'.` });
      return;
    }

    const metaphor = await prisma.conceptualMetaphor.findFirst({
      where: {
        id: req.params.id,
        corpus_id: corpus.id
      },
      select: {
        id: true,
        nombre: true,
        dominio_fuente_id: true,
        dominio_meta_id: true,
        dominio_fuente: {
          select: {
            id: true,
            dominio_padre_id: true
          }
        },
        dominio_meta: {
          select: {
            id: true,
            dominio_padre_id: true
          }
        }
      }
    });

    if (!metaphor) {
      res.status(404).json({ error: `No existe metáfora '${req.params.id}' en el corpus '${corpus.slug}'.` });
      return;
    }

    const baseDomainIds = [metaphor.dominio_fuente_id, metaphor.dominio_meta_id].filter(Boolean) as string[];
    const parentDomainIds = [metaphor.dominio_fuente?.dominio_padre_id, metaphor.dominio_meta?.dominio_padre_id].filter(
      Boolean
    ) as string[];

    const adjacentDomains = await prisma.domain.findMany({
      where: {
        corpus_id: corpus.id,
        OR: [
          { id: { in: [...baseDomainIds, ...parentDomainIds] } },
          { dominio_padre_id: { in: [...baseDomainIds, ...parentDomainIds] } }
        ]
      },
      select: {
        id: true
      }
    });

    const relatedDomainIds = Array.from(new Set(adjacentDomains.map((domain: any) => domain.id)));

    if (relatedDomainIds.length === 0) {
      res.json({
        data: {
          corpus_slug: corpus.slug,
          source_metaphor: {
            id: metaphor.id,
            nombre: metaphor.nombre
          },
          total: 0,
          items: []
        }
      });
      return;
    }

    const relatedMetaphors = await prisma.conceptualMetaphor.findMany({
      where: {
        corpus_id: corpus.id,
        id: {
          not: metaphor.id
        },
        OR: [
          { dominio_fuente_id: { in: relatedDomainIds } },
          { dominio_meta_id: { in: relatedDomainIds } }
        ]
      },
      take: 50,
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nombre: true,
        tipologia: true,
        dominio_fuente: {
          select: {
            id: true,
            nombre: true,
            tipo: true
          }
        },
        dominio_meta: {
          select: {
            id: true,
            nombre: true,
            tipo: true
          }
        },
        _count: {
          select: {
            expresiones_metaforicas: true
          }
        }
      }
    });

    res.json({
      data: {
        corpus_slug: corpus.slug,
        source_metaphor: {
          id: metaphor.id,
          nombre: metaphor.nombre
        },
        total: relatedMetaphors.length,
        items: relatedMetaphors.map((item: any) => ({
          id: item.id,
          nombre: item.nombre,
          tipologia: item.tipologia,
          dominio_fuente: item.dominio_fuente,
          dominio_meta: item.dominio_meta,
          total_expresiones: item._count.expresiones_metaforicas
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// ========== ENDPOINTS ADICIONALES DE CORPORA ==========

app.get('/api/v1/corpora', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const corpora = await prisma.corpus.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: {
        nombre: true,
        slug: true,
        descripcion: true,
        idioma: true,
        version: true,
        licencia: true,
        _count: {
          select: {
            expresiones_metaforicas: true
          }
        }
      }
    });

    res.json({
      data: corpora.map((corpus: any) => ({
        nombre: corpus.nombre,
        slug: corpus.slug,
        descripcion: corpus.descripcion,
        idioma: corpus.idioma,
        version: corpus.version,
        licencia: corpus.licencia,
        numero_registros: corpus._count.expresiones_metaforicas
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/corpora/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    const corpus = await prisma.corpus.findFirst({
      where: {
        slug,
        activo: true
      },
      select: {
        id: true,
        slug: true,
        nombre: true,
        descripcion: true,
        idioma: true,
        version: true,
        licencia: true,
        doi: true,
        autores: true,
        fecha_publicacion: true,
        metadatos_extra: true,
        _count: {
          select: {
            expresiones_metaforicas: true,
            fuentes_textuales: true,
            dominios: true,
            metaforas_conceptuales: true,
            relaciones_semanticas: true,
            categorias_gramaticales: true
          }
        }
      }
    });

    if (!corpus) {
      res.status(404).json({
        error: `No se encontró corpus activo para slug '${slug}'.`
      });
      return;
    }

    const groupedDomains = await prisma.domain.groupBy({
      by: ['tipo'],
      where: { corpus_id: corpus.id },
      _count: { _all: true }
    });

    const dominiosPorTipo = groupedDomains.reduce((acc: Record<string, number>, item: any) => {
      acc[item.tipo] = item._count._all;
      return acc;
    }, {});

    res.json({
      data: {
        id: corpus.id,
        slug: corpus.slug,
        nombre: corpus.nombre,
        descripcion: corpus.descripcion,
        idioma: corpus.idioma,
        version: corpus.version,
        licencia: corpus.licencia,
        doi: corpus.doi,
        autores: corpus.autores,
        fecha_publicacion: toIsoDate(corpus.fecha_publicacion),
        metadatos_extra: corpus.metadatos_extra,
        fair: {
          findable: {
            slug: corpus.slug,
            doi: corpus.doi,
            identificadores: [corpus.slug, corpus.doi].filter(Boolean)
          },
          accessible: {
            activo: true,
            licencia: corpus.licencia
          },
          interoperable: {
            idioma: corpus.idioma,
            formato_api: 'application/json',
            version_api: 'v1'
          },
          reusable: {
            licencia: corpus.licencia,
            version: corpus.version,
            fecha_publicacion: toIsoDate(corpus.fecha_publicacion),
            autores: corpus.autores
          }
        },
        estadisticas_agregadas: {
          numero_registros: corpus._count.expresiones_metaforicas,
          fuentes_textuales: corpus._count.fuentes_textuales,
          dominios: corpus._count.dominios,
          dominios_por_tipo: dominiosPorTipo,
          metaforas_conceptuales: corpus._count.metaforas_conceptuales,
          relaciones_semanticas: corpus._count.relaciones_semanticas,
          categorias_gramaticales: corpus._count.categorias_gramaticales
        },
        como_citar: buildCitation(corpus)
      }
    });
  } catch (error) {
    next(error);
  }
});

// ========== MIDDLEWARE DE ERRORES Y ARRANQUE ==========

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Error interno del servidor';
  res.status(500).json({ error: message });
});

app.listen(port, '::', () => {
  console.log(`API de MetaCorpus escuchando en http://[::]:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Señal ${signal} recibida, cerrando conexiones...`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
