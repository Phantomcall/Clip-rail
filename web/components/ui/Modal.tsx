"use client";

import * as Dialog from "@radix-ui/react-dialog";

export function Modal({
  trigger,
  title,
  description,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
        <Dialog.Content className="fixed inset-x-4 bottom-4 z-50 rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {description && <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>}
          <div className="mt-4">{children}</div>
          <Dialog.Close className="absolute top-4 right-4 rounded-md px-2 text-muted transition-[color,transform] duration-200 ease-out-soft hover:rotate-90 hover:text-fg" aria-label="Close">
            ✕
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
