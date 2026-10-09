/**
 * One way to show a person everywhere on Cliprail.
 * - With a username: "@tobi.cuts".
 * - Without one: a short readable address, "0x4f1e…c7d6", never a fake "@clipper#123".
 * Usernames are chosen at sign-up and saved to the ops Worker (signed by the account) once that endpoint exists; until
 * then they come from the indexer/mocks and the signed-in user's own device.
 */
import { shortAddress } from "@/lib/format";

/** Lowercase letters, numbers, dots and underscores; 3–20 characters; can't start or end with a dot. */
export const USERNAME_RE = /^(?!\.)(?!.*\.$)[a-z0-9._]{3,20}$/;

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export function usernameError(input: string): string | null {
  const u = normalizeUsername(input);
  if (u.length < 3) return "At least 3 characters.";
  if (u.length > 20) return "At most 20 characters.";
  if (!USERNAME_RE.test(u)) return "Use letters, numbers, dots and underscores. No dot at the start or end.";
  return null;
}

export function displayName(address: string, handle?: string | null): { primary: string; secondary: string | null; hasName: boolean } {
  const h = handle ? normalizeUsername(handle) : "";
  if (h) return { primary: `@${h}`, secondary: shortAddress(address), hasName: true };
  return { primary: shortAddress(address), secondary: null, hasName: false };
}
