"use client";

import { useState } from "react";
import {
  CUSTOM_ROLE_CODE_SUGGESTIONS,
  type PermissionString,
  type ScopeType
} from "@sportspulse/kernel";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Role-code picker for the create/edit role form.
 *
 * - Dropdown of curated codes (`tournament_director`, `volunteer_coordinator`, …)
 *   sourced from `CUSTOM_ROLE_CODE_SUGGESTIONS` in `@sportspulse/kernel`.
 * - "Custom" option drops into a text input for free-form codes.
 * - When a curated code is picked, calls `onSuggestionApply` so the
 *   parent form can pre-fill name + scopeType + defaultPermissions.
 *
 * The native HTML `required` validation tooltip ("Please fill out this
 * field") is what triggered the earlier UX bug — this picker prevents
 * the empty-submit case at the source.
 */
export function RoleCodePicker({
  value,
  onChange,
  onSuggestionApply
}: {
  value: string;
  onChange: (code: string) => void;
  /** Fired when a curated suggestion is selected — parent may auto-fill other fields. */
  onSuggestionApply?: (s: {
    code: string;
    name: string;
    scopeType: ScopeType;
    defaultPermissions: PermissionString[];
  }) => void;
}) {
  const matchedSuggestion = CUSTOM_ROLE_CODE_SUGGESTIONS.find(
    (s) => s.code === value
  );
  const [mode, setMode] = useState<"suggested" | "custom">(
    !value || matchedSuggestion ? "suggested" : "custom"
  );

  return (
    <div className="space-y-2">
      <Select
        value={
          mode === "custom"
            ? "__custom__"
            : matchedSuggestion?.code ?? ""
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom__") {
            setMode("custom");
            return;
          }
          if (v === "") {
            setMode("suggested");
            onChange("");
            return;
          }
          setMode("suggested");
          onChange(v);
          const suggestion = CUSTOM_ROLE_CODE_SUGGESTIONS.find(
            (s) => s.code === v
          );
          if (suggestion && onSuggestionApply) onSuggestionApply(suggestion);
        }}
      >
        <option value="">Choose a role code…</option>
        <optgroup label="Curated">
          {CUSTOM_ROLE_CODE_SUGGESTIONS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} · {s.code}
            </option>
          ))}
        </optgroup>
        <option value="__custom__">— Custom code…</option>
      </Select>

      {mode === "custom" && (
        <Input
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, "_")
                .replace(/_+/g, "_")
            )
          }
          placeholder="my_custom_role"
          autoFocus
        />
      )}
    </div>
  );
}
