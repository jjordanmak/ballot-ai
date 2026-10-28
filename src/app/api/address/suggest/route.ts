import { json, places, readRequest } from "../_shared";

/** POST { input, sessionToken } → { suggestions: AddressSuggestion[] } */
export async function POST(req: Request) {
  const body = await readRequest(req);
  if (body === "forbidden") return json({ suggestions: [] }, 403);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!body || input.length < 3 || input.length > 200) return json({ suggestions: [] }, 400);
  return json({ suggestions: await places.suggest(input, body.sessionToken as string) });
}
