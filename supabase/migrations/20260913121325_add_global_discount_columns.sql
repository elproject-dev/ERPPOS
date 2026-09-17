ALTER TABLE "public"."discount_settings"
ADD COLUMN IF NOT EXISTS "global_discount_enabled" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "global_discount_rules" jsonb DEFAULT '[]'::jsonb;
