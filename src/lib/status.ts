import type { Database } from "@/integrations/supabase/types";

export type EntryStatus = Database["public"]["Enums"]["entry_status"];

export const STATUS_LABELS: Record<EntryStatus, string> = {
  scored: "Scored",
  planning: "Planning to Apply",
  in_review: "In Review",
  in_progress: "Application In Progress",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer Received",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
  enrolled: "Enrolled",
  archived: "Archived",
};

export const STATUS_ORDER: EntryStatus[] = [
  "scored","planning","in_review","in_progress","applied",
  "interview","offer","rejected","waitlisted","enrolled","archived",
];