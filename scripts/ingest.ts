import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: new (options?: unknown) => any;
};

const DOMAIN_TYPE = {
  FUENTE: 'FUENTE',
  META: 'META'
} as const;

type CliArgs = {
  file: string;
  corpus: string;
  name?: string;
  description?: string;
  license?: string;
};

type InputRecord = {
  rowNumber: number;
  idRegistro: string;
  orden: number;
  pagina: number | null;
  titulo1: string;
  titulo2: string | null;
  titulo3: string | null;
  autor: string | null;
  anio: number | null;
  referenciaBib: string | null;
  expresionMetaforica: string;
  contexto: string | null;
  foco: string | null;
  focoLematizado: string | null;
  categoriaGramaticalRaw: string | null;
  significadoContextual: string | null;
  significadoBasico: string | null;
  metaforaConceptual: string | null;
  dominioFuente: string | null;
  dominioMeta: string | null;
  correspOntologicas: string | null;
  correspEpistemicas: string | null;
  tipologia: string | null;
  observaciones: string | null;
  sourceKey: string;
};

type ImportReport = {
  rowsRead: number;
  expressionsCreated: number;
  expressionsUpdated: number;
  conceptualMetaphorsCreated: number;
  domainsCreated: number;
  textualSourcesCreated: number;
  grammaticalCategoriesCreated: number;
};

const HEADER_ALIASES = {
  id: ['id', 'id_registro', 'registro_id'],
  orden: ['orden'],
  pagina: ['pagina', 'page'],
  titulo1: ['titulo_1', 'titulo1', 'titulo_principal'],
  titulo2: ['titulo_2', 'titulo2'],
  titulo3: ['titulo_3', 'titulo3'],
  autor: ['autor'],
  anio: ['anio', 'ano', 'year'],
  referenciaBib: ['referencia_bib', 'referencia_bibliografica', 'referencia'],
  expresionMetaforica: ['expresion_metaforica', 'expresion'],
  contexto: ['contexto'],
  foco: ['foco'],
  focoLematizado: ['foco_lematizado', 'foco_lematizado_1', 'foco_lemma'],
  categoriaGramatical: ['cat_gramatical_foco', 'cat_gramatical', 'categoria_gramatical', 'pos_foco'],
  significadoContextual: ['significado_contextual'],
  significadoBasico: ['significado_basico'],
  metaforaConceptual: ['metafora_conceptual'],
  dominioFuente: ['dominio_fuente'],
  dominioMeta: ['dominio_meta'],
  correspOntologicas: ['corresp_ontologicas', 'correspondencias_ontologicas'],
  correspEpistemicas: ['corresp_epistemicas', 'correspondencias_epistemicas'],
  tipologia: ['tipologia', 'tipo_metafora'],
  observaciones: ['observaciones', 'notas']
} as const;

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Falta valor para --${key}`);
    }

    if (key === 'file') {
      args.file = next;
    } else if (key === 'corpus') {
      args.corpus = next;
    } else if (key === 'name') {
      args.name = next;
    } else if (key === 'description') {
      args.description = next;
    } else if (key === 'license') {
      args.license = next;
    }

    i += 1;
  }

  if (!args.file || !args.corpus) {
    throw new Error(
      'Uso: npx ts-node scripts/ingest.ts --file corpus.xlsx --corpus cev-amazonia [--name "..."] [--description "..."] [--license "CC-BY-4.0"]'
    );
  }

  return args as CliArgs;
}

function removeDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeHeader(header: string): string {
  return removeDiacritics(header)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

function parseNullableInt(value: unknown, field: string, rowNumber: number): number | null {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`Fila ${rowNumber}: el campo ${field} debe ser entero. Valor recibido: ${cleaned}`);
  }

  return numeric;
}

function cleanTipology(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) {
    return null;
  }

  return removeDiacritics(raw)
    .toLowerCase()
    .replace(/[;,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDomainName(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) {
    return null;
  }

  return removeDiacritics(raw)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMetaphorName(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) {
    return null;
  }

  return removeDiacritics(raw)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCategory(raw: string | null): { nombre: string; abreviatura: string } | null {
  if (!raw) {
    return null;
  }

  const compact = raw.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return null;
  }

  const firstToken = compact.split(/[\s\-_/()]+/)[0]?.trim();
  const baseAbbr = firstToken && firstToken.length <= 8 ? firstToken : compact.slice(0, 8);

  return {
    nombre: compact,
    abreviatura: removeDiacritics(baseAbbr).toUpperCase()
  };
}

function safeAliasValue(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    if (alias in row) {
      return row[alias];
    }
  }

  return null;
}

function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeHeader(key)] = value;
  }

  return normalized;
}

function buildTextualSourceKey(
  titulo1: string,
  titulo2: string | null,
  titulo3: string | null,
  autor: string | null,
  anio: number | null,
  referenciaBib: string | null
): string {
  return [titulo1, titulo2 ?? '', titulo3 ?? '', autor ?? '', anio ?? '', referenciaBib ?? '']
    .map((value) => String(value).trim().toLowerCase())
    .join('|');
}

function buildFallbackRegistroId(sourceKey: string, orden: number, rowNumber: number): string {
  const hash = createHash('sha1').update(`${sourceKey}|${orden}|${rowNumber}`).digest('hex').slice(0, 12);
  return `AUTO_${hash}`;
}

function readInputRows(filePath: string): InputRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo: ${filePath}`);
  }

  if (path.extname(filePath).toLowerCase() !== '.xlsx') {
    throw new Error('El archivo debe ser .xlsx');
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0] as string | undefined;
  if (typeof sheetName !== 'string') {
    throw new Error('El archivo Excel no contiene hojas');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  if (rawRows.length === 0) {
    throw new Error('El archivo Excel no contiene filas de datos');
  }

  return rawRows.map((rawRow: Record<string, unknown>, index: number) => {
    const rowNumber = index + 2;
    const row = normalizeRowKeys(rawRow);

    const titulo1 = cleanString(safeAliasValue(row, HEADER_ALIASES.titulo1)) ?? 'SIN_TITULO';
    const titulo2 = cleanString(safeAliasValue(row, HEADER_ALIASES.titulo2));
    const titulo3 = cleanString(safeAliasValue(row, HEADER_ALIASES.titulo3));
    const autor = cleanString(safeAliasValue(row, HEADER_ALIASES.autor));
    const anio = parseNullableInt(safeAliasValue(row, HEADER_ALIASES.anio), 'anio', rowNumber);
    const referenciaBib = cleanString(safeAliasValue(row, HEADER_ALIASES.referenciaBib));

    const orden = parseNullableInt(safeAliasValue(row, HEADER_ALIASES.orden), 'orden', rowNumber);
    if (orden === null) {
      throw new Error(`Fila ${rowNumber}: el campo orden es obligatorio`);
    }

    const expresionMetaforica = cleanString(safeAliasValue(row, HEADER_ALIASES.expresionMetaforica));
    if (!expresionMetaforica) {
      throw new Error(`Fila ${rowNumber}: el campo expresion_metaforica es obligatorio`);
    }

    const sourceKey = buildTextualSourceKey(titulo1, titulo2, titulo3, autor, anio, referenciaBib);

    const idRegistroRaw = cleanString(safeAliasValue(row, HEADER_ALIASES.id));
    const idRegistro = idRegistroRaw ?? buildFallbackRegistroId(sourceKey, orden, rowNumber);

    return {
      rowNumber,
      idRegistro,
      orden,
      pagina: parseNullableInt(safeAliasValue(row, HEADER_ALIASES.pagina), 'pagina', rowNumber),
      titulo1,
      titulo2,
      titulo3,
      autor,
      anio,
      referenciaBib,
      expresionMetaforica,
      contexto: cleanString(safeAliasValue(row, HEADER_ALIASES.contexto)),
      foco: cleanString(safeAliasValue(row, HEADER_ALIASES.foco)),
      focoLematizado: cleanString(safeAliasValue(row, HEADER_ALIASES.focoLematizado)),
      categoriaGramaticalRaw: cleanString(safeAliasValue(row, HEADER_ALIASES.categoriaGramatical)),
      significadoContextual: cleanString(safeAliasValue(row, HEADER_ALIASES.significadoContextual)),
      significadoBasico: cleanString(safeAliasValue(row, HEADER_ALIASES.significadoBasico)),
      metaforaConceptual: normalizeMetaphorName(safeAliasValue(row, HEADER_ALIASES.metaforaConceptual)),
      dominioFuente: normalizeDomainName(safeAliasValue(row, HEADER_ALIASES.dominioFuente)),
      dominioMeta: normalizeDomainName(safeAliasValue(row, HEADER_ALIASES.dominioMeta)),
      correspOntologicas: cleanString(safeAliasValue(row, HEADER_ALIASES.correspOntologicas)),
      correspEpistemicas: cleanString(safeAliasValue(row, HEADER_ALIASES.correspEpistemicas)),
      tipologia: cleanTipology(safeAliasValue(row, HEADER_ALIASES.tipologia)),
      observaciones: cleanString(safeAliasValue(row, HEADER_ALIASES.observaciones)),
      sourceKey
    };
  });
}

function validateOrdenUniqueness(records: InputRecord[]): void {
  const seen = new Map<string, number>();

  for (const record of records) {
    const key = `${record.sourceKey}|${record.orden}`;
    const existingRow = seen.get(key);

    if (existingRow) {
      throw new Error(
        `Orden duplicado por fuente en el Excel. Fila ${record.rowNumber} repite orden ${record.orden} de la fila ${existingRow}`
      );
    }

    seen.set(key, record.rowNumber);
  }
}

function isPrismaUniqueError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

function validateRegistroUniqueness(records: InputRecord[]): void {
  const seen = new Map<string, number>();

  for (const record of records) {
    const existingRow = seen.get(record.idRegistro);

    if (existingRow) {
      throw new Error(
        `ID de registro duplicado en el Excel. Fila ${record.rowNumber} repite id ${record.idRegistro} de la fila ${existingRow}`
      );
    }

    seen.set(record.idRegistro, record.rowNumber);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const records = readInputRows(path.resolve(args.file));
  validateOrdenUniqueness(records);
  validateRegistroUniqueness(records);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definida en .env');
  }

  const report: ImportReport = {
    rowsRead: records.length,
    expressionsCreated: 0,
    expressionsUpdated: 0,
    conceptualMetaphorsCreated: 0,
    domainsCreated: 0,
    textualSourcesCreated: 0,
    grammaticalCategoriesCreated: 0
  };

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter }) as any;

  try {
    const corpus = await prisma.corpus.upsert({
      where: { slug: args.corpus },
      create: {
        slug: args.corpus,
        nombre: args.name ?? args.corpus,
        descripcion: args.description ?? null,
        idioma: 'es',
        version: '1.0.0',
        licencia: args.license ?? null,
        activo: true,
        metadatos_extra: {
          fuente_ingesta: 'scripts/ingest.ts',
          archivo_origen: path.basename(args.file),
          fecha_ingesta: new Date().toISOString()
        }
      },
      update: {
        nombre: args.name ?? undefined,
        descripcion: args.description ?? undefined,
        licencia: args.license ?? undefined,
        metadatos_extra: {
          fuente_ingesta: 'scripts/ingest.ts',
          archivo_origen: path.basename(args.file),
          fecha_ingesta: new Date().toISOString()
        }
      }
    });

    const sourceCache = new Map<string, string>();
    const categoryCache = new Map<string, string>();
    const domainCache = new Map<string, string>();
    const conceptualCache = new Map<string, string>();

    for (const record of records) {
      let textualSourceId: string | null = sourceCache.get(record.sourceKey) ?? null;
      if (!textualSourceId) {
        const existingSource = await prisma.textualSource.findFirst({
          where: {
            corpus_id: corpus.id,
            titulo_1: record.titulo1,
            titulo_2: record.titulo2,
            titulo_3: record.titulo3,
            autor: record.autor,
            anio: record.anio,
            referencia_bib: record.referenciaBib
          },
          select: { id: true }
        });

        if (existingSource) {
          textualSourceId = existingSource.id;
        } else {
          const createdSource = await prisma.textualSource.create({
            data: {
              corpus_id: corpus.id,
              titulo_1: record.titulo1,
              titulo_2: record.titulo2,
              titulo_3: record.titulo3,
              autor: record.autor,
              anio: record.anio,
              referencia_bib: record.referenciaBib
            },
            select: { id: true }
          });

          textualSourceId = createdSource.id;
          report.textualSourcesCreated += 1;
        }

        if (textualSourceId) {
          sourceCache.set(record.sourceKey, textualSourceId);
        }
      }

      if (!textualSourceId) {
        throw new Error(`Fila ${record.rowNumber}: no fue posible determinar la fuente textual.`);
      }

      const category = extractCategory(record.categoriaGramaticalRaw);
      let categoryId: string | null = null;
      if (category) {
        const categoryKey = category.abreviatura;
        categoryId = categoryCache.get(categoryKey) ?? null;

        if (!categoryId) {
          const existingCategory = await prisma.grammaticalCategory.findUnique({
            where: {
              corpus_id_abreviatura: {
                corpus_id: corpus.id,
                abreviatura: category.abreviatura
              }
            },
            select: { id: true }
          });

          if (existingCategory) {
            categoryId = existingCategory.id;
          } else {
            const createdCategory = await prisma.grammaticalCategory.create({
              data: {
                corpus_id: corpus.id,
                nombre: category.nombre,
                abreviatura: category.abreviatura
              },
              select: { id: true }
            });

            categoryId = createdCategory.id;
            report.grammaticalCategoriesCreated += 1;
          }

          if (categoryId) {
            categoryCache.set(categoryKey, categoryId!);
          }
        }
      }

      let dominioFuenteId: string | null = null;
      if (record.dominioFuente) {
        const key = `${record.dominioFuente}|${DOMAIN_TYPE.FUENTE}`;
        dominioFuenteId = domainCache.get(key) ?? null;

        if (!dominioFuenteId) {
          const existingDomain = await prisma.domain.findUnique({
            where: {
              corpus_id_nombre_tipo: {
                corpus_id: corpus.id,
                nombre: record.dominioFuente,
                tipo: DOMAIN_TYPE.FUENTE
              }
            },
            select: { id: true }
          });

          if (existingDomain) {
            dominioFuenteId = existingDomain.id;
          } else {
            const createdDomain = await prisma.domain.create({
              data: {
                corpus_id: corpus.id,
                nombre: record.dominioFuente,
                tipo: DOMAIN_TYPE.FUENTE
              },
              select: { id: true }
            });

            dominioFuenteId = createdDomain.id;
            report.domainsCreated += 1;
          }

          if (dominioFuenteId) {
            domainCache.set(key, dominioFuenteId!);
          }
        }
      }

      let dominioMetaId: string | null = null;
      if (record.dominioMeta) {
        const key = `${record.dominioMeta}|${DOMAIN_TYPE.META}`;
        dominioMetaId = domainCache.get(key) ?? null;

        if (!dominioMetaId) {
          const existingDomain = await prisma.domain.findUnique({
            where: {
              corpus_id_nombre_tipo: {
                corpus_id: corpus.id,
                nombre: record.dominioMeta,
                tipo: DOMAIN_TYPE.META
              }
            },
            select: { id: true }
          });

          if (existingDomain) {
            dominioMetaId = existingDomain.id;
          } else {
            const createdDomain = await prisma.domain.create({
              data: {
                corpus_id: corpus.id,
                nombre: record.dominioMeta,
                tipo: DOMAIN_TYPE.META
              },
              select: { id: true }
            });

            dominioMetaId = createdDomain.id;
            report.domainsCreated += 1;
          }

          if (dominioMetaId) {
            domainCache.set(key, dominioMetaId!);
          }
        }
      }

      let conceptualId: string | null = null;
      if (record.metaforaConceptual) {
        conceptualId = conceptualCache.get(record.metaforaConceptual) ?? null;

        if (!conceptualId) {
          const existingConceptual = await prisma.conceptualMetaphor.findFirst({
            where: {
              corpus_id: corpus.id,
              nombre: record.metaforaConceptual
            },
            select: { id: true }
          });

          if (existingConceptual) {
            conceptualId = existingConceptual.id;
          } else {
            const createdConceptual = await prisma.conceptualMetaphor.create({
              data: {
                corpus_id: corpus.id,
                nombre: record.metaforaConceptual,
                dominio_fuente_id: dominioFuenteId,
                dominio_meta_id: dominioMetaId,
                tipologia: record.tipologia
              },
              select: { id: true }
            });

            conceptualId = createdConceptual.id;
            report.conceptualMetaphorsCreated += 1;
          }

          if (conceptualId) {
            conceptualCache.set(record.metaforaConceptual, conceptualId);
          }
        }
      }

      const existingExpression = await prisma.metaphoricalExpression.findUnique({
        where: {
          corpus_id_id_registro: {
            corpus_id: corpus.id,
            id_registro: record.idRegistro
          }
        },
        select: { id: true }
      });

      const expressionData = {
        corpus_id: corpus.id,
        id_registro: record.idRegistro,
        orden: record.orden,
        fuente_textual_id: textualSourceId,
        pagina: record.pagina,
        expresion_metaforica: record.expresionMetaforica,
        contexto: record.contexto,
        foco: record.foco,
        foco_lematizado: record.focoLematizado,
        cat_gramatical_id: categoryId,
        significado_contextual: record.significadoContextual,
        significado_basico: record.significadoBasico,
        metafora_conceptual_id: conceptualId,
        corresp_ontologicas: record.correspOntologicas,
        corresp_epistemicas: record.correspEpistemicas,
        tipologia: record.tipologia,
        observaciones: record.observaciones
      };

      try {
        if (existingExpression) {
          await prisma.metaphoricalExpression.update({
            where: {
              corpus_id_id_registro: {
                corpus_id: corpus.id,
                id_registro: record.idRegistro
              }
            },
            data: expressionData
          });
          report.expressionsUpdated += 1;
        } else {
          await prisma.metaphoricalExpression.create({ data: expressionData });
          report.expressionsCreated += 1;
        }
      } catch (error) {
        if (isPrismaUniqueError(error)) {
          throw new Error(
            `Fila ${record.rowNumber}: violación de unicidad (corpus_id, fuente_textual_id, orden). ` +
              `Verifica que no exista otro registro con orden=${record.orden} en la misma fuente textual.`
          );
        }

        throw error;
      }
    }

    console.log('--- REPORTE DE IMPORTACION ---');
    console.log(`Corpus destino: ${args.corpus}`);
    console.log(`Archivo: ${path.basename(args.file)}`);
    console.log(`Filas leidas: ${report.rowsRead}`);
    console.log(`Expresiones creadas: ${report.expressionsCreated}`);
    console.log(`Expresiones actualizadas: ${report.expressionsUpdated}`);
    console.log(`Fuentes textuales creadas: ${report.textualSourcesCreated}`);
    console.log(`Categorias gramaticales creadas: ${report.grammaticalCategoriesCreated}`);
    console.log(`Dominios creados: ${report.domainsCreated}`);
    console.log(`Metaforas conceptuales creadas: ${report.conceptualMetaphorsCreated}`);
    console.log('Importacion finalizada correctamente.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Error en la ingesta:', error instanceof Error ? error.message : error);
  process.exit(1);
});
