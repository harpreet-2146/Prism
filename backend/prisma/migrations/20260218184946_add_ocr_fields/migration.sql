/*
  Warnings:

  - Made the column `ocr_status` on table `document_images` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "document_images" ALTER COLUMN "ocr_language" SET DATA TYPE TEXT,
ALTER COLUMN "ocr_status" SET NOT NULL,
ALTER COLUMN "ocr_status" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "embeddings" ALTER COLUMN "source_type" DROP DEFAULT,
ALTER COLUMN "source_type" SET DATA TYPE TEXT;
