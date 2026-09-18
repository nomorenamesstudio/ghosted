"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRoles } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const MAX_SUGGESTIONS = 8;

/**
 * Role field with autocomplete from roles this user has used before, most
 * recently used first.
 *
 * Hand-rolled rather than the stock shadcn combobox: that one is Radix Popover
 * + cmdk and neither is a dependency here, and a native `<datalist>` is drawn by
 * the browser with OS chrome, so it ignored the app's tokens entirely. The list
 * below uses the same surface tokens as every other popover in the app
 * (`bg-popover`, `shadow-md`, `bg-accent` for the active row).
 */
export function RoleInput({
  id,
  value,
  onChange,
  placeholder,
  required,
  onEnter,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  onEnter?: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["roles"],
    queryFn: () => getRoles(),
    // Role titles change rarely, saving refetches this anyway.
    staleTime: 5 * 60 * 1000,
  });

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-role-listbox`;

  // Already-used titles that match what has been typed, minus the exact value.
  const suggestions = useMemo(() => {
    const typed = value.trim().toLowerCase();
    return (data?.data ?? [])
      .filter((role) => role.toLowerCase() !== typed)
      .filter((role) => !typed || role.toLowerCase().includes(typed))
      .slice(0, MAX_SUGGESTIONS);
  }, [data, value]);

  // Close when the pointer lands anywhere else.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commit(role: string) {
    onChange(role);
    setOpen(false);
  }

  const showList = open && suggestions.length > 0;

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          showList ? `${listId}-option-${active}` : undefined
        }
        required={required}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Enter") {
            if (showList && suggestions[active]) {
              e.preventDefault();
              commit(suggestions[active]);
            } else {
              onEnter?.();
            }
          }
        }}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Previously used roles"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {suggestions.map((role, i) => (
            <li
              key={role}
              id={`${listId}-option-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              // pointerdown, not click: the input keeps focus (and the field
              // does not blur-close) before the value lands.
              onMouseDown={(e) => {
                e.preventDefault();
                commit(role);
              }}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              {role}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
