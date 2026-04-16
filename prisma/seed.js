require('dotenv').config();

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, DomainType, SemanticRelationType } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL no está definida en el archivo .env');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.metaphoricalExpression.deleteMany();
  await prisma.semanticRelation.deleteMany();
  await prisma.conceptualMetaphor.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.textualSource.deleteMany();
  await prisma.grammaticalCategory.deleteMany();
  await prisma.corpus.deleteMany();

  const corpusA = await prisma.corpus.create({
    data: {
      slug: 'cev-amazonia-2024',
      nombre: 'Corpus CEV Amazonía 2024',
      descripcion: 'Corpus piloto sobre metáforas ambientales en prensa regional.',
      idioma: 'es',
      version: '1.0.0',
      licencia: 'CC-BY-4.0',
      doi: '10.5281/zenodo.1000001',
      autores: [
        { nombre: 'María Isabel Marín', afiliacion: 'Universidad de Antioquia' },
        { nombre: 'Silvio Otero', afiliacion: 'Universidad de Antioquia' }
      ],
      fecha_publicacion: new Date('2024-10-01'),
      activo: true,
      metadatos_extra: {
        metodologia: 'MIPVU',
        alcance: 'exploratorio'
      }
    }
  });

  const corpusB = await prisma.corpus.create({
    data: {
      slug: 'medios-politica-2025',
      nombre: 'Corpus Medios y Política 2025',
      descripcion: 'Corpus de cobertura política nacional con anotación metafórica.',
      idioma: 'es',
      version: '1.0.0',
      licencia: 'CC-BY-4.0',
      doi: '10.5281/zenodo.1000002',
      autores: [
        { nombre: 'Equipo MetaCorpus', afiliacion: 'Semillero Corpus ex Machina' }
      ],
      fecha_publicacion: new Date('2025-02-01'),
      activo: true,
      metadatos_extra: {
        metodologia: 'MIPVU',
        cobertura: 'nacional'
      }
    }
  });

  const [sustantivoA, verboA] = await Promise.all([
    prisma.grammaticalCategory.create({
      data: {
        corpus_id: corpusA.id,
        nombre: 'Sustantivo',
        abreviatura: 'N'
      }
    }),
    prisma.grammaticalCategory.create({
      data: {
        corpus_id: corpusA.id,
        nombre: 'Verbo',
        abreviatura: 'V'
      }
    })
  ]);

  const [construccionA, edificioA] = await Promise.all([
    prisma.domain.create({
      data: {
        corpus_id: corpusA.id,
        nombre: 'CONSTRUCCIÓN',
        tipo: DomainType.FUENTE,
        descripcion: 'Dominio fuente estructural'
      }
    }),
    prisma.domain.create({
      data: {
        corpus_id: corpusA.id,
        nombre: 'INSTITUCIÓN',
        tipo: DomainType.META,
        descripcion: 'Dominio meta sociopolítico'
      }
    })
  ]);

  const fuenteA = await prisma.textualSource.create({
    data: {
      corpus_id: corpusA.id,
      titulo_1: 'La Amazonía en disputa',
      titulo_2: 'Editorial',
      titulo_3: 'Infraestructura y territorio',
      autor: 'Redacción CEV',
      anio: 2024,
      referencia_bib: 'CEV (2024). La Amazonía en disputa.'
    }
  });

  const metaforaA = await prisma.conceptualMetaphor.create({
    data: {
      corpus_id: corpusA.id,
      nombre: 'LA INSTITUCIÓN ES UNA CONSTRUCCIÓN',
      descripcion: 'Metáfora estructural de estabilidad y deterioro.',
      dominio_fuente_id: construccionA.id,
      dominio_meta_id: edificioA.id,
      tipologia: 'estructural'
    }
  });

  await prisma.semanticRelation.create({
    data: {
      corpus_id: corpusA.id,
      dominio_origen_id: edificioA.id,
      dominio_destino_id: construccionA.id,
      tipo_relacion: SemanticRelationType.HIPONIMIA
    }
  });

  await prisma.metaphoricalExpression.create({
    data: {
      corpus_id: corpusA.id,
      id_registro: 'CEV_1',
      orden: 1,
      fuente_textual_id: fuenteA.id,
      pagina: 3,
      expresion_metaforica: 'La democracia está construida sobre cimientos frágiles.',
      contexto: 'Análisis del estado institucional en la región.',
      foco: 'cimientos',
      foco_lematizado: 'cimiento',
      cat_gramatical_id: sustantivoA.id,
      significado_contextual: 'Base de soporte político.',
      significado_basico: 'Parte inferior que sostiene una construcción.',
      metafora_conceptual_id: metaforaA.id,
      corresp_ontologicas: 'INSTITUCIÓN -> EDIFICIO',
      corresp_epistemicas: 'Estabilidad institucional como solidez estructural.',
      tipologia: 'estructural',
      observaciones: 'Registro inicial de prueba.'
    }
  });

  const sustantivoB = await prisma.grammaticalCategory.create({
    data: {
      corpus_id: corpusB.id,
      nombre: 'Sustantivo',
      abreviatura: 'N'
    }
  });

  const [viajeB, politicaB] = await Promise.all([
    prisma.domain.create({
      data: {
        corpus_id: corpusB.id,
        nombre: 'VIAJE',
        tipo: DomainType.FUENTE,
        descripcion: 'Dominio fuente de desplazamiento y ruta'
      }
    }),
    prisma.domain.create({
      data: {
        corpus_id: corpusB.id,
        nombre: 'POLÍTICA',
        tipo: DomainType.META,
        descripcion: 'Dominio meta del debate público'
      }
    })
  ]);

  const fuenteB = await prisma.textualSource.create({
    data: {
      corpus_id: corpusB.id,
      titulo_1: 'Elecciones y rumbo nacional',
      titulo_2: 'Especial político',
      autor: 'Mesa de análisis',
      anio: 2025,
      referencia_bib: 'Medios Nacionales (2025). Elecciones y rumbo nacional.'
    }
  });

  const metaforaB = await prisma.conceptualMetaphor.create({
    data: {
      corpus_id: corpusB.id,
      nombre: 'LA POLÍTICA ES UN VIAJE',
      descripcion: 'Metáfora de trayecto para representar procesos electorales.',
      dominio_fuente_id: viajeB.id,
      dominio_meta_id: politicaB.id,
      tipologia: 'orientacional'
    }
  });

  await prisma.metaphoricalExpression.create({
    data: {
      corpus_id: corpusB.id,
      id_registro: 'POL_1',
      orden: 1,
      fuente_textual_id: fuenteB.id,
      pagina: 1,
      expresion_metaforica: 'El país avanza por un camino incierto hacia las elecciones.',
      contexto: 'Crónica sobre campañas presidenciales.',
      foco: 'camino',
      foco_lematizado: 'camino',
      cat_gramatical_id: sustantivoB.id,
      significado_contextual: 'Dirección del proceso político.',
      significado_basico: 'Vía por la que se transita.',
      metafora_conceptual_id: metaforaB.id,
      corresp_ontologicas: 'POLÍTICA -> VIAJE',
      corresp_epistemicas: 'El progreso político se interpreta como desplazamiento.',
      tipologia: 'orientacional',
      observaciones: 'Segundo corpus de prueba.'
    }
  });

  console.log('Seed completado: 2 corpus con datos de prueba creados.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
