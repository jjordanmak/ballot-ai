import "server-only";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; anything else is refused. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
