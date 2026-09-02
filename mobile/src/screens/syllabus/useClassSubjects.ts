import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { Option } from "../../components/Pickers";

interface ClassSubjectRow {
  id: number;
  class_id: number;
  subject_name?: string;
  academic_year: string;
  teacher_id?: number;
}

interface ClassRow {
  id: number;
  class_name: string;
  section?: string;
}

export interface ClassSubjectInfo {
  id: number;
  label: string;
  subjectName: string;
  academicYear: string;
}

export function useClassSubjects() {
  const [options, setOptions] = useState<Option[]>([]);
  const [byId, setById] = useState<Map<number, ClassSubjectInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [classSubjects, classes] = await Promise.all([
          api.get<ClassSubjectRow[]>("/class-subjects/"),
          api.get<ClassRow[]>("/classes/"),
        ]);
        if (cancelled) return;

        const classLabel = new Map(classes.map((c) => [c.id, [c.class_name, c.section].filter(Boolean).join(" ")]));
        const map = new Map<number, ClassSubjectInfo>();
        const opts: Option[] = classSubjects.map((cs) => {
          const cls = classLabel.get(cs.class_id) || `Class #${cs.class_id}`;
          const label = `${cs.subject_name || "Subject"} — ${cls}`;
          map.set(cs.id, { id: cs.id, label, subjectName: cs.subject_name || "Subject", academicYear: cs.academic_year });
          return { label, value: String(cs.id), subtitle: cs.academic_year };
        });
        setOptions(opts);
        setById(map);
      } catch (e) {
        // Without this the rejection went unhandled and the picker just showed
        // "Nothing to choose from yet", which reads as "none configured".
        if (!cancelled) setError(e instanceof ApiError ? String(e.message) : "Failed to load class subjects.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { options, byId, loading, error };
}
