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
