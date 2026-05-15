-- Backlog #11 — team store product catalog. Captain-curated merch
-- per team; browse on player-web `/store`. Purchase flow deferred
-- until P4-1 (real Stripe).
--
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS team_store_products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             uuid NOT NULL,
  name                text NOT NULL,
  description         text,
  image_url           text,
  price_cents         integer NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'USD',
  variant_label       text,
  stock_qty           integer,
  is_active           boolean NOT NULL DEFAULT true,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE team_store_products
    ADD CONSTRAINT team_store_products_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE team_store_products
    ADD CONSTRAINT team_store_products_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES auth.users (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE team_store_products
    ADD CONSTRAINT team_store_product_currency_check
    CHECK (currency ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE team_store_products
    ADD CONSTRAINT team_store_product_price_check
    CHECK (price_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS team_store_product_team_idx
  ON team_store_products (team_id);
CREATE INDEX IF NOT EXISTS team_store_product_active_idx
  ON team_store_products (is_active);
