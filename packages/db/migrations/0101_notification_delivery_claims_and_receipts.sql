-- Durable delivery claims fence concurrent workers. Provider acknowledgments
-- and mailbox outcomes are distinct; the original sent status remains compatible.
ALTER TABLE public.notifications
  ADD COLUMN delivery_claim_id uuid,
  ADD COLUMN delivery_claim_expires_at timestamptz,
  ADD COLUMN provider_message_id text,
  ADD COLUMN delivery_status text,
  ADD COLUMN delivery_updated_at timestamptz,
  ADD CONSTRAINT notification_delivery_status_check CHECK (
    delivery_status IS NULL OR delivery_status IN ('accepted','delayed','delivered','bounced','complained','failed','suppressed'));
CREATE UNIQUE INDEX notification_provider_message_uniq ON public.notifications(provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX notification_expired_claim_idx ON public.notifications(delivery_claim_expires_at)
  WHERE status='sending';

CREATE TABLE public.notification_delivery_receipts (
  event_id text PRIMARY KEY,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  event_type text NOT NULL,
  delivery_status text NOT NULL CHECK (delivery_status IN ('accepted','delayed','delivered','bounced','complained','failed','suppressed')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  reason text CHECK (reason IS NULL OR length(reason)<=500)
);
CREATE INDEX notification_receipt_message_idx ON public.notification_delivery_receipts(provider_message_id);
ALTER TABLE public.notification_delivery_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_delivery_receipts FROM anon,authenticated;
GRANT ALL ON public.notification_delivery_receipts TO service_role;
