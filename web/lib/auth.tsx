"use client";

/**
 * Auth for the app (playbook D-1.4, D-1.5). Mera passkey accounts with an in-memory signing session.
 *
 * - "signed-in": the signing session is live; writes sign without a prompt.
 * - "locked": we know the account (after a reload, or 30 minutes hidden) but the key is not in memory.
 *   Reads work; the next write asks for the passkey once via getAccount().
 *
 * NEXT_PUBLIC_MOCK_AUTH=clipper|brand keeps the old fake identities for screen work without passkeys.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toViemAccount } from "@category-labs/mera/viem";
import type { LocalAccount } from "viem";
import type { Address } from "@/lib/types";
import {
  authErrorMessage,
  loadAccounts,
  signInWithPasskey,
  signUpWithPasskey,
  type StoredAccount,
  updateAccount,
  type UnlockedAccount,
} from "@/lib/mera";
import { MOCK_BRAND, MOCK_CLIPPER } from "@/mocks/data";

type Status = "signed-out" | "signing-in" | "locked" | "signed-in";

interface AuthValue {
  address: Address | null;
  /** The username, if one is set on this device. */
  handle: string | null;
  /** Profile photo (data URL), if set. */
  avatar: string | null;
  /** Change the username and/or photo. `avatar: null` removes the photo. */
  updateProfile: (p: { handle?: string; avatar?: string | null }) => void;
  status: Status;
  /** Last user-facing auth error; null after a quiet cancel or a success. */
  error: string | null;
  /** True when running on NEXT_PUBLIC_MOCK_AUTH identities (no real signing). */
  isMock: boolean;
  /** Resolves true on success. */
  signUp: (handle: string) => Promise<boolean>;
  signIn: () => Promise<boolean>;
  signOut: () => void;
  /** The viem account for writes. Prompts for the passkey if the session is locked. */
  getAccount: () => Promise<LocalAccount>;
  /** Dev-only: switch the mock identity between clipper and brand. */
  mockAs?: (who: "clipper" | "brand") => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const ACTIVE_KEY = "cliprail.active.v1";
const HIDDEN_LIMIT_MS = 30 * 60 * 1000;

// The remembered account lives in localStorage; read it through useSyncExternalStore so the
// server render (no account) and the first client render agree.
const activeListeners = new Set<() => void>();

function subscribeActive(cb: () => void) {
  activeListeners.add(cb);
  return () => activeListeners.delete(cb);
}

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(credentialId: string | null) {
  try {
    if (credentialId) localStorage.setItem(ACTIVE_KEY, credentialId);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // storage blocked: the session still works until reload
  }
  activeListeners.forEach((cb) => cb());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const preset = process.env.NEXT_PUBLIC_MOCK_AUTH;
  return preset === "clipper" || preset === "brand" ? (
    <MockAuthProvider preset={preset}>{children}</MockAuthProvider>
  ) : (
    <MeraAuthProvider>{children}</MeraAuthProvider>
  );
}

function MeraAuthProvider({ children }: { children: React.ReactNode }) {
  const activeId = useSyncExternalStore(subscribeActive, readActiveId, () => null);
  // bumped after a profile edit so the stored account is read again
  const [rev, setRev] = useState(0);
  const known = useMemo<StoredAccount | null>(
    () => (activeId ? (loadAccounts().find((a) => a.credentialId === activeId) ?? null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rev forces a re-read of localStorage
    [activeId, rev],
  );
  /** True while a signing session is in memory. */
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = useRef<UnlockedAccount | null>(null);
  const unlocking = useRef<Promise<LocalAccount> | null>(null);

  const endSession = useCallback(() => {
    current.current?.session.end();
    current.current = null;
    setLive(false);
  }, []);

  // Wipe the key on unmount.
  useEffect(() => endSession, [endSession]);

  // End the session after 30 minutes with the tab hidden. The account stays known ("locked").
  useEffect(() => {
    let hiddenAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        timer = setTimeout(endSession, HIDDEN_LIMIT_MS);
      } else {
        clearTimeout(timer);
        // Background timers can be throttled, so also check on return.
        if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_LIMIT_MS) endSession();
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timer);
    };
  }, [endSession]);

  const adopt = useCallback(
    (acct: UnlockedAccount) => {
      current.current?.session.end();
      current.current = acct;
      setLive(true);
      setError(null);
      writeActive(acct.credential.credentialId);
    },
    [],
  );

  const run = useCallback(
    async (ceremony: () => Promise<UnlockedAccount>) => {
      setBusy(true);
      setError(null);
      try {
        adopt(await ceremony());
        return true;
      } catch (e) {
        setError(authErrorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  const signUp = useCallback((handle: string) => run(() => signUpWithPasskey(handle)), [run]);
  const signIn = useCallback(() => run(() => signInWithPasskey()), [run]);

  const signOut = useCallback(() => {
    endSession();
    writeActive(null);
    setError(null);
  }, [endSession]);

  const getAccount = useCallback(async (): Promise<LocalAccount> => {
    if (current.current) return toViemAccount(current.current.session);
    const credential = known;
    if (!credential) throw new Error("Sign in first.");
    // Several writes may ask at once; show one passkey prompt.
    unlocking.current ??= (async () => {
      setBusy(true);
      try {
        const acct = await signInWithPasskey(credential);
        if (acct.address.toLowerCase() !== credential.address.toLowerCase()) {
          acct.session.end();
          throw new Error("That passkey belongs to a different account.");
        }
        adopt(acct);
        return toViemAccount(acct.session);
      } catch (e) {
        throw new Error(authErrorMessage(e) ?? "Cancelled.");
      } finally {
        setBusy(false);
        unlocking.current = null;
      }
    })();
    return unlocking.current;
  }, [adopt, known]);

  const address = known?.address ?? null;
  const handle = known?.handle || null;
  const avatar = known?.avatar ?? null;
  const updateProfile = useCallback(
    (p: { handle?: string; avatar?: string | null }) => {
      if (!known) return;
      updateAccount(known.credentialId, {
        ...(p.handle !== undefined ? { handle: p.handle } : {}),
        ...(p.avatar !== undefined ? { avatar: p.avatar ?? undefined } : {}),
      });
      setRev((r) => r + 1);
    },
    [known],
  );
  const status: Status = busy ? "signing-in" : live && known ? "signed-in" : known ? "locked" : "signed-out";

  const value = useMemo<AuthValue>(
    () => ({ address, handle, avatar, updateProfile, status, error, isMock: false, signUp, signIn, signOut, getAccount }),
    [address, handle, avatar, updateProfile, status, error, signUp, signIn, signOut, getAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function MockAuthProvider({ preset, children }: { preset: "clipper" | "brand"; children: React.ReactNode }) {
  const [address, setAddress] = useState<Address | null>(preset === "brand" ? MOCK_BRAND : MOCK_CLIPPER);
  const [status, setStatus] = useState<Status>("signed-in");
  const [as, setAs] = useState<"clipper" | "brand">(preset);
  const [mockProfile, setMockProfile] = useState<{ handle?: string; avatar?: string | null }>({});

  const fakeSign = useCallback(async () => {
    setStatus("signing-in");
    await new Promise((r) => setTimeout(r, 600));
    setAddress(as === "brand" ? MOCK_BRAND : MOCK_CLIPPER);
    setStatus("signed-in");
    return true;
  }, [as]);

  const value = useMemo<AuthValue>(
    () => ({
      address,
      handle: address ? (mockProfile.handle ?? (as === "brand" ? "orbit.wallet" : "tobi.cuts")) : null,
      avatar: address ? (mockProfile.avatar ?? null) : null,
      updateProfile: (p) => setMockProfile((m) => ({ ...m, ...p })),
      status,
      error: null,
      isMock: true,
      signUp: async () => fakeSign(),
      signIn: fakeSign,
      signOut: () => {
        setAddress(null);
        setStatus("signed-out");
      },
      getAccount: async () => {
        throw new Error("Mock auth can't sign. Unset NEXT_PUBLIC_MOCK_AUTH to use a passkey.");
      },
      mockAs: (who) => {
        setAs(who);
        if (address) setAddress(who === "brand" ? MOCK_BRAND : MOCK_CLIPPER);
      },
    }),
    [address, status, fakeSign, as, mockProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
