"use client";

import { claimCode, parseVideoId } from "@cliprail/shared";
import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClaimCodeBox } from "@/components/ui/ClaimCodeBox";
import { Field, Input } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { TxLink } from "@/components/ui/TxLink";
import { useToast } from "@/components/ui/Toast";
import { useRegisterClip } from "@/lib/actions";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { count, usd } from "@/lib/format";
import type { Campaign } from "@/lib/types";
import { fetchPreview, type Preview } from "@/lib/youtube";

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2 text-sm", ok ? "text-fg" : "text-danger")}>
      <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold", ok ? "bg-money/20 text-money" : "bg-danger/20 text-danger")}>
        {ok ? "✓" : "!"}
      </span>
      {children}
    </li>
  );
}

export function RegisterClip({ campaign }: { campaign: Campaign }) {
  const { address } = useAuth();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const tx = useRegisterClip();
  const toast = useToast();

  if (!address) return null;
  const code = claimCode(BigInt(campaign.id), address);

  const check = async () => {
    const id = parseVideoId(url);
    if (!id) {
      setUrlError("That doesn't look like a YouTube Shorts link.");
      return;
    }
    setUrlError(null);
    setChecking(true);
    try {
      setPreview(await fetchPreview(id, code));
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : "Couldn't load that video.");
      setPreview(null);
    } finally {
      setChecking(false);
    }
  };

  const postedAfterStart = preview ? preview.publishedAt >= campaign.startsAt : false;
  const allGood = !!preview && preview.public && preview.codeFound && postedAfterStart;

  const submit = async () => {
    if (!preview) return;
    const hash = await tx.run(campaign.id, preview.videoId);
    if (hash) toast({ tone: "success", title: "Clip registered", txHash: hash });
    else toast({ tone: "error", title: `Registration failed. ${tx.lastError() ?? "Try again."}` });
  };

  if (tx.status === "success" && tx.txHash) {
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-info/15 text-2xl text-info">⏳</span>
        <h2 className="text-2xl font-bold">Clip registered: pending verification</h2>
        <p className="max-w-md text-muted">
          The oracle checks your Short every few minutes. Once it sees your claim code, the clip goes Active and verified views start
          earning {usd(campaign.cpm)} per 1,000.
        </p>
        <TxLink hash={tx.txHash} label="View registration" />
        <div className="flex gap-3">
          <LinkButton href="/me">Track my earnings</LinkButton>
          <Button variant="secondary" onClick={() => { tx.reset(); setStep(0); setUrl(""); setPreview(null); }}>Register another</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={["Copy your code", "Paste your Short", "Submit"]} current={step} />

      {step === 0 && (
        <Card className="flex flex-col gap-5">
          <ClaimCodeBox code={code} />
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Cut a 20–60 second vertical clip from the source video.</li>
            <li>Post it as a YouTube Short <b className="text-fg">after</b> this campaign started.</li>
            <li>Put <code className="font-mono text-fg">{code}</code> anywhere in the description.</li>
            <li>Keep likes visible. Hidden likes count as zero.</li>
          </ol>
          <Button onClick={() => setStep(1)} className="self-end">I&apos;ve posted it →</Button>
        </Card>
      )}

      {step >= 1 && (
        <Card className="flex flex-col gap-5">
          <Field label="Your Short's link" htmlFor="url" error={urlError} hint="youtube.com/shorts/… or a youtu.be link">
            <div className="flex gap-2">
              <Input
                id="url"
                value={url}
                inputMode="url"
                placeholder="https://youtube.com/shorts/…"
                onChange={(e) => { setUrl(e.target.value); setPreview(null); setStep(1); }}
                invalid={!!urlError}
              />
              <Button variant="secondary" onClick={check} loading={checking}>Check</Button>
            </div>
          </Field>

          {preview && (
            <div className="grid gap-4 rounded-[var(--radius-control)] border border-line bg-surface-2 p-4 sm:grid-cols-[8rem_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.thumb} alt="" className="aspect-[9/16] w-24 rounded-md object-cover sm:w-32" />
              <div className="flex flex-col gap-3">
                <div>
                  <div className="font-semibold">{preview.title}</div>
                  <div className="tabular text-xs text-muted">{preview.channel} · {count(preview.views)} views · {count(preview.likes)} likes (live, not yet verified)</div>
                </div>
                <ul className="flex flex-col gap-1.5">
                  <Check ok={preview.public}>Video is public</Check>
                  <Check ok={preview.codeFound}>{preview.codeFound ? <>Claim code <code className="font-mono">{code}</code> found in the description</> : <>Claim code <code className="font-mono">{code}</code> not found yet. Add it, then check again</>}</Check>
                  <Check ok={postedAfterStart}>{postedAfterStart ? "Posted after the campaign started" : "Posted before the campaign started, so it can't earn here"}</Check>
                </ul>
              </div>
            </div>
          )}

          <div className="flex justify-between gap-3 border-t border-line pt-5">
            <Button variant="ghost" onClick={() => setStep(0)}>← Show my code</Button>
            <Button
              disabled={!allGood}
              loading={tx.status === "signing" || tx.status === "pending"}
              onClick={() => { setStep(2); submit(); }}
            >
              {tx.status === "signing" ? "Confirm with passkey…" : tx.status === "pending" ? "Registering…" : "Register clip"}
            </Button>
          </div>
          <p className="text-xs text-muted">Registering is free. We cover the network fee.</p>
        </Card>
      )}
    </div>
  );
}
