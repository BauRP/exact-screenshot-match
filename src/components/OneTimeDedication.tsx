import { useEffect, useState } from "react";

/**
 * TEMPORARY ONE-OFF DEDICATION FOR A PERSONAL APK.
 *
 * Entire feature lives here. To remove it later, delete this file and
 * remove its import, one hook call, and one JSX element from routes/index.tsx.
 * No changes to the notes database, PDF editor, AdMob or Android code.
 *
 * This local marker is deliberately independent of the notes list. Deleting
 * all notes cannot make the dedication reappear on the same installation.
 */
export const DEDICATION_FINISHED_KEY = "wave.notes.once.dedication.finished.v1";

type DedicationStorage = Pick<Storage, "getItem" | "setItem">;

export function dedicationWasFinished(storage: DedicationStorage): boolean {
  return storage.getItem(DEDICATION_FINISHED_KEY) === "1";
}

export function recordDedicationFinished(storage: DedicationStorage): void {
  storage.setItem(DEDICATION_FINISHED_KEY, "1");
}

export function shouldShowDedication(
  databaseReady: boolean,
  totalSavedDocuments: number,
  hasFinished: boolean,
): boolean {
  return databaseReady && totalSavedDocuments === 0 && !hasFinished;
}

/**
 * Call unconditionally from the main screen, even while it displays notes.
 * Seeing a saved note or PDF permanently seals the local marker. An unsaved
 * draft doesn't count. No rendering changes occur in the note/PDF editors.
 */
export function useOneTimeDedication(totalSavedDocuments: number, databaseReady: boolean): boolean {
  // Do not flash the message while the notes database or storage is loading.
  const [finished, setFinished] = useState(true);

  useEffect(() => {
    if (!databaseReady) return;
    if (totalSavedDocuments > 0) {
      try {
        recordDedicationFinished(window.localStorage);
      } catch (error) {
        // A storage problem must never block saving documents or navigation.
        console.warn("[Wave Notes] One-time message marker unavailable", error);
      }
      setFinished(true);
      return;
    }

    try {
      setFinished(dedicationWasFinished(window.localStorage));
    } catch {
      // Fail closed: never repeatedly display a personal dedication if
      // private storage cannot confirm its one-time state.
      setFinished(true);
    }
  }, [databaseReady, totalSavedDocuments]);

  return shouldShowDedication(databaseReady, totalSavedDocuments, finished);
}

/** Inert text only: no button, navigation, analytics or ad interaction. */
export function OneTimeDedication() {
  return (
    <section
      data-testid="one-time-dedication"
      aria-label="Личное посвящение"
      className="pointer-events-none flex min-h-[280px] w-full flex-1 select-none flex-col items-center justify-center gap-3 px-3 py-8 text-center"
    >
      <p className="text-xl font-semibold leading-snug text-foreground">
        Любимой маме от сына
      </p>
      <p className="text-lg font-medium leading-snug text-foreground">
        Мухановой Айслу
      </p>
      <p className="mt-2 text-xl font-semibold leading-snug text-primary">
        Дай пожалуйста корiмдiк
      </p>
      <p className="mt-2 flex flex-wrap items-baseline justify-center gap-x-2 text-primary">
        <span className="text-6xl font-extrabold leading-none tabular-nums">560</span>
        <span className="text-2xl font-semibold">тенге</span>
      </p>
    </section>
  );
}
