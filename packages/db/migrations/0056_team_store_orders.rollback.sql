-- 0056_team_store_orders.rollback.sql (never auto-applied)
-- Drops the team store order tables. Orders placed since 0056 are lost;
-- their invoices stay (invoice_id was ON DELETE SET NULL the other way).
DROP TABLE IF EXISTS "team_store_order_items";
DROP TABLE IF EXISTS "team_store_orders";
