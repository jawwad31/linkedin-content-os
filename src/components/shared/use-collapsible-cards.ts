"use client";

import { useEffect, useState } from "react";

function readStoredIds(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Tracks which cards in a list are expanded, defaulting every card to
 * collapsed. Persisted to localStorage per client so state survives
 * navigation. Cards render collapsed on first paint (matching SSR output),
 * then a one-time post-mount effect restores any previously expanded ids —
 * this is the standard SSR-safe pattern for hydrating from a client-only
 * store, not a state update that should live in render.
 */
export function useCollapsibleCards(storageKey: string) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage, not a render-time computation
    setExpandedIds(readStoredIds(storageKey));
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(expandedIds)),
      );
    } catch {
      // Storage may be unavailable (private browsing); state stays in memory.
    }
  }, [expandedIds, hydrated, storageKey]);

  return {
    isExpanded: (id: string) => expandedIds.has(id),
    toggle(id: string) {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    expandAll(ids: string[]) {
      setExpandedIds(new Set(ids));
    },
    collapseAll() {
      setExpandedIds(new Set());
    },
  };
}
