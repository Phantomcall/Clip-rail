import { JudgeSandbox } from "@/components/judges/JudgeSandbox";
import { PageHeader } from "@/components/site/PageHeader";

const description =
  "Try both sides of Cliprail in five minutes on Monad testnet: a passkey account, sandbox funds and a campaign that pays out within minutes.";

export const metadata = {
  title: "Judge sandbox · Cliprail",
  description,
  openGraph: { title: "Try Cliprail in 5 minutes", description, images: ["/opengraph-image.png"] },
};

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
