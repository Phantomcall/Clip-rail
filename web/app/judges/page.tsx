import Image from "next/image";
import { PageHeader } from "@/components/site/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { CheckCircle } from "@/components/ui/Icons";

export const metadata = { title: "Judges · Cliprail" };

const STEPS = [
  { n: "01", title: "A brand flags a clip", body: "During the hold window, a brand can flag one clip it thinks broke the rules. The earnings still in hold freeze." },
  { n: "02", title: "A judge reviews the evidence", body: "Views and likes the oracle verified, the claim code, the publish date, the brand's reason. Nothing else." },
  { n: "03", title: "The call goes on the record", body: "Accept and the clip keeps earning. Reject and the frozen earnings return to the budget. Silence means accept." },
];

const EXAMPLES = [
  { area: "Music & culture", tone: "bg-[#ffcf9d] text-[#7a3b12]", note: "Live sets, artist clips, fan edits" },
  { area: "Gaming & edits", tone: "bg-[#c9c0ff] text-[#403080]", note: "Highlights, streams, montage cuts" },
  { area: "Beauty & lifestyle", tone: "bg-[#a9e8d0] text-[#075a3b]", note: "Tutorials, reviews, day-in-the-life" },
];

const RECORD = ["Decisions made", "Upheld vs overturned", "Median response time", "Campaigns judged"];

export default function JudgesPage() {
  return (
    <>
      <PageHeader eyebrow="Judges" title="Fair calls, on the record." width="max-w-5xl">
        When a brand disputes a clip, a judge makes the call, and every call they make builds a public track record.
      </PageHeader>

      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10">
        {/* how a dispute works */}
        <section className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="glass rounded-[var(--radius-card)] p-5">
              <span className="rounded-md bg-accent-soft px-2 py-1 font-mono text-[11px] text-accent dark:bg-accent/20 dark:text-[#c9bfff]">{s.n}</span>
              <h2 className="mt-3 text-lg font-semibold">{s.title}</h2>
              <p className="mt-1.5 text-sm text-muted">{s.body}</p>
            </div>
          ))}
        </section>

        {/* two sides of the market */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="glass overflow-hidden rounded-[2rem]">
            <div className="relative h-44">
              <Image src="/photos/creator-studio.webp" alt="" fill sizes="(min-width: 1024px) 30rem, 100vw" className="object-cover object-[50%_30%]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute bottom-4 left-5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink">For brands</span>
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-bold">Bring a judge, or pick one.</h2>
              <p className="mt-2 text-sm text-muted">
                Appoint someone you trust to settle disputes on your campaign, or choose a specialist from the network. Clippers see who judges a
                campaign before they join, which makes your campaign easier to say yes to.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <LinkButton href="/brand/new">Launch a campaign</LinkButton>
              </div>
            </div>
          </div>

          <div className="glass overflow-hidden rounded-[2rem]">
            <div className="relative h-44">
              <Image src="/photos/creator-ringlight.webp" alt="" fill sizes="(min-width: 1024px) 30rem, 100vw" className="object-cover object-[50%_40%]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute bottom-4 left-5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink">For judges</span>
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-bold">Know a niche? Judge it.</h2>
              <p className="mt-2 text-sm text-muted">
                Judges are independent reviewers who know what a real clip looks like in their area. Your record is public and portable: good calls
                get you appointed to more campaigns.
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-2 text-xs">
                {RECORD.map((r) => (
                  <li key={r} className="flex items-center gap-1.5">
                    <span className="text-money">
                      <CheckCircle className="size-3.5" />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-[var(--radius-control)] bg-accent-soft px-3 py-2 text-xs font-semibold text-accent dark:bg-accent/15 dark:text-[#c9bfff]">
                Judge applications open with appointed judging, coming in the next vault release.
              </p>
            </div>
          </div>
        </section>

        {/* what a profile will look like */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Example profiles</p>
              <h2 className="mt-2 text-2xl font-bold">Judges are picked by what they know.</h2>
            </div>
            <span className="text-xs text-muted">Examples of the areas judges will cover. Real profiles appear as judges join.</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {EXAMPLES.map((e) => (
              <div key={e.area} className="glass flex items-center gap-3 rounded-2xl p-4">
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-bold ${e.tone}`}>{e.area[0]}</span>
                <div className="min-w-0">
                  <p className="font-semibold">{e.area}</p>
                  <p className="truncate text-xs text-muted">{e.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* the rules that protect clippers */}
        <section className="glass rounded-[2rem] p-6 sm:p-8">
          <h2 className="text-xl font-bold">The rules every judge works within</h2>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            {[
              ["One flag per clip", "A brand can't flag the same clip twice, so a clip can't be frozen forever."],
              ["Only earnings still in hold", "Money that already cleared the hold is paid first and can never be taken back."],
              ["A deadline on every flag", "If nobody decides in time, the clip is accepted and keeps earning."],
              ["Public history", "Every flag and decision is on chain, and each brand's reject rate shows on its campaigns."],
            ].map(([t, b]) => (
              <div key={t}>
                <p className="font-semibold">{t}</p>
                <p className="mt-0.5 text-muted">{b}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
