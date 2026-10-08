"use client";

import { useState } from "react";
import { ProfileEditor } from "@/components/auth/ProfileEditor";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/lib/auth";
import { displayName } from "@/lib/names";

/** Your own profile shows your device-saved photo and username; anyone else's shows what the indexer knows. */
function useIdentity(address: string, serverHandle?: string | null) {
  const { address: me, handle, avatar } = useAuth();
  const mine = !!me && me.toLowerCase() === address.toLowerCase();
  return { mine, handle: mine ? (handle ?? serverHandle) : serverHandle, avatar: mine ? avatar : null };
}

export function ProfileAvatar({ address, handle }: { address: string; handle?: string | null }) {
  const id = useIdentity(address, handle);
  return (
    <UserAvatar
      src={id.avatar}
      name={id.handle ?? address}
      size={96}
      className="rounded-3xl border-4 border-white font-display shadow-[var(--shadow-float)] dark:border-[#141830]"
    />
  );
}

export function ProfileName({ address, handle }: { address: string; handle?: string | null }) {
  const id = useIdentity(address, handle);
  return <>{displayName(address, id.handle).primary}</>;
}

export function EditProfileButton({ address }: { address: string }) {
  const { mine } = useIdentity(address);
  const [open, setOpen] = useState(false);
  if (!mine) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass rounded-full px-4 py-2 text-sm font-semibold hover:text-accent">
        Edit profile
      </button>
      <ProfileEditor open={open} onOpenChange={setOpen} />
    </>
  );
}
