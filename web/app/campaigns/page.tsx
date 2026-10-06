import { PageHeader } from "@/components/site/PageHeader";
import { CampaignCard } from "@/components/site/CampaignCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCampaigns, now } from "@/lib/data";

export const metadata = { title: "Campaigns · Cliprail" };

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();
  const NOW = now();
  const active = campaigns.filter((c) => c.status === "Active");
  const closed = campaigns.filter((c) => c.status === "Closed");
  return (
    <>
    <PageHeader title="Campaigns">Every budget below is already locked in escrow. Pick one, clip it, get paid per verified view.</PageHeader>
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Open now</h2>
      {active.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((c) => (
            <CampaignCard key={c.id} campaign={c} now={NOW} />
          ))}
        </div>
      ) : (
        <div className="mt-4"><EmptyState title="No open campaigns right now. Check back soon." /></div>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mt-12 text-sm font-semibold uppercase tracking-wide text-muted">Closed</h2>
          <div className="mt-4 grid gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((c) => (
              <CampaignCard key={c.id} campaign={c} now={NOW} />
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
}
