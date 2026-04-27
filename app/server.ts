import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

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

function parseStringParam(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Error interno del servidor';
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`API de MetaCorpus escuchando en http://localhost:${port}`);
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
