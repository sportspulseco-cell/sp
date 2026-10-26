"use client";

/**
 * Web push on this browser (FR-3.10.2, FR-3.21.2), shared by every web
 * app that ships `/sw.js`. Turn on: ask the browser for permission,
 * register the service worker, subscribe with the API's VAPID public key
 * and store the subscription (POST /communications/push/subscribe). Turn
 * off: unsubscribe in the browser and delete the row by endpoint.
 *
 * State shown is the browser's real state (an existing subscription on
 * this device), never a local guess.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, Button } from "@sportspulse/ui";

export interface WebPushApi {
  config: () => Promise<{ available: boolean; publicKey: string | null }>;
  subscribe: (body: {
    endpoint: string;
    p256dhKey?: string;
    authKey?: string;
    userAgent?: string;
    platform?: "web";
  }) => Promise<unknown>;
  unsubscribeEndpoint: (endpoint: string) => Promise<{ deleted: boolean }>;
}

type State =
  | { kind: "loading" }
  | { kind: "not_set_up" }
  | { kind: "unsupported" }
  | { kind: "blocked" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string };

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function WebPushControl({ api, serviceWorkerPath = "/sw.js" }: { api: WebPushApi; serviceWorkerPath?: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const cfg = await api.config();
      if (!cfg.available || !cfg.publicKey) return setState({ kind: "not_set_up" });
      setPublicKey(cfg.publicKey);
      if (!supported()) return setState({ kind: "unsupported" });
      if (Notification.permission === "denied") return setState({ kind: "blocked" });
      const reg = await navigator.serviceWorker.getRegistration(serviceWorkerPath);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? { kind: "on", endpoint: sub.endpoint } : { kind: "off" });
    } catch (e) {
      setError((e as Error).message);
      setState({ kind: "off" });
    }
  }, [api, serviceWorkerPath]);

  useEffect(() => {
    void refresh();
    // Run once on mount; `api` is rebuilt by the parent on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? { kind: "blocked" } : { kind: "off" });
        return;
      }
      const reg = await navigator.serviceWorker.register(serviceWorkerPath);
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource
        }));
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await api.subscribe({
        endpoint: sub.endpoint,
        p256dhKey: json.keys?.p256dh,
        authKey: json.keys?.auth,
        userAgent: navigator.userAgent.slice(0, 300),
        platform: "web"
      });
      setState({ kind: "on", endpoint: sub.endpoint });
    } catch (e) {
      setError(`Could not turn on push: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(serviceWorkerPath);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint ?? (state.kind === "on" ? state.endpoint : null);
      if (sub) await sub.unsubscribe();
      if (endpoint) await api.unsubscribeEndpoint(endpoint);
      setState({ kind: "off" });
    } catch (e) {
      setError(`Could not turn off push: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="web-push-control" data-push-state={state.kind}>
      {state.kind === "loading" ? (
        <p className="flex items-center gap-2 text-[13px] text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking this browser…
        </p>
      ) : state.kind === "not_set_up" ? (
        <p className="text-[13px] text-fg-muted">Push notifications are not set up.</p>
      ) : state.kind === "unsupported" ? (
        <p className="text-[13px] text-fg-muted">This browser cannot receive push notifications.</p>
      ) : state.kind === "blocked" ? (
        <p className="text-[13px] text-fg-muted">
          Notifications are blocked for this site in your browser settings. Allow them there, then reload this page.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-fg">
            {state.kind === "on" ? "Push is on for this browser." : "Push is off for this browser."}
          </p>
          {state.kind === "on" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void turnOff()}>
              {busy ? "Turning off…" : "Turn off on this browser"}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void turnOn()}>
              {busy ? "Turning on…" : "Turn on for this browser"}
            </Button>
          )}
        </div>
      )}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
