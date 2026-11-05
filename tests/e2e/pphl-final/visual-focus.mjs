// Reuse the complete guided setup journey; keep visual-pass evidence separate.
process.env.UX_EVIDENCE_DIR="visual-focus";
await import("./ux-sprint-02.mjs");
