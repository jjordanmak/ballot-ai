/**
 * Whether typed input is far enough along to be worth an autocomplete request.
 * Each request counts against the monthly free Places allowance
 * (src/lib/usage/quota.ts), so we wait for input that can narrow to real
 * addresses:
 *   - a house number plus at least 3 letters after it ("123 Mai",
 *     "12-34 Mai", "123 N 1st"), or
 *   - 8+ characters when the input doesn't start with a number.
 */
export function readyToSuggest(value: string): boolean {
  const s = value.trim();
  if (/^\d/.test(s)) return /^\S*\d\S*\s+(?:.*?\p{L}){3}/u.test(s);
  return s.length >= 8;
}
