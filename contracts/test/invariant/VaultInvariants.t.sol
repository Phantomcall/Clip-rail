// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CampaignVault} from "../../src/CampaignVault.sol";
import {CampaignVaultLens} from "../../src/CampaignVaultLens.sol";
import {CreatorReputation} from "../../src/CreatorReputation.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {ICampaignVault} from "../../src/interfaces/ICampaignVault.sol";
import {ICreatorReputation} from "../../src/interfaces/ICreatorReputation.sol";

/// Exposes internal bookkeeping so the invariants can check it.
contract VaultHarness is CampaignVault {
    constructor(address f, ICreatorReputation r) CampaignVault(f, r, 1800, 1800) {}

    function pendingCountOf(uint256 campaignId, address clipper) external view returns (uint8) {
        return _pendingCount[campaignId][clipper];
    }

    function inList(KeeperList list, uint256 clipId) external view returns (bool) {
        mapping(uint256 => uint256) storage index =
            list == KeeperList.Watch ? _watchIndex : list == KeeperList.Pay ? _payIndex : _flagIndex;
        return index[clipId] != 0;
    }

    function trancheHead(uint256 clipId) external view returns (uint256) {
        return _trancheHead[clipId];
    }
}

/// Drives the vault with random but well-formed actions, including ones that are expected to revert.
contract Handler is Test {
    VaultHarness public vault;
    CampaignVaultLens public lens;
    MockUSDC public usdc;
    address public forwarder;
    address public oracle;
    address public owner;

    address[4] public clippers;
    uint256[2] public campaigns;
    uint64 public maxRoundSeen;
    bool public flaggedClipWasPaid; // ghost: must stay false
    uint256 public closes;

    constructor(VaultHarness v, MockUSDC u, address f, address o, address own, uint256[2] memory ids) {
        vault = v;
        lens = new CampaignVaultLens(v);
        usdc = u;
        forwarder = f;
        oracle = o;
        owner = own;
        campaigns = ids;
        for (uint256 i; i < 4; ++i) {
            clippers[i] = address(uint160(0xC000 + i));
        }
    }

    /// 12 video ids shared by everyone, so duplicate and squatting paths get exercised.
    function _video(uint256 seed) internal pure returns (string memory) {
        bytes memory b = bytes("vid00000000");
        b[10] = bytes1(uint8(97 + seed % 12));
        return string(b);
    }

    function register(uint256 clipperSeed, uint256 campaignSeed, uint256 videoSeed) external {
        vm.prank(clippers[clipperSeed % 4]);
        try vault.registerClip(campaigns[campaignSeed % 2], _video(videoSeed)) {} catch {}
    }

    function report(uint256 n, uint256 seed) external {
        uint256 count = vault.clipCount();
        n = bound(n, 1, 4);
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](n);
        for (uint256 i; i < n; ++i) {
            uint256 s = uint256(keccak256(abi.encode(seed, i)));
            uint256 clipId = count == 0 ? 1 : (s % (count + 1)) + (s % 7 == 0 ? 100 : 0); // sometimes unknown
            ICampaignVault.Clip memory c = vault.getClip(clipId);
            uint64 views = c.lastViews + uint64((s >> 8) % 30_000); // usually grows, sometimes not
            if ((s >> 40) % 5 == 0 && views > 500) views -= 500; // sometimes falls
            uint64 likes = uint64(uint256(views) * ((s >> 64) % 300) / 10_000); // 0–3% like ratio
            uint8 flags = uint8((s >> 96) % 4); // 0..3: ownership and/or unavailable
            uint64 published = (s >> 104) % 9 == 0 ? 1 : uint64(block.timestamp); // sometimes before startsAt
            us[i] = ICampaignVault.ClipUpdate(clipId, views, likes, published, flags);
        }
        uint64 round = vault.lastRound() + 1;
        vm.prank(forwarder, oracle);
        vault.onReport("", abi.encode(round, us));
        if (round > maxRoundSeen) maxRoundSeen = round;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 6 hours)); // long enough for 24 h holds to mature in a run
    }

    function _clip(uint256 seed) internal view returns (uint256) {
        uint256 count = vault.clipCount();
        return count == 0 ? 0 : seed % count + 1;
    }

    function _fromList(ICampaignVault.KeeperList list, uint256 seed) internal view returns (uint256) {
        uint256[] memory ids = vault.keeperList(list, 0, type(uint256).max);
        return ids.length == 0 ? _clip(seed) : ids[seed % ids.length];
    }

    function release(uint256 seed, uint256 n) external {
        uint256 count = vault.clipCount();
        if (count == 0) return;
        n = bound(n, 1, 5);
        uint256[] memory ids = new uint256[](n);
        uint128[] memory before = new uint128[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = uint256(keccak256(abi.encode(seed, i))) % count + 1;
            before[i] = vault.getClip(ids[i]).released;
        }
        vault.release(ids);
        for (uint256 i; i < n; ++i) {
            ICampaignVault.Clip memory c = vault.getClip(ids[i]);
            if (c.status == ICampaignVault.ClipStatus.Flagged && c.released != before[i]) flaggedClipWasPaid = true;
        }
    }

    /// Picks from the pay list (clips with unreleased earnings), since only those can be flagged.
    function flag(uint256 seed) external {
        uint256 id = _fromList(ICampaignVault.KeeperList.Pay, seed);
        if (id == 0) return;
        vm.prank(owner); // the test contract created both campaigns, so it is the brand
        try vault.flag(id, bytes32(seed)) {} catch {}
    }

    /// Picks from the flag list, and stays inside the flag window most of the time (the deadline is tested too).
    function resolve(uint256 seed, bool reject) external {
        uint256 id = _fromList(ICampaignVault.KeeperList.Flag, seed);
        if (id == 0) return;
        vm.prank(owner);
        try vault.resolve(id, reject) {} catch {}
    }

    function autoResolve(uint256 seed) external {
        uint256 id = _clip(seed);
        if (id == 0) return;
        try vault.autoResolve(id) {} catch {}
    }

    function close(uint256 seed) external {
        if (seed % 40 != 0) return; // rare, so campaigns stay open most of a run
        vm.prank(owner);
        try vault.closeCampaign(campaigns[seed % 2]) {
            closes++;
        } catch {}
    }

    function sweep() external {
        vault.sweep(lens.sweepableClips(0, 50));
    }

    function expire(uint256 clipSeed) external {
        uint256 count = vault.clipCount();
        if (count == 0) return;
        try vault.expirePending(clipSeed % count + 1) {} catch {}
    }

    function topUp(uint256 campaignSeed, uint256 amount) external {
        amount = bound(amount, 1, 5e6); // small, so the $50 campaign still runs out of budget
        usdc.mint(address(this), amount);
        usdc.approve(address(vault), amount);
        try vault.topUp(campaigns[campaignSeed % 2], uint128(amount)) {} catch {}
    }

    function togglePause() external {
        bool next = !vault.paused(); // read first: vm.prank applies to the very next call
        vm.prank(owner);
        vault.setPaused(next);
    }
}

/// forge-config: default.invariant.fail-on-revert = true
contract VaultInvariantsTest is Test {
    VaultHarness vault;
    MockUSDC usdc;
    Handler handler;
    address constant FORWARDER = address(0xF0);
    address constant ORACLE = address(0x0AC1E);

    function setUp() public {
        vm.warp(1_000_000);
        CreatorReputation reputation = new CreatorReputation();
        vault = new VaultHarness(FORWARDER, reputation);
        reputation.addVault(address(vault));
        usdc = new MockUSDC();
        vault.setTokenAllowed(address(usdc), true);
        vault.setReportTransmitter(ORACLE);

        uint256[2] memory ids;
        for (uint256 i; i < 2; ++i) {
            ICampaignVault.CampaignParams memory p = ICampaignVault.CampaignParams({
                token: address(usdc),
                budget: i == 0 ? 50e6 : 9_000e6, // one small budget that runs out, one large
                cpm: 1e6,
                maxPerClip: i == 0 ? 20e6 : 100e6,
                maxViewsPerReport: 20_000,
                minLikeBps: 50,
                holdSecs: 86_400,
                startsAt: uint64(block.timestamp),
                endsAt: uint64(block.timestamp + 30 days),
                minTier: 0,
                briefHash: 0
            });
            usdc.mint(address(this), p.budget);
            usdc.approve(address(vault), p.budget);
            ids[i] = vault.createCampaign(p);
        }

        handler = new Handler(vault, usdc, FORWARDER, ORACLE, address(this), ids);
        targetContract(address(handler));
    }

    /// reserved + paid ≤ budget, and Σ accrued of a campaign's clips = reserved + paid (holds through releases,
    /// rejects and closes: a reject lowers both accrued and reserved).
    function invariant_campaignAccounting() public view {
        uint256[3] memory accrued;
        for (uint256 id = 1; id <= vault.clipCount(); ++id) {
            ICampaignVault.Clip memory c = vault.getClip(id);
            accrued[c.campaignId] += c.accrued;
        }
        for (uint256 cid = 1; cid <= 2; ++cid) {
            ICampaignVault.Campaign memory k = vault.getCampaign(cid);
            assertLe(uint256(k.reserved) + k.paid, k.params.budget, "reserved + paid > budget");
            assertEq(accrued[cid], uint256(k.reserved) + k.paid, "sum accrued != reserved + paid");
        }
    }

    /// The vault holds exactly every campaign's unpaid budget: no shortfall, and no stuck tokens.
    function invariant_solvent() public view {
        uint256 owed;
        for (uint256 cid = 1; cid <= 2; ++cid) {
            ICampaignVault.Campaign memory k = vault.getCampaign(cid);
            owed += k.params.budget - k.paid;
        }
        assertEq(usdc.balanceOf(address(vault)), owed, "vault balance != unpaid budgets");
    }

    /// Every token a clipper holds came from a release, and every release reached a clipper.
    function invariant_payoutsReachClippers() public view {
        uint256 released;
        for (uint256 id = 1; id <= vault.clipCount(); ++id) {
            released += vault.getClip(id).released;
        }
        uint256 held;
        for (uint256 k; k < 4; ++k) {
            held += usdc.balanceOf(handler.clippers(k));
        }
        assertEq(held, released, "clipper balances != sum released");
    }

    /// A flagged clip is never paid (ghost set by the handler around every release).
    function invariant_flaggedNeverPaid() public view {
        assertFalse(handler.flaggedClipWasPaid(), "flagged clip was paid");
    }

    /// The pay list holds exactly the clips with unreleased tranches; the flag list exactly the Flagged clips.
    function invariant_keeperLists() public view {
        uint256 paying;
        uint256 flagged;
        for (uint256 id = 1; id <= vault.clipCount(); ++id) {
            ICampaignVault.Clip memory c = vault.getClip(id);
            bool owed =
                c.status != ICampaignVault.ClipStatus.Rejected && vault.trancheHead(id) < vault.getTranches(id).length;
            assertEq(vault.inList(ICampaignVault.KeeperList.Pay, id), owed, "pay list out of sync");
            if (owed) paying++;
            bool isFlagged = c.status == ICampaignVault.ClipStatus.Flagged;
            assertEq(vault.inList(ICampaignVault.KeeperList.Flag, id), isFlagged, "flag list out of sync");
            if (isFlagged) flagged++;
        }
        assertEq(
            vault.keeperList(ICampaignVault.KeeperList.Pay, 0, type(uint256).max).length, paying, "pay list length"
        );
        assertEq(
            vault.keeperList(ICampaignVault.KeeperList.Flag, 0, type(uint256).max).length, flagged, "flag list length"
        );
    }

    /// A clip never earns past maxPerClip; tranches sum to accrued; Pending/Rejected/Ended-before-activation earn 0.
    function invariant_clipCaps() public view {
        for (uint256 id = 1; id <= vault.clipCount(); ++id) {
            ICampaignVault.Clip memory c = vault.getClip(id);
            ICampaignVault.Campaign memory k = vault.getCampaign(c.campaignId);
            assertLe(c.accrued, k.params.maxPerClip, "accrued > maxPerClip");
            assertLe(c.released, c.accrued, "released > accrued");
            ICampaignVault.Tranche[] memory t = vault.getTranches(id);
            uint256 sum;
            uint256 paidPart;
            for (uint256 i; i < t.length; ++i) {
                sum += t[i].amount;
                if (i < vault.trancheHead(id)) paidPart += t[i].amount;
            }
            if (c.status == ICampaignVault.ClipStatus.Rejected) {
                assertEq(c.accrued, c.released, "rejected clip kept unreleased earnings");
            } else {
                assertEq(sum, c.accrued, "tranches != accrued");
                assertEq(paidPart, c.released, "released != tranches before head");
            }
            if (c.status == ICampaignVault.ClipStatus.Pending) assertEq(c.accrued, 0, "pending clip earned");
        }
    }

    /// Each video is owned by at most one clip, that clip really has the video and has activated.
    function invariant_videoOwnership() public view {
        for (uint256 id = 1; id <= vault.clipCount(); ++id) {
            ICampaignVault.Clip memory c = vault.getClip(id);
            uint256 owner = vault.clipIdByVideo(keccak256(bytes(c.videoId)));
            if (owner == id) {
                assertTrue(c.status != ICampaignVault.ClipStatus.Pending, "owner never activated");
            } else if (owner != 0) {
                assertTrue(c.accrued == 0, "a non-owner of a video earned");
            }
        }
    }

    /// The pending counter equals the real number of Pending clips per (campaign, clipper).
    function invariant_pendingCounts() public view {
        for (uint256 cid = 1; cid <= 2; ++cid) {
            for (uint256 k; k < 4; ++k) {
                address clipper = handler.clippers(k);
                uint256 real;
                for (uint256 id = 1; id <= vault.clipCount(); ++id) {
                    ICampaignVault.Clip memory c = vault.getClip(id);
                    if (c.campaignId == cid && c.clipper == clipper && c.status == ICampaignVault.ClipStatus.Pending) {
                        real++;
                    }
                }
                assertEq(vault.pendingCountOf(cid, clipper), real, "pending counter drift");
                assertLe(real, vault.MAX_PENDING_PER_CLIPPER(), "pending cap exceeded");
            }
        }
    }

    /// Every Pending clip is watched; every watched clip is Pending, Active or Flagged and below its cap.
    function invariant_watchList() public view {
        uint256[] memory watched = vault.keeperList(ICampaignVault.KeeperList.Watch, 0, type(uint256).max);
        for (uint256 i; i < watched.length; ++i) {
            ICampaignVault.Clip memory c = vault.getClip(watched[i]);
            assertTrue(
                c.status == ICampaignVault.ClipStatus.Pending || c.status == ICampaignVault.ClipStatus.Active
                    || c.status == ICampaignVault.ClipStatus.Flagged,
                "watched clip not Pending/Active/Flagged"
            );
            assertLt(c.accrued, vault.getCampaign(c.campaignId).params.maxPerClip, "maxed clip still watched");
        }
        for (uint256 id = 1; id <= vault.clipCount(); ++id) {
            if (vault.getClip(id).status == ICampaignVault.ClipStatus.Pending) {
                assertTrue(vault.inList(ICampaignVault.KeeperList.Watch, id), "pending clip not watched");
            }
        }
    }

    /// lastRound only moves forward and never jumps past what the oracle sent.
    function invariant_round() public view {
        assertEq(vault.lastRound(), handler.maxRoundSeen(), "round moved unexpectedly");
    }
}
