"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { usePathname } from "next/navigation";

interface NavCtx {
  /** Mobile drawer open. */
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Record names a page already knows, keyed by the id in its path. */
  names: Record<string, string>;
  setName: (id: string, name: string) => void;
}

const Ctx = createContext<NavCtx | null>(null);

/**
 * Shell state shared by the sidebar, the top bar and the breadcrumb
 * trail: the mobile drawer, and the names of records in the path.
 * The drawer closes on navigation and on Escape, and locks page
 * scroll while open.
 */
export function NavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setName = useCallback((id: string, name: string) => {
    setNames((prev) => (prev[id] === name ? prev : { ...prev, [id]: name }));
  }, []);

  const value = useMemo(() => ({ open, setOpen, names, setName }), [open, names, setName]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNav must be used inside <NavProvider>");
  return c;
}

/**
 * Tells the breadcrumb trail the name of a record in the path, so a
 * crumb reads "Ice Wolves" instead of "Details". Render it on any page
 * that already has the record; it draws nothing. Safe outside the shell
 * (public pages): it does nothing there.
 */
export function CrumbName({ id, name }: { id: string; name: string | null | undefined }) {
  const ctx = useContext(Ctx);
  const setName = ctx?.setName;
  useEffect(() => {
    if (setName && id && name) setName(id, name);
  }, [setName, id, name]);
  return null;
}
