-- AlterTable
ALTER TABLE "conceptual_metaphor" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "corpus" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "domain" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "grammatical_category" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "metaphorical_expression" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "semantic_relation" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "textual_source" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "semantic_relation_unique_route_type_key" RENAME TO "semantic_relation_corpus_id_dominio_origen_id_dominio_desti_key";
