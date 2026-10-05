import { PageHeader } from "@/components/site/PageHeader";
import { AddressChip } from "@/components/ui/AddressChip";
import { StatusBadge, TierBadge } from "@/components/ui/Badge";
import { BudgetMeter } from "@/components/ui/BudgetMeter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClaimCodeBox } from "@/components/ui/ClaimCodeBox";
import { Counter } from "@/components/ui/Counter";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ReceiptRow } from "@/components/ui/ReceiptRow";
import { StatTile } from "@/components/ui/StatTile";
import { Stepper } from "@/components/ui/Stepper";
import { Tip } from "@/components/ui/Tip";
import { TxLink } from "@/components/ui/TxLink";
import { usd } from "@/lib/format";
import { NOW, receipts } from "@/mocks/data";

export const metadata = { title: "Styleguide · Cliprail" };

const swatches = ["bg", "surface", "surface-2", "line", "fg", "muted", "accent", "money", "holding", "danger", "info"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}

export default function Styleguide() {
  return (
    <>
    <PageHeader title="Styleguide" width="max-w-4xl">Every component from docs/design.md, in every state.</PageHeader>
    <div className="mx-auto max-w-4xl px-4 py-10">

      <Section title="Colour tokens">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {swatches.map((s) => (
            <div key={s} className="text-xs">
              <div className="h-12 rounded-md border border-line" style={{ background: `var(--color-${s})` }} />
              <div className="mt-1 font-mono text-muted">{s}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Flag clip</Button>
          <Button loading>Signing</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          {(["Pending", "Active", "Flagged", "Rejected", "Ended", "Closed"] as const).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <TierBadge tier={0} />
          <TierBadge tier={1} />
          <TierBadge tier={2} />
        </div>
      </Section>

      <Section title="Stat tiles and counter">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Verified" value={<Counter value={41_250_000} kind="usd" />} />
          <StatTile label="Holding" value={usd(6_420_000)} tone="holding" hint="unlocks in 20 h" />
          <StatTile label="Paid" value={usd(12_000_000)} tone="money" />
        </div>
      </Section>

      <Section title="Budget meter">
        <Card><BudgetMeter budget={150_000_000} reserved={18_400_000} paid={41_250_000} /></Card>
      </Section>

      <Section title="Claim code">
        <ClaimCodeBox code="CR-3FA9B21C7D02E4A1" />
      </Section>

      <Section title="Stepper">
        <Stepper steps={["Source", "Rates", "Fraud rules", "Fund"]} current={1} />
      </Section>

      <Section title="Receipts">
        <Card>
          <ul>
            {receipts.map((r) => (
              <ReceiptRow key={r.id} receipt={r} now={NOW} />
            ))}
          </ul>
        </Card>
      </Section>

      <Section title="Address, tx link, tooltip, modal">
        <div className="flex flex-wrap items-center gap-3">
          <AddressChip address="0x8a1f2c3d4e5f60718293a4b5c6d7e8f901234567" />
          <TxLink hash="0x9f2c41d0a8e7b3c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d" />
          <Tip content="Views on clips under the like floor earn nothing.">
            <button className="rounded-md border border-line px-3 py-2 text-sm">Hover me</button>
          </Tip>
          <Modal trigger={<Button variant="secondary">Open modal</Button>} title="Sign in to Cliprail" description="Use your face or fingerprint.">
            <Button className="w-full">Continue with passkey</Button>
          </Modal>
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState title="No clips yet. Be the first to post one and start earning." />
      </Section>
    </div>
    </>
  );
}
