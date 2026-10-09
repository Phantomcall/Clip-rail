# Demo video (P-7.3, P-8.4): storyboard, shot list, voiceover

3:00 maximum, 16:9, captions on, uploaded to YouTube unlisted (P-9.1). Everything runs on **Monad testnet**: say so once,
plainly, and never imply mainnet or real money.

## Rules for recording
- Record every scene from data that is **already on chain**. Never wait on a live oracle round or a slow transaction on
  camera: do the action earlier, then record the result (or cut the wait).
- Phone scenes: iPhone screen recording, portrait, then placed in a 16:9 frame (phone on the left, a caption or the
  matching MonadVision page on the right).
- Desktop scenes: Chrome at 1440×900, 125% zoom, night theme (`?sky=night`), no bookmarks bar, notifications off.
- Keep two takes of every scene. Name files `S1-take1.mov` etc.
- No music with lyrics (copyright claims on YouTube). Voiceover recorded separately, in a quiet room, phone close to
  the mouth.

## What must exist on chain before recording (check on Oct 11)
| Needed for | What | Who |
|---|---|---|
| S2 | A campaign funded from your phone (the live campaign, P-4.2) | Patrick |
| S3 | A clipper account with a clip that went Pending → Active → paid, with at least two receipts | a recruited clipper, or Patrick with a second phone |
| S4 | One clip earning nothing because of the like floor, and one clip flagged and resolved | Patrick (brand console) |
| S5 | `/try` sandbox funding working (Isaac's `/sandbox/fund`) | done |
| S5 | `NEXT_PUBLIC_ENVIO_GRAPHQL_URL` set in Vercel, so the landing totals and leaderboard are live | David |
| all | Briefs stored (`/briefs` route), so campaigns show a brand name and title instead of an address | Isaac |

## Storyboard
| Time | Scene | On screen | Voiceover |
|---|---|---|---|
| 0:00–0:15 | **S1 Hook** | Fast cuts of real Shorts from the live campaign (phone frames), then the landing hero "Get paid for every verified view." | "Clippers cut the moments that go viral. Then they wait weeks to get paid, and brands pay for views that were never real." |
| 0:15–0:40 | **S2 Brand funds** | Phone: `/brand/new` review step → Face ID → "Your campaign is live" → the funding transaction on MonadVision | "On Cliprail, a brand locks its budget in an escrow contract on Monad first. One Face ID tap, no wallet app. The money exists before anyone posts." |
| 0:40–1:30 | **S3 Clipper earns** | Phone: campaign page → Get my claim code (passkey sign-up) → claim code → paste the Short link → three green checks → Register (no gas) → `/me`: Pending → Active → Verified, Holding, Paid → a receipt opening on MonadVision | "A clipper signs up with a passkey, puts their claim code in the Short's description and registers it for free; we pay the gas. A Chainlink CRE workflow reads real views and likes from YouTube and reports them on chain, and the vault reserves earnings per verified view. After the hold window, the payout is automatic, and every step is a transaction you can open." |
| 1:30–2:05 | **S4 Bots earn nothing** | Desktop: landing "Bots earn nothing" walkthrough (Bought views → like floor fails), then the brand console: a clip "below like floor" earning $0, a flag with a reason, Reject → money back to the budget | "The rules run in the contract, not on our server: a like-ratio floor, a cap on sudden spikes, a cap per clip. If a brand still disputes a clip, it can flag it during the hold. Rejected earnings go back to the brand, and money already paid can never be taken back." |
| 2:05–2:35 | **S5 Try it yourself** | Desktop: `/judges` banner → `/try` → Fund my sandbox → toast with the transaction → "Launch a test campaign" prefilled with a 5-minute hold | "Judges can try both sides in five minutes. The sandbox funds a fresh account with test MON and test USDC, and a prefilled campaign pays out within minutes." |
| 2:35–3:00 | **S6 Proof and what's next** | Landing live totals → leaderboard → a clipper's `/u/` profile with receipts → end card: app URL, repo, "Built on Monad testnet" | "Every number here comes from the chain, indexed by Envio, and a clipper's record is theirs to keep. Next: more platforms, a mainnet launch with real budgets, and payouts straight to local currency." |

About 235 words of voiceover: about 1:50 of speech at a calm 130 words a minute, which leaves room to let the screens
play between lines. If the cut runs past 3:00, shorten S5 to its last sentence.

## Voiceover script (read straight through)
> Clippers cut the moments that go viral. Then they wait weeks to get paid, and brands pay for views that were never real.
>
> On Cliprail, a brand locks its budget in an escrow contract on Monad first. One Face ID tap, no wallet app. The money
> exists before anyone posts.
>
> A clipper signs up with a passkey, puts their claim code in the Short's description and registers it for free; we pay
> the gas. A Chainlink CRE workflow reads real views and likes from YouTube and reports them on chain, and the vault
> reserves earnings per verified view. After the hold window, the payout is automatic, and every step is a transaction
> you can open.
>
> The rules run in the contract, not on our server: a like-ratio floor, a cap on sudden spikes, a cap per clip. If a
> brand still disputes a clip, it can flag it during the hold. Rejected earnings go back to the brand, and money already
> paid can never be taken back.
>
> Judges can try both sides in five minutes. The sandbox funds a fresh account with test MON and test USDC, and a
> prefilled campaign pays out within minutes.
>
> Every number here comes from the chain, indexed by Envio, and a clipper's record is theirs to keep. Cliprail runs on
> Monad testnet today. Next: more platforms, a mainnet launch with real budgets, and payouts straight to local currency.

## Shot list
| # | Shot | Device | Where | Notes |
|---|---|---|---|---|
| 1 | 4–6 real Shorts from the campaign, 2 s each | phone | YouTube | Ask the clippers first; blur faces of anyone who says no |
| 2 | Landing hero, slow scroll to "Bots earn nothing" | desktop | `/?sky=night` | One smooth scroll, no mouse jitter |
| 3 | Campaign wizard review step → Face ID → success | iPhone | `/brand/new` | Record the real funding of the live campaign, or a second small one |
| 4 | Funding transaction | desktop | MonadVision (testnet) | Zoom on "Success" and the USDC transfer |
| 5 | Claim code → paste link → green checks → Register | iPhone | `/clip/new?c=<id>` | Use a Short that is already public with the code |
| 6 | `/me` with Pending, Active, then paid | iPhone | `/me` | Record at three moments, or cut between accounts in each state |
| 7 | A receipt opening on MonadVision | iPhone | `/me` → receipt | |
| 8 | Fairness walkthrough: Real audience, then Bought views | desktop | landing | Click slowly so each rule's check is visible |
| 9 | Brand console: below-floor clip, Flag dialog, Reject | desktop | `/brand` | Needs S4's on-chain state |
| 10 | Judges banner → `/try` → Fund → toast | desktop | `/judges`, `/try` | A fresh passkey account (new Chrome profile) |
| 11 | Leaderboard and a clipper profile | desktop | `/leaderboard`, `/u/<address>` | After David sets the indexer URL in Vercel |
| 12 | End card | editor | | App URL, repo URL, "Built on Monad testnet · Track 03" |

B-roll, if there's time: a passkey prompt on an iPhone, someone editing a Short in CapCut, the WhatsApp clipper group
(with permission).
