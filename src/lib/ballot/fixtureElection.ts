import type { ElectionRef } from "@/domain/ballot";

/** Fixture mode: the November 3, 2026 general, mapped to the fictional sample. */
export const FIXTURE_ELECTION: ElectionRef = {
  id: "us-2026-11-03-general",
  slug: "2026-11-03",
  name: "November 3, 2026 General Election",
  date: "2026-11-03",
  externalIds: { fixture: "9999", "google-civic": "9999" },
};
