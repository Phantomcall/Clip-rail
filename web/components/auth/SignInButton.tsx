"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { shortAddress } from "@/lib/format";

/** Header auth control (P-1.5). Signed out: opens the passkey modal. Signed in: account menu. */
export function SignInButton() {
  const { address, status, error, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");

  if (address) {
    return (
      <details className="group relative">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-sm font-semibold">
          <span aria-hidden className="size-2 rounded-full bg-money" />
          <span className="font-mono">{shortAddress(address)}</span>
        </summary>
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface text-sm shadow-xl">
          <Link href="/me" className="block px-4 py-2.5 hover:bg-surface-2">My earnings</Link>
          <Link href="/brand" className="block px-4 py-2.5 hover:bg-surface-2">Brand console</Link>
          <Link href={`/u/${address}`} className="block px-4 py-2.5 hover:bg-surface-2">Public profile</Link>
          <button onClick={signOut} className="block w-full border-t border-line px-4 py-2.5 text-left text-muted hover:bg-surface-2 hover:text-fg">
            Sign out
          </button>
        </div>
      </details>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button className="min-h-9 px-3">Sign in</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-4 bottom-4 z-50 rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2">
          <Dialog.Title className="text-lg font-semibold">Sign in to Cliprail</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            Use your face or fingerprint. No app, no seed phrase, no password.
          </Dialog.Description>
          <Button
            className="mt-5 w-full"
            loading={status === "signing-in"}
            onClick={async () => {
              if (await signIn()) setOpen(false);
            }}
          >
            I already have an account
          </Button>
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />new here?<span className="h-px flex-1 bg-line" />
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await signUp(handle.trim() || "clipper")) setOpen(false);
            }}
            className="flex flex-col gap-3"
          >
            <label className="text-xs font-medium text-muted" htmlFor="handle">Pick a name</label>
            <input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourname"
              className="min-h-11 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
            />
            <Button type="submit" variant="secondary" loading={status === "signing-in"}>Create account with passkey</Button>
          </form>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <p className="mt-4 text-xs text-muted">Works best on iPhone Safari, or Chrome with Google Password Manager.</p>
          <Dialog.Close className="absolute top-4 right-4 rounded-md px-2 text-muted hover:text-fg" aria-label="Close">✕</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
