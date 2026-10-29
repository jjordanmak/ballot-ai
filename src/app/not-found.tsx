import { ErrorShell } from "@/components/ErrorShell";

export default function NotFound() {
  return <ErrorShell title="This page doesn’t exist">The link may be mistyped or out of date. Enter your address to see your ballot.</ErrorShell>;
}
