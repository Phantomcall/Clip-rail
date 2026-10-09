# Project profile copy (P-9.2)

Paste into the Monad Metropolis portal. Everything below is true of what is deployed: **Monad testnet only**, no
mainnet claims. Fill the numbers in brackets from the live site on submission day (Oct 13), not before.

**Name:** Cliprail

**Tagline:** Get paid for every verified view.

**Track:** Track 03, Social, Attention & Culture

**Short description (1–2 sentences):**
Cliprail is a clipping marketplace on Monad: brands lock budgets in escrow, and clippers are paid per verified YouTube
Shorts view. A Chainlink CRE workflow verifies real views, the fraud rules run in the contract, and every payout builds
a reputation the clipper owns.

**Long description:**
Clipping, cutting long videos into short viral moments, is a fast-growing creator economy, and much of its workforce is
in Nigeria and India. It runs on trust that fails both sides: clippers wait weeks for payouts and see budgets run dry
after they post, and brands pay for bot views.

Cliprail moves the money flow on chain. A brand funds a campaign in a Monad escrow contract with a rate per 1,000 views,
a cap per clip, a like-ratio floor, a cap on sudden view spikes and a hold window. Clippers sign in with a passkey (Mera):
no wallet app, no seed phrase. They put a claim code in their Short's description and register it without paying gas;
our relayer submits their signed request.

A Chainlink CRE workflow reads view and like counts from YouTube, checks the claim code, visibility and publish date,
and writes the report on chain. On testnet it runs in Chainlink's CRE simulator and reports through Chainlink's
forwarder from a pinned oracle wallet; the same workflow moves to a decentralized oracle network once CRE deployment
access is approved. The vault applies every rule, reserves earnings at once and pays out after the
hold. Brands can flag a clip during the hold; rejected earnings return to the budget, and paid money can never be taken
back. Every paid view updates an on-chain reputation that only the escrow can write, which unlocks higher-tier
campaigns. Envio indexes it all for the app.

It is live on Monad testnet with [N] campaigns, [N] clips and [N] payouts so far, and judges can try both sides in five
minutes at /try: the sandbox funds a fresh account with test MON and test USDC.

**Built with:** Monad, Chainlink CRE, Mera passkeys, Envio HyperIndex, Next.js, Foundry, Cloudflare Workers.

**Links:**
- App: https://cliprail.vercel.app
- Judge sandbox: https://cliprail.vercel.app/try
- Repo: https://github.com/Phantomcall/Clip-rail
- Demo video: [YouTube link, P-9.1]
- Contracts (testnet): vault `0x6D7A51c58EB07Ab7bb1B0468A9be02fE9001BcAf`, reputation `0x5c38812Ec071dEcd89aB2c433f3ddB94E1731913`, lens `0x6f8d90BD1D58c592876391Db01db780b69A64938`
- Live campaign: [link to /campaigns/<id>]

**Screenshots (5), desktop 1440 px, night theme:**
1. Landing hero with live totals (`/`)
2. Campaign page with rules and budget meter (`/campaigns/<live id>`)
3. Clip registration with the three green checks (`/clip/new?c=<id>`)
4. Clipper earnings: Verified, Holding, Paid (`/me`)
5. Brand console with a flagged clip (`/brand`)
