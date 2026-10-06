// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CampaignVaultLens} from "../src/CampaignVaultLens.sol";
import {CreatorReputation} from "../src/CreatorReputation.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ICampaignVault} from "../src/interfaces/ICampaignVault.sol";
import {ICreatorReputation} from "../src/interfaces/ICreatorReputation.sol";

/// USDC-like token with a blacklist: transfers to or from a blocked address revert.
contract BlacklistUSDC is MockUSDC {
    mapping(address => bool) public blocked;

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[from] && !blocked[to], "blacklisted");
        super._update(from, to, value);
    }
}

/// v1: release, flag/resolve/autoResolve, close, sweep, reputation tiers (PRD F5–F8, audit R-1 … R-6).
contract VaultV1Test is Test {
    address constant FORWARDER = address(0xF0);
    address constant ORACLE = address(0x0AC1E);
    uint64 constant T0 = 1_000_000;
    uint32 constant HOLD = 86_400;

    CreatorReputation reputation;
    CampaignVault vault;
    CampaignVaultLens lens;
    BlacklistUSDC usdc;

    address brand = makeAddr("brand");
    address clipper = makeAddr("clipper");
    address clipper2 = makeAddr("clipper2");
    uint64 round;

    function setUp() public {
        vm.warp(T0);
        reputation = new CreatorReputation();
        vault = new CampaignVault(FORWARDER, reputation, 1800, 1800);
        lens = new CampaignVaultLens(vault);
        reputation.addVault(address(vault));
        usdc = new BlacklistUSDC();
        vault.setTokenAllowed(address(usdc), true);
        vault.setReportTransmitter(ORACLE);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _params() internal view returns (ICampaignVault.CampaignParams memory) {
        return ICampaignVault.CampaignParams({
            token: address(usdc),
            budget: 150e6,
            cpm: 1e6,
            maxPerClip: 20e6,
            maxViewsPerReport: 20_000,
            minLikeBps: 50,
            holdSecs: HOLD,
            startsAt: T0,
            endsAt: T0 + 30 days,
            minTier: 0,
            briefHash: 0
        });
    }

    function _create(ICampaignVault.CampaignParams memory p) internal returns (uint256 id) {
        usdc.mint(brand, p.budget);
        vm.startPrank(brand);
        usdc.approve(address(vault), p.budget);
        id = vault.createCampaign(p);
        vm.stopPrank();
    }

    function _report(uint256 clipId, uint64 views) internal {
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](1);
        us[0] = ICampaignVault.ClipUpdate(clipId, views, views / 10, T0 + 1, 1);
        vm.prank(FORWARDER, ORACLE);
        vault.onReport("", abi.encode(++round, us));
    }

    /// Registers and activates a clip, then reports `views` (one tranche).
    function _earning(uint256 id, address who, string memory videoId, uint64 views) internal returns (uint256 clipId) {
        vm.prank(who);
        clipId = vault.registerClip(id, videoId);
        _report(clipId, 0);
        if (views > 0) _report(clipId, views);
    }

    function _one(uint256 clipId) internal pure returns (uint256[] memory a) {
        a = new uint256[](1);
        a[0] = clipId;
    }

    // ─────────────────────────── keeper lists and lens ───────────────────────────

    function test_KeeperList_PagesAndNextUnlock() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 5_000);

        assertEq(vault.keeperList(ICampaignVault.KeeperList.Pay, 0, 10)[0], clip);
        assertEq(vault.keeperList(ICampaignVault.KeeperList.Pay, 1, 10).length, 0); // offset past the end
        assertEq(vault.keeperList(ICampaignVault.KeeperList.Pay, 0, type(uint256).max).length, 1); // no overflow
        assertEq(vault.keeperList(ICampaignVault.KeeperList.Flag, 0, 10).length, 0);
        assertEq(vault.nextUnlockAt(clip), T0 + HOLD);

        vm.warp(T0 + HOLD);
        vault.release(_one(clip));
        assertEq(vault.nextUnlockAt(clip), type(uint64).max); // nothing left to release
        assertEq(vault.nextUnlockAt(999), type(uint64).max); // unknown clip
        assertEq(address(lens.vault()), address(vault));
    }

    // ─────────────────────────── release (F5) ───────────────────────────

    function test_Release_PaysMaturedTranchesOnly() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 5_000); // tranche 1: $5, unlocks T0+HOLD
        vm.warp(T0 + 1000);
        _report(clip, 8_000); // tranche 2: $3, unlocks T0+1000+HOLD

        vault.release(_one(clip)); // nothing matured yet
        assertEq(usdc.balanceOf(clipper), 0);
        assertEq(lens.releasableClips(0, 10).length, 0);

        vm.warp(T0 + HOLD);
        assertEq(lens.releasableClips(0, 10).length, 1);
        vm.expectEmit(address(vault));
        emit ICampaignVault.Released(clip, clipper, 5e6);
        vault.release(_one(clip));
        assertEq(usdc.balanceOf(clipper), 5e6);

        ICampaignVault.Campaign memory c = vault.getCampaign(id);
        assertEq(c.reserved, 3e6);
        assertEq(c.paid, 5e6);
        assertEq(vault.getClip(clip).released, 5e6);

        vm.warp(T0 + 1000 + HOLD);
        vault.release(_one(clip));
        assertEq(usdc.balanceOf(clipper), 8e6);
        assertEq(lens.releasableClips(0, 10).length, 0); // fully paid: off the pay list
        vault.release(_one(clip)); // running twice is harmless
        assertEq(usdc.balanceOf(clipper), 8e6);
    }

    function test_Release_UpdatesReputation() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 6_000);
        vm.warp(T0 + HOLD);
        vault.release(_one(clip));
        ICreatorReputation.Stats memory s = reputation.stats(clipper);
        assertEq(s.paidViews, 6_000);
        assertEq(s.earned, 6e6);
        assertEq(s.clipsPaid, 1);
        assertEq(s.brands, 1);
        assertEq(s.firstSeen, T0 + HOLD);
        assertEq(reputation.tier(clipper), 1);
    }

    function test_Release_UsesPayoutAddress() public {
        uint256 pk = 0xC11;
        address signer = vm.addr(pk);
        address exchange = makeAddr("exchange");
        uint256 id = _create(_params());
        uint256 clip = _earning(id, signer, "aaaaaaaaaaa", 4_000);

        uint256 deadline = block.timestamp + 1 hours;
        bytes32 h = keccak256(abi.encode(vault.SET_PAYOUT_TYPEHASH(), signer, exchange, uint256(0), deadline));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", vault.domainSeparator(), h)));
        vault.setPayoutAddressWithSig(
            ICampaignVault.SetPayout(signer, exchange, 0, deadline), abi.encodePacked(r, s, v)
        );

        vm.warp(T0 + HOLD);
        vault.release(_one(clip));
        assertEq(usdc.balanceOf(exchange), 4e6);
        assertEq(usdc.balanceOf(signer), 0);
    }

    function test_Release_BlacklistedPayoutDoesNotBlockBatch() public {
        uint256 id = _create(_params());
        uint256 a = _earning(id, clipper, "aaaaaaaaaaa", 4_000);
        uint256 b = _earning(id, clipper2, "bbbbbbbbbbb", 6_000);
        usdc.setBlocked(clipper, true);
        vm.warp(T0 + HOLD);

        uint256[] memory both = new uint256[](2);
        both[0] = a;
        both[1] = b;
        vm.expectEmit(address(vault));
        emit ICampaignVault.ReleaseFailed(a, clipper, 4e6);
        vault.release(both);

        assertEq(usdc.balanceOf(clipper2), 6e6); // the rest of the batch is paid
        assertEq(vault.getClip(a).released, 0); // the failed clip is untouched
        assertEq(vault.getCampaign(id).reserved, 4e6);
        assertEq(lens.releasableClips(0, 10).length, 1); // and still listed

        usdc.setBlocked(clipper, false);
        vault.release(_one(a));
        assertEq(usdc.balanceOf(clipper), 4e6);
    }

    function test_Release_WorksWhilePaused() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 4_000);
        vault.setPaused(true);
        vm.warp(T0 + HOLD);
        vault.release(_one(clip));
        assertEq(usdc.balanceOf(clipper), 4e6);
    }

    // ─────────────────────────── flag / resolve / autoResolve (F6) ───────────────────────────

    function test_Flag_Rules() public {
        uint256 id = _create(_params());
        vm.prank(clipper);
        uint256 pending = vault.registerClip(id, "ppppppppppp");
        uint256 clip = _earning(id, clipper2, "aaaaaaaaaaa", 4_000);

        vm.expectRevert(ICampaignVault.NotBrand.selector);
        vault.flag(clip, "x"); // not the brand

        vm.startPrank(brand);
        vm.expectRevert(ICampaignVault.NotFlaggable.selector);
        vault.flag(pending, "x"); // nothing earned
        vm.expectEmit(address(vault));
        emit ICampaignVault.Flagged(clip, brand, keccak256("bot views"), uint64(T0 + 1800));
        vault.flag(clip, keccak256("bot views"));
        vm.stopPrank();

        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Flagged));
        assertEq(vault.activeClips(0, 10).length, 1); // only the pending clip; flagged clips aren't reported
    }

    function test_Flag_FreezesPayoutAndAccrual() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 4_000);
        vm.prank(brand);
        vault.flag(clip, "x");

        _report(clip, 9_000); // skipped while flagged
        assertEq(vault.getClip(clip).accrued, 4e6);
        vm.warp(T0 + HOLD);
        vault.release(_one(clip)); // never paid while flagged
        assertEq(usdc.balanceOf(clipper), 0);
        assertEq(lens.releasableClips(0, 10).length, 0);
    }

    function test_Flag_FullyReleasedClipCannotBeFlagged() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 4_000);
        vm.warp(T0 + HOLD);
        vault.release(_one(clip));
        vm.prank(brand);
        vm.expectRevert(ICampaignVault.NotFlaggable.selector);
        vault.flag(clip, "x");
    }

    function test_Resolve_RejectReturnsUnreleasedToBudget() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 5_000);
        vm.warp(T0 + HOLD);
        vault.release(_one(clip)); // $5 paid
        _report(clip, 12_000); // $7 more, unreleased

        vm.startPrank(brand);
        vault.flag(clip, "x");
        vm.expectEmit(address(vault));
        emit ICampaignVault.Resolved(clip, true, 7e6);
        vault.resolve(clip, true);
        vm.stopPrank();

        ICampaignVault.Clip memory c = vault.getClip(clip);
        assertEq(uint8(c.status), uint8(ICampaignVault.ClipStatus.Rejected));
        assertEq(c.accrued, 5e6); // only what was really paid (R-5)
        assertEq(vault.getCampaign(id).reserved, 0);
        assertEq(vault.getCampaign(id).paid, 5e6);
        assertEq(reputation.stats(clipper).rejections, 1);
        assertEq(reputation.tier(clipper), 0); // a rejection drops tier 1
        assertEq(vault.watchListLength(), 0);

        vm.prank(brand);
        vm.expectRevert(ICampaignVault.NotFlagged.selector);
        vault.resolve(clip, true); // no double resolve
    }

    function test_Resolve_AcceptResumesAndOneFlagPerClip() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 4_000);
        vm.startPrank(brand);
        vault.flag(clip, "x");
        vault.resolve(clip, false);
        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Active));
        vm.expectRevert(ICampaignVault.AlreadyFlagged.selector);
        vault.flag(clip, "again"); // R-3: no flag → accept → flag loop
        vm.stopPrank();

        vm.warp(T0 + HOLD);
        vault.release(_one(clip));
        assertEq(usdc.balanceOf(clipper), 4e6);
    }

    function test_AutoResolve_AcceptsAfterWindow() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 4_000);
        vm.prank(brand);
        vault.flag(clip, "x");

        vm.expectRevert(ICampaignVault.FlagNotExpired.selector);
        vault.autoResolve(clip);
        assertEq(lens.expiredFlags(0, 10).length, 0);

        vm.warp(T0 + 1800);
        assertEq(lens.expiredFlags(0, 10)[0], clip);
        vault.autoResolve(clip); // anyone
        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Active));
        assertEq(lens.expiredFlags(0, 10).length, 0);
    }

    function test_FlagEndedClipResolvesBackToEnded() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 4_000);
        for (uint256 i; i < 3; ++i) {
            ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](1);
            us[0] = ICampaignVault.ClipUpdate(clip, 0, 0, 0, 2);
            vm.prank(FORWARDER, ORACLE);
            vault.onReport("", abi.encode(++round, us));
        }
        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Ended));
        vm.startPrank(brand);
        vault.flag(clip, "x");
        vault.resolve(clip, false);
        vm.stopPrank();
        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Ended));
    }

    // ─────────────────────────── close and refund (F7) ───────────────────────────

    function test_Close_RefundsExactlyAndReservedStillReleases() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 7_000); // $7 reserved

        vm.expectEmit(address(vault));
        emit ICampaignVault.CampaignClosed(id, 143e6);
        vm.prank(brand);
        vault.closeCampaign(id);
        assertEq(usdc.balanceOf(brand), 143e6); // 150 − 7 − 0

        ICampaignVault.Campaign memory c = vault.getCampaign(id);
        assertEq(uint8(c.status), uint8(ICampaignVault.CampaignStatus.Closed));
        assertEq(c.params.budget, 7e6);

        _report(clip, 15_000); // no accrual after close
        assertEq(vault.getClip(clip).accrued, 7e6);

        vm.warp(T0 + HOLD);
        vault.release(_one(clip)); // already-reserved money still reaches the clipper
        assertEq(usdc.balanceOf(clipper), 7e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_Close_Permissions() public {
        uint256 id = _create(_params());
        vm.expectRevert(ICampaignVault.NotBrand.selector);
        vault.closeCampaign(id); // stranger before endsAt

        vm.warp(T0 + 30 days + 1);
        vault.closeCampaign(id); // anyone after endsAt; refund still goes to the brand
        assertEq(usdc.balanceOf(brand), 150e6);

        vm.prank(brand);
        vm.expectRevert(ICampaignVault.CampaignNotActive.selector);
        vault.closeCampaign(id); // only once
    }

    function test_Close_BlocksTopUpAndRegister() public {
        uint256 id = _create(_params());
        vm.prank(brand);
        vault.closeCampaign(id);
        vm.expectRevert(ICampaignVault.CampaignNotActive.selector);
        vault.topUp(id, 1);
        vm.prank(clipper);
        vm.expectRevert(ICampaignVault.CampaignNotActive.selector);
        vault.registerClip(id, "aaaaaaaaaaa");
    }

    function test_CloseTo_BlacklistedBrandCanStillGetRefund() public {
        uint256 id = _create(_params());
        address safe = makeAddr("brandSafe");
        usdc.setBlocked(brand, true);

        vm.prank(brand);
        vm.expectRevert(bytes("blacklisted"));
        vault.closeCampaign(id);

        vm.startPrank(brand);
        vm.expectRevert(ICampaignVault.InvalidRefundAddress.selector);
        vault.closeCampaignTo(id, address(0));
        vault.closeCampaignTo(id, safe); // R-2
        vm.stopPrank();
        assertEq(usdc.balanceOf(safe), 150e6);
        assertEq(vault.refundAddressOf(id), safe);

        vm.prank(clipper);
        vm.expectRevert(ICampaignVault.NotBrand.selector);
        vault.closeCampaignTo(id, clipper);
    }

    function test_RejectAfterClose_GoesToRefundAddress() public {
        uint256 id = _create(_params());
        uint256 clip = _earning(id, clipper, "aaaaaaaaaaa", 6_000);
        address safe = makeAddr("brandSafe");
        vm.startPrank(brand);
        vault.closeCampaignTo(id, safe);
        vault.flag(clip, "x");
        vm.expectEmit(address(vault));
        emit ICampaignVault.CampaignRefunded(id, safe, 6e6);
        vault.resolve(clip, true);
        vm.stopPrank();
        assertEq(usdc.balanceOf(safe), 150e6);
        assertEq(vault.getCampaign(id).params.budget, 0);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_Close_WorksWhilePaused() public {
        uint256 id = _create(_params());
        vault.setPaused(true);
        vm.prank(brand);
        vault.closeCampaign(id);
        assertEq(usdc.balanceOf(brand), 150e6);
    }

    // ─────────────────────────── sweep (review follow-up 1) ───────────────────────────

    function test_Sweep_EndsClipsOfClosedCampaigns() public {
        uint256 a = _create(_params());
        uint256 b = _create(_params());
        vm.prank(clipper);
        uint256 pending = vault.registerClip(a, "ppppppppppp");
        uint256 active = _earning(a, clipper2, "aaaaaaaaaaa", 1_000);
        uint256 other = _earning(b, clipper2, "bbbbbbbbbbb", 1_000);
        assertEq(lens.sweepableClips(0, 10).length, 0);

        vm.prank(brand);
        vault.closeCampaign(a);
        uint256[] memory ids = lens.sweepableClips(0, 10);
        assertEq(ids.length, 2);

        uint256[] memory all = new uint256[](3);
        all[0] = pending;
        all[1] = active;
        all[2] = other; // open campaign: ignored
        vault.sweep(all);

        assertEq(uint8(vault.getClip(pending).status), uint8(ICampaignVault.ClipStatus.Ended));
        assertEq(uint8(vault.getClip(active).status), uint8(ICampaignVault.ClipStatus.Ended));
        assertEq(uint8(vault.getClip(other).status), uint8(ICampaignVault.ClipStatus.Active));
        assertEq(vault.watchListLength(), 1);

        vm.warp(T0 + HOLD);
        vault.release(_one(active)); // ended clips still get their reserved money
        assertEq(usdc.balanceOf(clipper2), 1e6);
    }

    // ─────────────────────────── pause and pending (review follow-up 4) ───────────────────────────

    function test_ExpirePendingBlockedWhilePaused() public {
        uint256 id = _create(_params());
        vm.prank(clipper);
        uint256 clip = vault.registerClip(id, "aaaaaaaaaaa");
        vm.warp(T0 + 1800);
        vault.setPaused(true);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.expirePending(clip);
        vault.setPaused(false);
        vault.expirePending(clip);
    }

    // ─────────────────────────── reputation tiers and gating (F8) ───────────────────────────

    function test_Tiers() public {
        address v = address(vault);
        vm.startPrank(v);
        reputation.recordPaid(clipper, brand, 1, 4_999, 1);
        assertEq(reputation.tier(clipper), 0);
        reputation.recordPaid(clipper, brand, 1, 1, 1); // same clip: clipsPaid stays 1
        assertEq(reputation.tier(clipper), 1);
        assertEq(reputation.stats(clipper).clipsPaid, 1);

        for (uint256 i = 2; i <= 19; ++i) {
            reputation.recordPaid(clipper, brand, i, 2_500, 1); // 19 clips, 50,000 views
        }
        assertEq(reputation.stats(clipper).paidViews, 50_000);
        assertEq(reputation.tier(clipper), 2);

        reputation.recordRejection(clipper); // 1 / 20 = 5%: not below 5%
        assertEq(reputation.tier(clipper), 0);
        reputation.recordPaid(clipper, brand, 20, 0, 0); // 1 / 21 < 5%
        assertEq(reputation.tier(clipper), 2);
        vm.stopPrank();
    }

    function test_TierGate_EndToEnd() public {
        uint256 open = _create(_params());
        ICampaignVault.CampaignParams memory p = _params();
        p.minTier = 1;
        uint256 gated = _create(p);

        vm.prank(clipper);
        vm.expectRevert(ICampaignVault.TierTooLow.selector);
        vault.registerClip(gated, "ggggggggggg"); // tier 0

        uint256 clip = _earning(open, clipper, "aaaaaaaaaaa", 5_000);
        vm.warp(T0 + HOLD);
        vault.release(_one(clip)); // 5,000 paid views → tier 1
        vm.prank(clipper);
        vault.registerClip(gated, "ggggggggggg");
    }
}
