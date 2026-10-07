# Runbook: oracle key compromise

**When to use this:** the oracle's broadcasting wallet (`reportTransmitter`) may be in someone else's hands. Signs:
- reports at times our runner didn't run;
- `lastRound()` jumping by more than one per run;
- clips earning far faster than YouTube shows;
- clips you don't recognise activating.

**Why it matters (audit V1-10):** with the key, an attacker can report fake views for their own clips, one report per
transaction. The velocity cap limits each report, but across many clips they can reserve most campaign budgets within
minutes. Those earnings pay out when their hold ends. A pause stops new forgeries, **not** the ones already
reserved. Only a brand flag can stop those, and only while the earnings are still in hold. **Speed matters: the hold
window is all the time brands have.** That's 10 minutes on the testnet test campaign, and whatever each brand chose
(at most 7 days) on mainnet.

Set these for the commands below:
```bash
RPC=https://testnet-rpc.monad.xyz        # mainnet: https://rpc.monad.xyz
VAULT=$(jq -r '."10143".vault' packages/abi/addresses.json)   # mainnet: ."143".vault
```

## 1. Pause: guardian, immediately (minutes 0–5)
The guardian can pause without the timelock. A pause makes the vault skip every report, so no new forged
earnings can be booked. Payouts, flags, resolves and closes keep working.
```bash
# testnet: the guardian is the deployer (Deploy.s.sol default). Mainnet: the GUARDIAN wallet set at deploy.
cast send $VAULT "setPaused(bool)" true --rpc-url $RPC --account cliprail-deployer
cast call $VAULT "paused()(bool)" --rpc-url $RPC        # must print true
```
Note the block number: `cast block-number --rpc-url $RPC`. This is `PAUSE_BLOCK`.

## 2. Stop the oracle runner
Disable the scheduled workflow so it doesn't keep spending gas on reports the vault skips:
GitHub → Actions → `oracle-runner` → **Disable workflow**.

## 3. Find what was forged
Pick `FROM_BLOCK`, the last block you trust: the last report you know our runner sent, or the leak time if known.
List every booking between then and the pause:
```bash
cast logs --rpc-url $RPC --address $VAULT --from-block $FROM_BLOCK --to-block $PAUSE_BLOCK \
  "ViewsVerified(uint256 indexed clipId, uint256 indexed campaignId, address indexed clipper, uint64 round, uint64 totalViews, uint64 deltaViews, uint64 likes, uint128 amount, uint64 unlockAt)"
```
The indexer has the same data (`Receipt` entities). Group the results by campaign. For each campaign, list the
`clipId`s, the amounts, and the earliest `unlockAt`: **that's each brand's deadline**.

To tell real views from forged ones, compare each clip's `totalViews` with the live YouTube count
(`/yt/preview`). New clips that activated during the window are the most suspect.

## 4. Brands flag the forged clips (before `unlockAt`)
Message each affected brand with its clip list and deadline. In the brand console, **Flag** each forged clip, then
**Reject** it within the flag window. Or with cast:
```bash
cast send $VAULT "flag(uint256,bytes32)" $CLIP $(cast keccak "oracle key compromise") --rpc-url $RPC --account <brand>
cast send $VAULT "resolve(uint256,bool)" $CLIP true --rpc-url $RPC --account <brand>
```
Rules that limit what a brand can do (by design):
- a flag only works while some of the clip's earnings are still in hold, and it first pays out the part that has
  matured;
- one flag per clip, ever, so flag only clips you're sure about;
- reject before the flag deadline, or the flag is accepted automatically.

A forged clip whose hold has already ended can no longer be stopped. Record it for the post-mortem.

## 5. Rotate the oracle wallet (owner)
Create a new wallet for the oracle, then point the vault at it:
```bash
cast send $VAULT "setReportTransmitter(address)" $NEW_ORACLE --rpc-url $RPC --account cliprail-deployer
```
- **Testnet:** the deployer is the owner, so this applies at once.
- **Mainnet:** the owner is the 24 h timelock. The multisig proposes `setReportTransmitter(NEW_ORACLE)`; anyone
  executes it after 24 h. The vault stays paused meanwhile, which is safe: payouts, flags and closes still work.

Update the `CRE_ETH_PRIVATE_KEY` secret to the new wallet. Never reuse the old one.

## 6. Unpause (owner) and restart
```bash
cast send $VAULT "setPaused(bool)" false --rpc-url $RPC --account cliprail-deployer   # mainnet: via the timelock
```
Re-enable the `oracle-runner` workflow. Check that the next run moves `lastRound()` up by exactly one:
```bash
cast call $VAULT "lastRound()(uint64)" --rpc-url $RPC
```

## 7. Afterwards
- Post-mortem: how the key leaked, the window, what was forged, what was flagged in time and what was paid out.
- Tell clippers whose real clips were paused: their views resume being counted from the next report; views during
  the pause are paid then, up to the velocity cap per report.

## Who does what
| Step | Who | Needs |
|---|---|---|
| 1 Pause | Guardian (or owner) | Guardian wallet |
| 2 Stop runner | Anyone with repo admin | GitHub |
| 3 List | Isaac / David | RPC or indexer |
| 4 Flag | Each brand | Brand wallet / console |
| 5 Rotate | Owner (mainnet: multisig + 24 h) | Deployer / multisig |
| 6 Unpause | Owner (mainnet: timelock) | Deployer / multisig |
