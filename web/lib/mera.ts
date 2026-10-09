/**
 * Passkey accounts with Mera (playbook D-1.4). The passkey's PRF output is the only root secret:
 * PRF (32 bytes) → BIP-39 entropy → seed → BIP-32 m/44'/60'/0'/0/0 → secp256k1 key → signing session.
 * Nothing secret is stored; localStorage only keeps credential metadata so sign-in can target it.
 */
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { Address } from "@/lib/types";

const RP_NAME = "Cliprail";
const EVM_PATH = "m/44'/60'/0'/0/0";
const STORAGE_KEY = "cliprail.accounts.v1";

/** Passkeys are bound to this domain. It must never change after launch (PRD §4). */
export function rpId(): string {
  return process.env.NEXT_PUBLIC_RP_ID || window.location.hostname;
}

export interface StoredAccount extends PasskeyCredentialMetadata {
  address: Address;
  handle: string;
  /** Profile photo as a small data URL (set by the user; never part of the passkey). */
  avatar?: string;
  lastUsed: number;
}

export interface UnlockedAccount {
  address: Address;
  session: Secp256k1SigningSession;
  credential: StoredAccount;
}

// ---------- credential metadata (not secret) ----------

export function loadAccounts(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

function saveAccount(account: StoredAccount) {
  try {
    const others = loadAccounts().filter((a) => a.credentialId !== account.credentialId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([account, ...others]));
  } catch {
    // Private mode or blocked storage: sign-in still works through the discoverable passkey picker.
  }
}

/** Edit the stored profile (username, photo) of an account on this device. */
export function updateAccount(credentialId: string, patch: Partial<Pick<StoredAccount, "handle" | "avatar">>) {
  const acct = loadAccounts().find((a) => a.credentialId === credentialId);
  if (!acct) return;
  const next = { ...acct, ...patch };
  if (patch.avatar === undefined && "avatar" in patch) delete next.avatar;
  saveAccount(next);
}

/** The most recently used account on this device, if any. */
export function lastAccount(): StoredAccount | null {
  return loadAccounts().sort((a, b) => b.lastUsed - a.lastUsed)[0] ?? null;
}

// ---------- key derivation ----------

function sessionFromPrf(prfOutput: Uint8Array): Secp256k1SigningSession {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(EVM_PATH);
  const privateKey = node.privateKey;
  if (!privateKey) throw new Error("Key derivation failed");
  try {
    // The session copies the key; wipe every intermediate we own.
    return createSecp256k1SigningSession({ privateKey });
  } finally {
    privateKey.fill(0);
    seed.fill(0);
    prfOutput.fill(0);
    node.wipePrivateData();
  }
}

function unlocked(session: Secp256k1SigningSession, credentialId: string, handle: string, transports?: readonly string[]): UnlockedAccount {
  const address = getEvmAddress(session.publicKey) as Address;
  const credential: StoredAccount = {
    credentialId,
    ...(transports ? { transports: [...transports] } : {}),
    address,
    handle,
    lastUsed: Date.now(),
  };
  saveAccount(credential);
  return { address, session, credential };
}

// ---------- ceremonies ----------

/** Creates a new passkey and the account derived from it. One or two biometric prompts. */
export async function signUpWithPasskey(handle: string): Promise<UnlockedAccount> {
  const name = handle.replace(/^@/, "");
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: RP_NAME },
    user: { name: name || "cliprail", displayName: name ? `${name} · Cliprail` : "Cliprail account" },
  });
  return unlocked(sessionFromPrf(created.prfOutput), created.credentialId, name, created.transports);
}

/**
 * Signs in with an existing passkey. With `credential`, the prompt targets that passkey (used to
 * unlock a remembered account); without it, the platform shows its passkey picker.
 */
export async function signInWithPasskey(credential?: StoredAccount): Promise<UnlockedAccount> {
  const result = await getPasskeyPrfOutput({
    rpId: rpId(),
    ...(credential ? { credential: { credentialId: credential.credentialId, transports: credential.transports } } : {}),
  });
  const known = loadAccounts().find((a) => a.credentialId === result.credentialId);
  return unlocked(sessionFromPrf(result.prfOutput), result.credentialId, known?.handle ?? "", known?.transports);
}

// ---------- errors ----------

export const PRF_UNSUPPORTED_MESSAGE =
  "This browser can't create a Cliprail account. Use iPhone Safari or Chrome with Google Password Manager.";

/** User-facing message for an auth failure, or null when the user simply cancelled. */
export function authErrorMessage(error: unknown): string | null {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") return PRF_UNSUPPORTED_MESSAGE;
    if (error.code === "CRYPTO_UNAVAILABLE") return "This page needs a secure (HTTPS) connection to use passkeys.";
    if (error.code === "PASSKEY_OPERATION_FAILED") {
      const cause = error.cause;
      // WebAuthn reports both "cancelled" and "timed out" as NotAllowedError. Treat them as a quiet cancel.
      if (cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "AbortError")) return null;
      if (typeof window !== "undefined" && !window.PublicKeyCredential) return PRF_UNSUPPORTED_MESSAGE;
      if (cause instanceof DOMException && cause.name === "InvalidStateError") return "That passkey already exists on this device. Sign in instead.";
      if (cause instanceof DOMException && cause.name === "SecurityError") return "Passkeys aren't allowed on this address. Open Cliprail from its main link.";
      return "Passkey sign-in failed. Try again.";
    }
  }
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
