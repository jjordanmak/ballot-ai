import list from "@/data/sources/news.json";
import type { SourceContext } from "./match";

export interface NewsSource extends SourceContext {
  key: string;
  name: string;
  url: string;
  enabled: boolean;
}

/** Approved news sources (src/data/sources/news.json). */
export const NEWS_SOURCES = (list as { sources: NewsSource[] }).sources;
