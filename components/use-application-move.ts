"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateApplication } from "@/lib/api";
import type { ApplicationStatus } from "@/lib/db/schema";
import type { DisplayStatus } from "@/lib/utils/status";

/**
 * Moving a card in the *list* view.
 *
 * Deliberately plain, unlike the board's move. The board detaches the card from
 * its column optimistically because a drag has to feel like it landed; a menu
 * selection has no such gesture to honour, so the card simply leaves when the
 * refetch lands.
 *
 * What it does share with the board is the narrow invalidation: a move knows
 * both ends of the change, so only those two sections come back from the server
 * (plus "ghosted", which displays stale applied/interviewing applications and so
 * changes whenever one of those statuses is written).
 */
export function useApplicationMove() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  function invalidateSections(statuses: Iterable<string>, id: string) {
    for (const status of Array.from(new Set(statuses))) {
      qc.invalidateQueries({ queryKey: ["applications", "section", status] });
    }
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["application", id] });
  }

  const move = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      from: DisplayStatus;
      status: ApplicationStatus;
    }) => updateApplication(id, { status }),
    onMutate: () => setError(null),
    onError: (err) => setError((err as Error).message),
    onSettled: (_data, _err, vars) => {
      invalidateSections(
        [
          vars.from,
          vars.status,
          ...(vars.status === "applied" || vars.status === "interviewing"
            ? ["ghosted"]
            : []),
        ],
        vars.id,
      );
    },
  });

  const handleMove = useCallback(
    (id: string, from: DisplayStatus, to: ApplicationStatus) => {
      move.mutate({ id, from, status: to });
    },
    [move],
  );

  return { handleMove, moveError: error };
}
