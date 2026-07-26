CREATE TABLE "inbox_item_states" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "item_key" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "snoozed_until" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inbox_item_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inbox_item_states_user_id_item_key_key" ON "inbox_item_states"("user_id", "item_key");
CREATE INDEX "inbox_item_states_user_id_archived_at_snoozed_until_idx" ON "inbox_item_states"("user_id", "archived_at", "snoozed_until");

ALTER TABLE "inbox_item_states"
  ADD CONSTRAINT "inbox_item_states_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
