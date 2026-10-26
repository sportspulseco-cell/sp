"use client";

/**
 * UC-29 / FR-3.15.5: read the PDF417 barcode on the back of a US or
 * Canadian driver's licence, with the device camera or from a photo.
 *
 * Decoding runs in the browser (zxing-wasm, pinned; its .wasm file loads
 * from jsDelivr at the same pinned version). The decoded text goes to the
 * API, which parses it and compares it with the person on file; the
 * stored check has no card name, DOB or full number. The card fields
 * shown here come from this browser's own decode and are not stored.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, Loader2 } from "lucide-react";
import { Alert, Badge, Button } from "@sportspulse/ui";
import { LICENCE_CHECK_FIELD_LABELS, parseAamva, type AamvaLicence } from "@sportspulse/kernel";
import type { LicenceIdCheck } from "@sportspulse/api-client";

export interface LicenceScanApi {
  licenceCheck: (body: { barcodeText: string; method: "camera" | "photo" }) => Promise<{ check: LicenceIdCheck }>;
}

async function decodePdf417(input: Blob | ImageData): Promise<string | null> {
  const { readBarcodes } = await import("zxing-wasm/reader");
  const results = await readBarcodes(input, {
    formats: ["PDF417"],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    textMode: "Plain",
    maxNumberOfSymbols: 1
  });
  const hit = results.find((r) => r.isValid && r.text);
  return hit?.text ?? null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Not readable";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

export function LicenceScan({
  api,
  onChecked
}: {
  api: LicenceScanApi;
  onChecked: (check: LicenceIdCheck) => void;
}) {
  const [mode, setMode] = useState<"idle" | "camera" | "decoding" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<AamvaLicence | null>(null);
  const [last, setLast] = useState<LicenceIdCheck | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function stopCamera() {
    if (loopRef.current !== null) window.clearTimeout(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stopCamera, []);

  async function submit(text: string, method: "camera" | "photo") {
    const local = parseAamva(text);
    if (!local.ok) {
      setError(local.message);
      setMode("idle");
      return;
    }
    setCard(local.licence);
    setMode("sending");
    try {
      const res = await api.licenceCheck({ barcodeText: text, method });
      setLast(res.check);
      onChecked(res.check);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMode("idle");
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setMode("decoding");
    try {
      const text = await decodePdf417(file);
      if (!text) {
        setError("No licence barcode found in that photo. Photograph the barcode on the back, flat and in focus.");
        setMode("idle");
        return;
      }
      await submit(text, "photo");
    } catch (e) {
      setError(`Could not read the photo: ${(e as Error).message}`);
      setMode("idle");
    }
  }

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot use the camera. Upload a photo of the barcode instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      setMode("camera");
      // The <video> mounts on this render; attach on the next frame.
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        void v.play();
        scanLoop();
      });
    } catch (e) {
      setError(`The camera could not start: ${(e as Error).message}. Upload a photo of the barcode instead.`);
      setMode("idle");
    }
  }

  function scanLoop() {
    const v = videoRef.current;
    if (!v || !streamRef.current) return;
    loopRef.current = window.setTimeout(async () => {
      if (v.videoWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0);
          const text = await decodePdf417(ctx.getImageData(0, 0, canvas.width, canvas.height)).catch(() => null);
          if (text) {
            stopCamera();
            await submit(text, "camera");
            return;
          }
        }
      }
      scanLoop();
    }, 350);
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-2 p-3" data-testid="licence-scan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-fg">Check a driver's licence barcode</p>
        <div className="flex flex-wrap gap-2">
          {mode === "camera" ? (
            <Button size="sm" variant="outline" onClick={() => { stopCamera(); setMode("idle"); }}>
              Stop camera
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={mode !== "idle"} onClick={() => void startCamera()}>
              <Camera className="mr-1 h-3.5 w-3.5" /> Scan with camera
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={mode !== "idle"} onClick={() => fileRef.current?.click()}>
            <ImageUp className="mr-1 h-3.5 w-3.5" /> Upload a photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Photo of the licence barcode"
            data-testid="licence-photo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void onPhoto(f);
            }}
          />
        </div>
      </div>
      <p className="text-[12px] text-fg-muted">
        US and Canadian licences and ID cards: the barcode on the back. A match means the barcode agrees with the
        name and date of birth on file and the card is not expired. It does not prove the card is genuine.
      </p>

      {mode === "camera" ? (
        <video ref={videoRef} muted playsInline className="max-h-64 w-full rounded-md border border-border bg-black object-contain" />
      ) : null}
      {mode === "decoding" || mode === "sending" ? (
        <p className="flex items-center gap-2 text-[13px] text-fg-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {mode === "decoding" ? "Reading the barcode…" : "Comparing with the record…"}
        </p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {last ? (
        <div className="space-y-2" data-testid="licence-check-result" data-result={last.result}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge mono tone={last.result === "match" ? "success" : "danger"}>
              {last.result === "match" ? "Matches the record" : "Does not match"}
            </Badge>
            <span className="text-[12px] text-fg-muted">
              {last.documentType === "ID" ? "ID card" : "Licence"} {last.jurisdiction ?? ""} ending {last.licenceLast4}
            </span>
          </div>
          {last.mismatchedFields.length ? (
            <ul className="list-disc pl-5 text-[12px] text-fg">
              {last.mismatchedFields.map((f) => (
                <li key={f}>{LICENCE_CHECK_FIELD_LABELS[f]}</li>
              ))}
            </ul>
          ) : null}
          {card ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
              <dt className="text-fg-muted">Name on the card</dt>
              <dd className="text-fg">{[card.firstName, card.middleName, card.lastName].filter(Boolean).join(" ") || "Not readable"}</dd>
              <dt className="text-fg-muted">Date of birth on the card</dt>
              <dd className="text-fg">{fmtDate(card.dateOfBirth)}</dd>
              <dt className="text-fg-muted">Expires</dt>
              <dd className="text-fg">{fmtDate(card.expiresOn)}</dd>
            </dl>
          ) : null}
          <p className="text-[12px] text-fg-muted">Saved as evidence. You still approve or reject below.</p>
        </div>
      ) : null}
    </div>
  );
}
