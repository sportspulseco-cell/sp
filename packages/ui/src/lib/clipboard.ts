/**
 * Copy text, and say whether it worked. A pending clipboard permission
 * prompt can leave navigator.clipboard.writeText unresolved forever; after
 * `timeoutMs` this gives up (false), so a caller never waits on it. Falls
 * back to the legacy copy command where the async clipboard is missing.
 */
export async function writeClipboard(text: string, timeoutMs = 1500): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      return await Promise.race([
        navigator.clipboard.writeText(text).then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
      ]);
    }
  } catch {
    return false;
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
