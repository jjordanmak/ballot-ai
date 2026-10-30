import list from "@/data/sources/news.json";
import type { SourceContext } from "./match";

export interface NewsSource extends SourceContext {
  key: string;
  name: string;
  url: string;
  enabled: boolean;
  /** Why a source is turned off (e.g. the publisher blocks automated readers). */
  disabledReason?: string;
  note?: string;
  /** Site GDELT indexes this outlet under: searched by candidate name, since we can't read its pages. */
  gdeltDomain?: string;
}

/** Approved news sources (src/data/sources/news.json). */
export const NEWS_SOURCES = (list as { sources: NewsSource[] }).sources;
