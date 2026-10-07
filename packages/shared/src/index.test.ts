import { test } from "node:test";
import assert from "node:assert/strict";
import { claimCode, descriptionHasCode, parseVideoId } from "./index.ts";

test("parseVideoId handles every link shape", () => {
  const id = "Ab3dEf6hIj9";
  for (const s of [
    id,
    `https://youtube.com/shorts/${id}`,
    `https://www.youtube.com/shorts/${id}?feature=share`,
    `youtube.com/shorts/${id}`,
    `https://youtu.be/${id}`,
    `https://m.youtube.com/watch?v=${id}&t=3`,
    `https://www.youtube.com/embed/${id}`,
  ]) {
    assert.equal(parseVideoId(s), id, s);
  }
});

test("parseVideoId rejects junk", () => {
  for (const s of ["", "hello", "https://vimeo.com/123", "https://youtube.com/shorts/tooShort", "https://youtube.com/watch?v=bad!id12345"]) {
    assert.equal(parseVideoId(s), null, s);
  }
});

test("claimCode format and determinism", () => {
  const a = claimCode(1n, "0x4f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6");
  assert.match(a, /^CR-[0-9A-F]{16}$/);
  assert.equal(a, claimCode(1, "0x4f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6"));
  assert.notEqual(a, claimCode(2n, "0x4f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6"));
});

test("claimCode matches CampaignVaultLens.claimCode() (vector pinned in contracts/test/CampaignVault.t.sol)", () => {
  assert.equal(claimCode(1n, "0x000000000000000000000000000000000000dEaD"), "CR-09DAD21282658239");
  assert.equal(claimCode(1n, "0x1111111111111111111111111111111111111111"), "CR-F3A32C19D9D554E9");
  assert.equal(claimCode(42n, "0x000000000000000000000000000000000000dEaD"), "CR-BD9D77C0603F18F8");
});

test("descriptionHasCode is case-insensitive", () => {
  assert.ok(descriptionHasCode("great clip! cr-3fa9b21c7d02e4a1 #shorts", "CR-3FA9B21C7D02E4A1"));
  assert.ok(!descriptionHasCode("no code here", "CR-3FA9B21C7D02E4A1"));
});
