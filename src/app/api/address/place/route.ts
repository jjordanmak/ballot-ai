import { json, places, readRequest } from "../_shared";

const PLACE_ID = /^[A-Za-z0-9_-]{10,400}$/;

/** POST { placeId, sessionToken } → { address?: string } (full formatted address, with ZIP) */
export async function POST(req: Request) {
  const body = await readRequest(req);
  if (body === "forbidden") return json({}, 403);
  if (!body || typeof body.placeId !== "string" || !PLACE_ID.test(body.placeId)) return json({}, 400);
  return json({ address: await places.address(body.placeId, body.sessionToken as string) });
}
