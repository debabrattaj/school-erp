import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * The school's current academic year, from its own settings.
 *
 * Two forms hardcoded "2026-27" as their default, which silently files new
 * class-subject and class-exam mappings under the wrong year the moment the
 * school rolls over. `/settings/` is the same source the web app reads.
 */
let cached: string | null = null;
let inFlight: Promise<string | null> | null = null;

async function fetchAcademicYear(): Promise<string | null> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = api
      .get<{ academic_year?: string }>("/settings/")
      .then((s) => {
        cached = s?.academic_year || null;
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Clears the memoised value — call after the setting is edited. */
export function invalidateAcademicYear() {
  cached = null;
}

export function useAcademicYear() {
  const [academicYear, setAcademicYear] = useState<string | null>(cached);

  useEffect(() => {
    let cancelled = false;
    fetchAcademicYear().then((year) => {
      if (!cancelled && year) setAcademicYear(year);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return academicYear;
}
