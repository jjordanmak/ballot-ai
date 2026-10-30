import { ErrorShell } from "@/components/ErrorShell";

export default function NotFound() {
  return (
    <ErrorShell title="This page doesn’t exist" home>
      The link may be mistyped or out of date.
    </ErrorShell>
  );
}
