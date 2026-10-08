"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { normalizeUsername, usernameError } from "@/lib/names";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Square-crop and shrink an image file to a 256 px WebP data URL, so a profile photo stays a few KB. */
async function toAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.82);
}

type GoogleId = {
  accounts: { id: { initialize: (o: object) => void; prompt: () => void } };
};

/**
 * "Use my Google photo": Google Identity Services returns an ID token with the account's `picture`. We only read the
 * picture URL for display; the passkey stays the account's only key. Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 */
function useGooglePhoto(onPicture: (url: string) => void) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      (window as unknown as { google: GoogleId }).google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({ credential }: { credential: string }) => {
          try {
            const payload = JSON.parse(atob(credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { picture?: string };
            if (payload.picture) onPicture(payload.picture.replace(/=s\d+-c$/, "=s256-c"));
          } catch {
            // ignore a malformed token
          }
        },
      });
      setReady(true);
    };
    document.head.appendChild(s);
    return () => s.remove();
  }, [onPicture]);
  return ready ? () => (window as unknown as { google: GoogleId }).google.accounts.id.prompt() : null;
}

export function ProfileEditor({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { address, handle, avatar, updateProfile } = useAuth();
  const [name, setName] = useState(handle ?? "");
  const [photo, setPhoto] = useState<string | null>(avatar);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const googlePhoto = useGooglePhoto(setPhoto);

  const nameError = name ? usernameError(name) : "Pick a username.";
  const dirty = name !== (handle ?? "") || photo !== avatar;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setName(handle ?? "");
          setPhoto(avatar);
          setErr(null);
        }
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed inset-x-4 bottom-4 z-50 rounded-[var(--radius-card)] p-6 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2">
          <Dialog.Title className="text-lg font-semibold">Edit profile</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">This is how brands and other clippers see you.</Dialog.Description>

          <div className="mt-5 flex items-center gap-4">
            <UserAvatar src={photo} name={name || address || "?"} size={72} className="ring-4 ring-white/60 dark:ring-white/10" />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => file.current?.click()} loading={busy}>
                  Upload photo
                </Button>
                {googlePhoto && (
                  <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={googlePhoto}>
                    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
                      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
                      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
                      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" />
                      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6Z" />
                    </svg>
                    Use Google photo
                  </Button>
                )}
              </div>
              {photo && (
                <button type="button" onClick={() => setPhoto(null)} className="self-start text-xs font-medium text-muted hover:text-danger">
                  Remove photo
                </button>
              )}
            </div>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setErr(null);
                setBusy(true);
                try {
                  setPhoto(await toAvatar(f));
                } catch {
                  setErr("Couldn't read that image. Try a JPG or PNG.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </div>

          <label className="mt-6 block text-xs font-medium text-muted" htmlFor="profile-username">
            Username
          </label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">@</span>
            <input
              id="profile-username"
              value={name}
              onChange={(e) => setName(normalizeUsername(e.target.value))}
              maxLength={20}
              autoCapitalize="none"
              spellCheck={false}
              className={`min-h-11 w-full rounded-[var(--radius-control)] border bg-surface-2 pr-3 pl-7 text-sm outline-none focus:border-accent ${name && nameError ? "border-danger" : "border-line"}`}
            />
          </div>
          <p className={`mt-1.5 text-xs ${name && nameError ? "text-danger" : "text-muted"}`}>
            {name && nameError ? nameError : "3–20 letters, numbers, dots or underscores."}
          </p>
          {err && <p className="mt-2 text-xs text-danger">{err}</p>}

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button
              type="button"
              disabled={!!nameError || !dirty}
              onClick={() => {
                updateProfile({ handle: name, avatar: photo });
                onOpenChange(false);
              }}
            >
              Save
            </Button>
          </div>
          <p className="mt-4 text-[11px] text-muted">
            Saved on this device for now. Your passkey stays your only key: the photo is just for your profile.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
