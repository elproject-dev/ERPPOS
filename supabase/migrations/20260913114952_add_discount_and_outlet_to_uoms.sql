ALTER TABLE "public"."product_uoms"
ADD COLUMN IF NOT EXISTS "discount_type" character varying(20) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "discount_value" numeric(20,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "min_qty" integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS "label" character varying(255),
ADD COLUMN IF NOT EXISTS "outlet_prices" jsonb DEFAULT '{}'::jsonb;
