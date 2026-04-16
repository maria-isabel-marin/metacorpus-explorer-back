CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "DomainType" AS ENUM ('FUENTE', 'META', 'AMBOS');
CREATE TYPE "SemanticRelationType" AS ENUM (
  'HIPERONIMIA',
  'HIPONIMIA',
  'COHIPONIMIA',
  'MERONIMIA',
  'HOLONIMIA',
  'SINONIMIA',
  'ANTONIMIA'
);

CREATE TABLE "corpus" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "idioma" VARCHAR(8) NOT NULL,
  "version" TEXT NOT NULL,
  "licencia" TEXT,
  "doi" TEXT,
  "autores" JSONB,
  "fecha_publicacion" DATE,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "metadatos_extra" JSONB,
  CONSTRAINT "corpus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "textual_source" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corpus_id" UUID NOT NULL,
  "titulo_1" TEXT NOT NULL,
  "titulo_2" TEXT,
  "titulo_3" TEXT,
  "autor" TEXT,
  "anio" INTEGER,
  "referencia_bib" TEXT,
  "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce("titulo_1", '') || ' ' ||
      coalesce("titulo_2", '') || ' ' ||
      coalesce("titulo_3", '') || ' ' ||
      coalesce("autor", '') || ' ' ||
      coalesce("referencia_bib", '')
    )
  ) STORED,
  CONSTRAINT "textual_source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "grammatical_category" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corpus_id" UUID NOT NULL,
  "nombre" TEXT NOT NULL,
  "abreviatura" TEXT NOT NULL,
  CONSTRAINT "grammatical_category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "domain" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corpus_id" UUID NOT NULL,
  "nombre" TEXT NOT NULL,
  "tipo" "DomainType" NOT NULL,
  "descripcion" TEXT,
  "dominio_padre_id" UUID,
  "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce("nombre", '') || ' ' ||
      coalesce("descripcion", '') || ' ' ||
      coalesce("tipo"::text, '')
    )
  ) STORED,
  CONSTRAINT "domain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conceptual_metaphor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corpus_id" UUID NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "dominio_fuente_id" UUID,
  "dominio_meta_id" UUID,
  "tipologia" TEXT,
  "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce("nombre", '') || ' ' ||
      coalesce("descripcion", '') || ' ' ||
      coalesce("tipologia", '')
    )
  ) STORED,
  CONSTRAINT "conceptual_metaphor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "semantic_relation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corpus_id" UUID NOT NULL,
  "dominio_origen_id" UUID NOT NULL,
  "dominio_destino_id" UUID NOT NULL,
  "tipo_relacion" "SemanticRelationType" NOT NULL,
  CONSTRAINT "semantic_relation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "metaphorical_expression" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "corpus_id" UUID NOT NULL,
  "id_registro" TEXT NOT NULL,
  "orden" INTEGER NOT NULL,
  "fuente_textual_id" UUID NOT NULL,
  "pagina" INTEGER,
  "expresion_metaforica" TEXT NOT NULL,
  "contexto" TEXT,
  "foco" TEXT,
  "foco_lematizado" TEXT,
  "cat_gramatical_id" UUID,
  "significado_contextual" TEXT,
  "significado_basico" TEXT,
  "metafora_conceptual_id" UUID,
  "corresp_ontologicas" TEXT,
  "corresp_epistemicas" TEXT,
  "tipologia" TEXT,
  "observaciones" TEXT,
  "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce("expresion_metaforica", '') || ' ' ||
      coalesce("contexto", '') || ' ' ||
      coalesce("foco", '') || ' ' ||
      coalesce("significado_contextual", '') || ' ' ||
      coalesce("significado_basico", '') || ' ' ||
      coalesce("observaciones", '')
    )
  ) STORED,
  CONSTRAINT "metaphorical_expression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "corpus_slug_key" ON "corpus" ("slug");

CREATE UNIQUE INDEX "textual_source_id_corpus_id_key" ON "textual_source" ("id", "corpus_id");
CREATE INDEX "textual_source_corpus_id_idx" ON "textual_source" ("corpus_id");
CREATE INDEX "textual_source_search_vector_gin_idx" ON "textual_source" USING GIN ("search_vector");

CREATE UNIQUE INDEX "grammatical_category_id_corpus_id_key" ON "grammatical_category" ("id", "corpus_id");
CREATE UNIQUE INDEX "grammatical_category_corpus_id_abreviatura_key" ON "grammatical_category" ("corpus_id", "abreviatura");
CREATE INDEX "grammatical_category_corpus_id_idx" ON "grammatical_category" ("corpus_id");

CREATE UNIQUE INDEX "domain_id_corpus_id_key" ON "domain" ("id", "corpus_id");
CREATE UNIQUE INDEX "domain_corpus_id_nombre_tipo_key" ON "domain" ("corpus_id", "nombre", "tipo");
CREATE INDEX "domain_corpus_id_idx" ON "domain" ("corpus_id");
CREATE INDEX "domain_search_vector_gin_idx" ON "domain" USING GIN ("search_vector");

CREATE UNIQUE INDEX "conceptual_metaphor_id_corpus_id_key" ON "conceptual_metaphor" ("id", "corpus_id");
CREATE INDEX "conceptual_metaphor_corpus_id_idx" ON "conceptual_metaphor" ("corpus_id");
CREATE INDEX "conceptual_metaphor_search_vector_gin_idx" ON "conceptual_metaphor" USING GIN ("search_vector");

CREATE UNIQUE INDEX "semantic_relation_id_corpus_id_key" ON "semantic_relation" ("id", "corpus_id");
CREATE UNIQUE INDEX "semantic_relation_unique_route_type_key" ON "semantic_relation" ("corpus_id", "dominio_origen_id", "dominio_destino_id", "tipo_relacion");
CREATE INDEX "semantic_relation_corpus_id_idx" ON "semantic_relation" ("corpus_id");

CREATE UNIQUE INDEX "metaphorical_expression_id_corpus_id_key" ON "metaphorical_expression" ("id", "corpus_id");
CREATE UNIQUE INDEX "metaphorical_expression_corpus_id_id_registro_key" ON "metaphorical_expression" ("corpus_id", "id_registro");
CREATE INDEX "metaphorical_expression_corpus_id_idx" ON "metaphorical_expression" ("corpus_id");
CREATE INDEX "metaphorical_expression_corpus_id_fuente_textual_id_orden_idx" ON "metaphorical_expression" ("corpus_id", "fuente_textual_id", "orden");
CREATE UNIQUE INDEX "metaphorical_expression_corpus_id_fuente_textual_id_orden_key" ON "metaphorical_expression" ("corpus_id", "fuente_textual_id", "orden");
CREATE INDEX "metaphorical_expression_search_vector_gin_idx" ON "metaphorical_expression" USING GIN ("search_vector");

ALTER TABLE "textual_source"
  ADD CONSTRAINT "textual_source_corpus_id_fkey"
  FOREIGN KEY ("corpus_id") REFERENCES "corpus" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grammatical_category"
  ADD CONSTRAINT "grammatical_category_corpus_id_fkey"
  FOREIGN KEY ("corpus_id") REFERENCES "corpus" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "domain"
  ADD CONSTRAINT "domain_corpus_id_fkey"
  FOREIGN KEY ("corpus_id") REFERENCES "corpus" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "domain"
  ADD CONSTRAINT "domain_dominio_padre_id_corpus_id_fkey"
  FOREIGN KEY ("dominio_padre_id", "corpus_id") REFERENCES "domain" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conceptual_metaphor"
  ADD CONSTRAINT "conceptual_metaphor_corpus_id_fkey"
  FOREIGN KEY ("corpus_id") REFERENCES "corpus" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conceptual_metaphor"
  ADD CONSTRAINT "conceptual_metaphor_dominio_fuente_id_corpus_id_fkey"
  FOREIGN KEY ("dominio_fuente_id", "corpus_id") REFERENCES "domain" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conceptual_metaphor"
  ADD CONSTRAINT "conceptual_metaphor_dominio_meta_id_corpus_id_fkey"
  FOREIGN KEY ("dominio_meta_id", "corpus_id") REFERENCES "domain" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "semantic_relation"
  ADD CONSTRAINT "semantic_relation_corpus_id_fkey"
  FOREIGN KEY ("corpus_id") REFERENCES "corpus" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "semantic_relation"
  ADD CONSTRAINT "semantic_relation_dominio_origen_id_corpus_id_fkey"
  FOREIGN KEY ("dominio_origen_id", "corpus_id") REFERENCES "domain" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "semantic_relation"
  ADD CONSTRAINT "semantic_relation_dominio_destino_id_corpus_id_fkey"
  FOREIGN KEY ("dominio_destino_id", "corpus_id") REFERENCES "domain" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "metaphorical_expression"
  ADD CONSTRAINT "metaphorical_expression_corpus_id_fkey"
  FOREIGN KEY ("corpus_id") REFERENCES "corpus" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "metaphorical_expression"
  ADD CONSTRAINT "metaphorical_expression_fuente_textual_id_corpus_id_fkey"
  FOREIGN KEY ("fuente_textual_id", "corpus_id") REFERENCES "textual_source" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "metaphorical_expression"
  ADD CONSTRAINT "metaphorical_expression_cat_gramatical_id_corpus_id_fkey"
  FOREIGN KEY ("cat_gramatical_id", "corpus_id") REFERENCES "grammatical_category" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "metaphorical_expression"
  ADD CONSTRAINT "metaphorical_expression_metafora_conceptual_id_corpus_id_fkey"
  FOREIGN KEY ("metafora_conceptual_id", "corpus_id") REFERENCES "conceptual_metaphor" ("id", "corpus_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
