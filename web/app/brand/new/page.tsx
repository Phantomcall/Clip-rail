import { RequireAuthClient } from "@/components/auth/RequireAuthClient";
import { CampaignWizard } from "@/components/brand/CampaignWizard";
import { PageHeader } from "@/components/site/PageHeader";

export const metadata = { title: "Launch a campaign · Cliprail" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const demo = (await searchParams).demo === "1";
  return (
    <>
    <PageHeader title={demo ? "Launch a test campaign" : "Launch a campaign"} width="max-w-3xl">
      {demo ? "Prefilled for the sandbox: 100 test USDC and a 5-minute hold. Change anything you like." : "Lock a budget, set your rules, and pay only for views that are verified."}
    </PageHeader>
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div>
        <RequireAuthClient title="Sign in to launch a campaign">
          <CampaignWizard demo={demo} />
        </RequireAuthClient>
      </div>
    </div>
    </>
  );
}
