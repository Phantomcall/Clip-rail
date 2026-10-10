"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { MenuPanel } from "@/components/ui/MenuPanel";
import { useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ProfileEditor } from "@/components/auth/ProfileEditor";
import { useAuth } from "@/lib/auth";
import { useBalances } from "@/lib/balances";
import { shortAddress, usd } from "@/lib/format";
import { normalizeUsername, usernameError } from "@/lib/names";

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
      <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5V4.5a2 2 0 1 0-4 0V6h4Z" />
    </svg>
  );
}

const fmtMon = (wei: bigint) => {
  const n = Number(formatEther(wei));
  return n === 0 ? "0" : n < 0.001 ? "<0.001" : n.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

/** Signed in (or locked): the account pill and its menu. */
function AccountMenu() {
  const { address, handle, avatar, status, isMock, signOut, getAccount } = useAuth();
  const [editing, setEditing] = useState(false);
  const balances = useBalances();
  const [open, setOpen] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const locked = status === "locked" || unlocking;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!address) return null;
  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      <ProfileEditor open={editing} onOpenChange={setEditing} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3 pl-1 text-sm font-semibold"
      >
        <span className="relative">
          <UserAvatar src={avatar} name={handle ?? address} size={28} />
          {locked ? (
            <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-surface text-holding" title="Locked: your passkey unlocks it on your next action">
              <LockIcon />
            </span>
          ) : (
            <span aria-hidden className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface ${status === "signing-in" ? "animate-pulse bg-holding" : "bg-money"}`} />
          )}
        </span>
        <span className="hidden sm:inline">{handle ? `@${handle}` : shortAddress(address)}</span>
        <span className="font-mono sm:hidden">{shortAddress(address)}</span>
      </button>

      <MenuPanel open={open} className="absolute top-11 right-0 z-50 w-72 overflow-hidden rounded-2xl border border-line bg-surface text-sm shadow-[var(--shadow-float)]">
          <div className="border-b border-line p-4">
            <div className="flex items-center gap-3">
              <UserAvatar src={avatar} name={handle ?? address} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{handle ? `@${handle}` : "Your account"}</div>
                <div className="flex items-center gap-1 font-mono text-xs text-muted">
                  {shortAddress(address)} <CopyButton text={address} label="Copy" className="px-1.5 py-0.5" />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                close();
                setEditing(true);
              }}
              className="mt-3 w-full rounded-xl border border-line px-3 py-2 text-xs font-semibold hover:border-accent hover:text-accent"
            >
              {handle ? "Edit profile" : "Choose a username and photo"}
            </button>

            {!isMock && (
              <div className="tabular mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-surface-2 p-2.5">
                  <div className="text-[10px] font-medium tracking-wide text-muted uppercase">USDC</div>
                  <div className="font-display text-base font-bold">
                    {balances.data ? usd(Number(balances.data.usdc)) : balances.isError ? "–" : "…"}
                  </div>
                </div>
                <div className="rounded-xl bg-surface-2 p-2.5">
                  <div className="text-[10px] font-medium tracking-wide text-muted uppercase">MON (gas)</div>
                  <div className="font-display text-base font-bold">
                    {balances.data ? fmtMon(balances.data.mon) : balances.isError ? "–" : "…"}
                  </div>
                </div>
                {!!balances.data?.testUsdc && (
                  <p className="col-span-2 rounded-xl bg-surface-2 px-2.5 py-2 text-xs text-muted">
                    <b className="text-fg">{usd(Number(balances.data.testUsdc))}</b> test USDC from the sandbox
                  </p>
                )}
              </div>
            )}
            {isMock && <p className="mt-2 text-xs text-muted">Demo account (mock auth). No real balances.</p>}

            {locked && (
              <div className="mt-3 rounded-xl border border-holding/30 bg-holding/10 p-3 text-xs">
                <p className="font-semibold text-holding">Locked</p>
                <p className="mt-0.5 text-muted">
                  Your key isn&apos;t in memory after a reload or 30 minutes away. Your passkey unlocks it the next time you
                  register a clip or send money.
                </p>
                <Button
                  variant="secondary"
                  className="mt-2 min-h-8 w-full text-xs"
                  loading={unlocking}
                  onClick={async () => {
                    setUnlockError(null);
                    setUnlocking(true);
                    try {
                      await getAccount();
                    } catch (e) {
                      setUnlockError(e instanceof Error ? e.message : "Couldn't unlock.");
                    } finally {
                      setUnlocking(false);
                    }
                  }}
                >
                  Unlock now
                </Button>
                {unlockError && <p role="alert" className="mt-1.5 text-danger">{unlockError}</p>}
              </div>
            )}
          </div>

          <nav className="py-1">
            <Link href="/me" onClick={close} className="block px-4 py-2.5 hover:bg-surface-2">My earnings</Link>
            <Link href="/brand" onClick={close} className="block px-4 py-2.5 hover:bg-surface-2">Brand console</Link>
            <Link href={`/u/${address}`} onClick={close} className="block px-4 py-2.5 hover:bg-surface-2">Public profile</Link>
          </nav>
          <button
            type="button"
            onClick={() => {
              close();
              signOut();
            }}
            className="block w-full border-t border-line px-4 py-2.5 text-left text-muted hover:bg-surface-2 hover:text-fg"
          >
            Sign out
          </button>
      </MenuPanel>
    </div>
  );
}

/** Header auth control (P-1.5). Signed out: the passkey modal. Signed in or locked: the account menu. */
export function SignInButton() {
  const { address, status, error, signIn, signUp } = useAuth();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const nameError = usernameError(handle);
  // Errors from an earlier attempt shouldn't greet you when the modal opens again.
  const [hiddenError, setHiddenError] = useState<string | null>(null);
  const shownError = error && error !== hiddenError ? error : null;
  const busy = status === "signing-in";

  if (address) return <AccountMenu />;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o) setHiddenError(error);
        setOpen(o);
      }}
    >
      <Dialog.Trigger asChild>
        <Button className="min-h-9 px-4">Sign in</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
        <Dialog.Content className="fixed inset-x-4 bottom-4 z-50 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in">
          <span aria-hidden className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-xl">🔑</span>
          <Dialog.Title className="mt-3 text-lg font-semibold">Sign in to Cliprail</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Use your face or fingerprint. No app, no seed phrase, no password. Your passkey is your account.
          </Dialog.Description>

          <Button className="mt-5 w-full" loading={busy} onClick={async () => (await signIn()) && setOpen(false)}>
            I already have an account
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />new here?<span className="h-px flex-1 bg-line" />
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (usernameError(handle)) return;
              if (await signUp(normalizeUsername(handle))) setOpen(false);
            }}
            className="flex flex-col gap-3"
          >
            <label className="text-xs font-medium text-muted" htmlFor="handle">Pick a username (shown on your public profile)</label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">@</span>
              <input
                id="handle"
                value={handle}
                onChange={(e) => setHandle(normalizeUsername(e.target.value))}
                placeholder="yourname"
                autoComplete="username webauthn"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={20}
                aria-invalid={!!(handle && nameError)}
                aria-describedby="handle-hint"
                className={`min-h-11 w-full rounded-[var(--radius-control)] border bg-surface-2 pr-3 pl-7 text-sm outline-none focus:border-accent ${handle && nameError ? "border-danger" : "border-line"}`}
              />
            </div>
            <p id="handle-hint" className={`-mt-1 text-xs ${handle && nameError ? "text-danger" : "text-muted"}`}>
              {handle && nameError ? nameError : handle ? `You'll be @${handle}` : "3–20 letters, numbers, dots or underscores."}
            </p>
            <Button type="submit" variant="secondary" loading={busy} disabled={!!nameError}>
              Create account with passkey
            </Button>
          </form>

          {shownError && (
            <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-danger/10 p-3 text-sm text-danger">
              {shownError}
            </p>
          )}
          <p className="mt-4 text-xs text-muted">Works best on iPhone Safari, or Chrome with Google Password Manager.</p>
          <Dialog.Close className="absolute top-4 right-4 rounded-md px-2 text-muted transition-[color,transform] duration-200 ease-out-soft hover:rotate-90 hover:text-fg" aria-label="Close">✕</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
