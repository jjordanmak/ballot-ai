"use client";
import { useEffect, useState } from "react";
import type { Race } from "@/data/types";

export function useScrollSpy(races: Race[]) {
  const [activeRaceId, setActiveRaceId] = useState<string>(races[0]?.id ?? "");
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visible = new Map<string, number>();

    races.forEach((race) => {
      const el = document.getElementById(`race-${race.id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              visible.set(race.id, entry.intersectionRatio);
            } else {
              visible.delete(race.id);
            }
          });
          if (visible.size > 0) {
            const top = [...visible.entries()].sort((a, b) => b[1] - a[1])[0][0];
            setActiveRaceId(top);
          }
        },
        { rootMargin: "-15% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [races]);

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            visible.set(id, entry.intersectionRatio);
          } else {
            visible.delete(id);
          }
        });
        if (visible.size > 0) {
          const top = [...visible.entries()].sort((a, b) => b[1] - a[1])[0][0];
          setActiveCandidateId(top);
        } else {
          setActiveCandidateId(null);
        }
      },
      { rootMargin: "-25% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    races.forEach((race) => {
      race.candidates.forEach((cand) => {
        const el = document.getElementById(`candidate-${race.id}-${cand.id}`);
        if (el) observer.observe(el);
      });
    });

    return () => observer.disconnect();
  }, [races]);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { activeRaceId, activeCandidateId, showBackToTop };
}
