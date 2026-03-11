CREATE TABLE IF NOT EXISTS "public"."price_list" (
    "id" "text" NOT NULL PRIMARY KEY,
    "endpoint" "text",
    "report_type" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "unit_price_usd" numeric(6,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "product_code" "text",
    "is_ai" "text",
    "stripe_price_id" "text"
);

ALTER TABLE "public"."price_list" OWNER TO "postgres";

COMMENT ON TABLE "public"."price_list" IS 'Product pricing catalog for Meme Supreme';
COMMENT ON COLUMN "public"."price_list"."stripe_price_id" IS 'Stripe Price ID for subscription/payment processing';
