import { JudgeSandbox } from "@/components/judges/JudgeSandbox";
import { PageHeader } from "@/components/site/PageHeader";

export const metadata = { title: "Try Cliprail · Cliprail" };

export default function JudgesPage() {
  return (
    <>
    <PageHeader eyebrow="For hackathon judges" title="Try Cliprail in under 5 minutes" width="max-w-3xl">
      Works best on an iPhone (Safari) or Chrome with Google Password Manager. No wallet or gas needed.
    </PageHeader>
    <div className="mx-auto max-w-3xl px-4 py-10">
      <JudgeSandbox />
    </div>
    </>
  );
}
