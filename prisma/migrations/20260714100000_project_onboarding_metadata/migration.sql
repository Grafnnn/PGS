ALTER TABLE "projects"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "object_type" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "vat_percent" DECIMAL(5,2),
  ADD COLUMN "tender_source" TEXT,
  ADD COLUMN "payment_notes" TEXT,
  ADD COLUMN "volume_change_mode" TEXT,
  ADD COLUMN "template_id" TEXT,
  ADD COLUMN "selected_modules" JSONB;
