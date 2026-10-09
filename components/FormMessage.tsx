/**
 * The one-line form message used by the settings cards: an error announces
 * itself to a screen reader, a success is a plain status.
 */
export type Msg = { type: "ok" | "error"; text: string } | null;

export function Message({ state }: { state: Msg }) {
  if (!state) return null;
  return (
    <p
      role={state.type === "error" ? "alert" : "status"}
      className={
        state.type === "error"
          ? "text-sm text-destructive"
          : "text-sm text-emerald-600 dark:text-emerald-400"
      }
    >
      {state.text}
    </p>
  );
}
