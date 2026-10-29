import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeprecatedBallotView, deprecatedBallot, deprecatedPagesEnabled } from "@/components/deprecated/JunePrimary";

/**
 * DEPRECATED, INTERNAL ONLY: the June 2, 2026 CA primary prototype
 * (ZIP-based, hand-researched). Rendered from a frozen snapshot, never the
 * database, so later schema or content changes can't break it. Reachable
 * only locally and on Vercel preview deployments (which require Vercel
 * login); production returns 404. Nothing links here.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ zip: string; electionId: string }>;
}): Promise<Metadata> {
  const { zip } = await params;
  return { title: `ballot.ai • June 2026 primary (internal) ${zip}`, robots: { index: false, follow: false } };
}

export default async function DeprecatedBallotPage({
  params,
}: {
  params: Promise<{ zip: string; electionId: string }>;
}) {
  const { zip, electionId } = await params;
  if (!deprecatedPagesEnabled()) notFound();
  const ballot = deprecatedBallot(electionId, zip);
  if (!ballot) notFound();
  return <DeprecatedBallotView ballot={ballot} />;
}

