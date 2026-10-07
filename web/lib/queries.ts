/** GraphQL documents against indexer/schema.graphql. Keep field lists in sync with the schema. */

export const CAMPAIGN_FIELDS = `
  id brand token budget reserved paid cpm maxPerClip maxViewsPerReport minLikeBps holdSecs
  startsAt endsAt minTier briefHash status clipsCount verifiedViews createdAt`;

export const CLIP_FIELDS = `
  id videoId status lastViews likes accrued released registeredAt
  campaign { id } clipper { id }`;

export const CLIPPER_FIELDS = `id paidViews earned clipsPaid rejections brands tier firstSeen`;

export const RECEIPT_FIELDS = `
  id round totalViews deltaViews likes amount unlockAt timestamp txHash
  clip { id released } campaign { id } clipper { id }`;

export const Q_CAMPAIGNS = `query { Campaign(order_by: { createdAt: desc }) { ${CAMPAIGN_FIELDS} } }`;
export const Q_CAMPAIGN = `query ($id: String!) { Campaign_by_pk(id: $id) { ${CAMPAIGN_FIELDS} } }`;
export const Q_CAMPAIGNS_BY_BRAND = `query ($brand: String!) { Campaign(where: { brand: { _eq: $brand } }, order_by: { createdAt: desc }) { ${CAMPAIGN_FIELDS} } }`;
export const Q_CLIPS_BY_CAMPAIGN = `query ($id: String!) { Clip(where: { campaign_id: { _eq: $id } }, order_by: { lastViews: desc }) { ${CLIP_FIELDS} } }`;
export const Q_CLIPS_BY_CLIPPER = `query ($c: String!) { Clip(where: { clipper_id: { _eq: $c } }, order_by: { registeredAt: desc }) { ${CLIP_FIELDS} } }`;
export const Q_RECEIPTS_BY_CLIPPER = `query ($c: String!) { Receipt(where: { clipper_id: { _eq: $c } }, order_by: { timestamp: desc }, limit: 100) { ${RECEIPT_FIELDS} } }`;
export const Q_CLIPPER = `query ($c: String!) { Clipper_by_pk(id: $c) { ${CLIPPER_FIELDS} } }`;
export const Q_LEADERBOARD = `query ($limit: Int!) { Clipper(order_by: { paidViews: desc }, limit: $limit) { ${CLIPPER_FIELDS} } }`;
export const Q_BRAND = `query ($b: String!) { Brand_by_pk(id: $b) { campaigns clipsEarning flags rejects returned } }`;
export const Q_TOTALS = `query { Totals_by_pk(id: "global") { campaigns clippers verifiedViews paid payouts } }`;
