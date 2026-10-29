import type { Metadata } from "next";
import { AddressForm } from "@/components/AddressForm";
import { electionChoices } from "@/lib/ballot/electionChoices";

export const metadata: Metadata = {
  title: "ballot.ai • your voting guide",
};

/**
 * Landing: address-first. The form posts to a server action that resolves
 * the ballot and redirects to an address-free ballot URL.
 */
/** The election list changes rarely; re-read it every few minutes. */
export const revalidate = 300;

export default async function HomePage() {
  const elections = await electionChoices();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <div className="font-mono-cap text-[11px] text-[var(--color-paper-3)] mb-4 tracking-[0.18em]">
        A guide to your ballot
      </div>

      <h1 className="font-display text-[64px] sm:text-[96px] xl:text-[120px] leading-[0.92] tracking-[-0.03em] text-balance text-center">
        ballot<span className="text-[var(--color-paper-3)]">.ai</span>
      </h1>

      <p className="mt-6 max-w-xl text-center text-[16px] sm:text-[17px] leading-[1.6] text-[var(--color-paper-2)] text-pretty">
        Enter your address. Get your ballot. <mark>Understand every choice</mark>, with every fact linked to its source.
      </p>

      <div className="mt-14 w-full flex justify-center">
        <AddressForm autoFocus elections={elections} />
      </div>

      <p className="mt-12 max-w-md text-center text-[11px] leading-[1.6] text-[var(--color-paper-4)]">
        ballot.ai is independent and nonpartisan. It doesn{"’"}t endorse candidates or tell you how to vote. Your local
        election office is the official source for your ballot.
      </p>

    </div>
  );
}
