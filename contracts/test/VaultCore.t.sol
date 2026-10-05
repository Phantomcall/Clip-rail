// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CreatorReputation} from "../src/CreatorReputation.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ICampaignVault} from "../src/interfaces/ICampaignVault.sol";
import {ICreatorReputation} from "../src/interfaces/ICreatorReputation.sol";
import {ReceiverTemplate} from "../src/cre/ReceiverTemplate.sol";

contract VaultCoreTest is Test {
    address constant FORWARDER = address(0xF0);
    address constant ORACLE = address(0x0AC1E);
    uint64 constant TIMEOUT = 1800;
    uint64 constant T0 = 1_000_000;

    CreatorReputation reputation;
    CampaignVault vault;
    MockUSDC usdc;

    address brand = makeAddr("brand");
    address relayer = makeAddr("relayer");
    uint256 clipperPk = 0xC11;
    address clipper;
    uint64 round;

    function setUp() public {
        vm.warp(T0);
        clipper = vm.addr(clipperPk);
        reputation = new CreatorReputation();
        vault = new CampaignVault(FORWARDER, reputation, TIMEOUT, TIMEOUT);
        reputation.addVault(address(vault));
        usdc = new MockUSDC();
        vault.setTokenAllowed(address(usdc), true);
        vault.setReportTransmitter(ORACLE);
    }

    // ─────────────────────────── helpers ───────────────────────────

    /// Appendix 3 live-campaign parameters.
    function _params() internal view returns (ICampaignVault.CampaignParams memory) {
        return ICampaignVault.CampaignParams({
            token: address(usdc),
            budget: 150e6,
            cpm: 1e6,
            maxPerClip: 20e6,
            maxViewsPerReport: 20_000,
            minLikeBps: 50,
            holdSecs: 86_400,
            startsAt: T0,
            endsAt: T0 + 30 days,
            minTier: 0,
            briefHash: keccak256("brief")
        });
    }

    function _fund(address who, uint256 amount) internal {
        while (amount > 0) {
            uint256 chunk = amount > 10_000e6 ? 10_000e6 : amount;
            usdc.mint(who, chunk);
            amount -= chunk;
        }
    }

    function _create(ICampaignVault.CampaignParams memory p) internal returns (uint256 id) {
        _fund(brand, p.budget);
        vm.startPrank(brand);
        usdc.approve(address(vault), p.budget);
        id = vault.createCampaign(p);
        vm.stopPrank();
    }

    function _register(uint256 campaignId, string memory videoId) internal returns (uint256) {
        vm.prank(clipper);
        return vault.registerClip(campaignId, videoId);
    }

    function _signRegister(uint256 pk, uint256 campaignId, string memory videoId, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                vault.REGISTER_CLIP_TYPEHASH(), campaignId, keccak256(bytes(videoId)), vm.addr(pk), nonce, deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _req(uint256 campaignId, string memory videoId, uint256 nonce, uint256 deadline)
        internal
        view
        returns (ICampaignVault.RegisterClip memory)
    {
        return ICampaignVault.RegisterClip(campaignId, videoId, clipper, nonce, deadline);
    }

    function _upd(uint256 clipId, uint64 views, uint64 likes, uint8 flags)
        internal
        pure
        returns (ICampaignVault.ClipUpdate memory)
    {
        return ICampaignVault.ClipUpdate(clipId, views, likes, T0 + 1, flags);
    }

    function _report1(ICampaignVault.ClipUpdate memory u) internal {
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](1);
        us[0] = u;
        _report(us);
    }

    function _report(ICampaignVault.ClipUpdate[] memory us) internal {
        vm.prank(FORWARDER, ORACLE);
        vault.onReport("", abi.encode(++round, us));
    }

    /// Registers and activates a clip with zero views.
    function _activeClip(uint256 campaignId, string memory videoId) internal returns (uint256 clipId) {
        clipId = _register(campaignId, videoId);
        _report1(_upd(clipId, 0, 0, 1));
    }

    // ─────────────────────────── createCampaign ───────────────────────────

    function test_Create_PullsBudgetAndStores() public {
        uint256 id = _create(_params());
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(vault)), 150e6);
        assertEq(usdc.balanceOf(brand), 0);
        ICampaignVault.Campaign memory c = vault.getCampaign(id);
        assertEq(c.brand, brand);
        assertEq(uint8(c.status), uint8(ICampaignVault.CampaignStatus.Active));
        assertEq(c.params.budget, 150e6);
    }

    function test_Create_EmitsEvent() public {
        ICampaignVault.CampaignParams memory p = _params();
        _fund(brand, p.budget);
        vm.startPrank(brand);
        usdc.approve(address(vault), p.budget);
        vm.expectEmit(address(vault));
        emit ICampaignVault.CampaignCreated(
            1, brand, p.token, p.budget, p.cpm, p.maxPerClip, p.holdSecs, p.startsAt, p.endsAt, p.minTier, p.briefHash
        );
        vault.createCampaign(p);
        vm.stopPrank();
    }

    function test_Create_RevertsOnBadParams() public {
        ICampaignVault.CampaignParams memory p;

        p = _params();
        p.token = address(0xBAD);
        _expectCreateRevert(p, ICampaignVault.TokenNotAllowed.selector);

        p = _params();
        p.budget = 0;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
        p = _params();
        p.cpm = 0;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
        p = _params();
        p.maxPerClip = 0;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
        p = _params();
        p.maxViewsPerReport = 0;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
        p = _params();
        p.minLikeBps = 10_001;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
        p = _params();
        p.holdSecs = 7 days + 1;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
        p = _params();
        p.endsAt = p.startsAt;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
        p = _params();
        p.startsAt = T0 - 100;
        p.endsAt = T0;
        _expectCreateRevert(p, ICampaignVault.InvalidParams.selector);
    }

    function _expectCreateRevert(ICampaignVault.CampaignParams memory p, bytes4 selector) internal {
        vm.prank(brand);
        vm.expectRevert(selector);
        vault.createCampaign(p);
    }

    function test_Create_BoundaryParamsAccepted() public {
        ICampaignVault.CampaignParams memory p = _params();
        p.minLikeBps = 10_000;
        p.holdSecs = 7 days;
        _create(p);
    }

    function test_Create_RevertsWhenPaused() public {
        vault.setPaused(true);
        vm.prank(brand);
        vm.expectRevert();
        vault.createCampaign(_params());
    }

    function test_CreateWithPermit() public {
        uint256 brandPk = 0xB0B;
        address permitBrand = vm.addr(brandPk);
        ICampaignVault.CampaignParams memory p = _params();
        _fund(permitBrand, p.budget);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                permitBrand,
                address(vault),
                uint256(p.budget),
                usdc.nonces(permitBrand),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(brandPk, digest);

        vm.prank(permitBrand);
        uint256 id = vault.createCampaignWithPermit(p, deadline, v, r, s);
        assertEq(vault.getCampaign(id).brand, permitBrand);
        assertEq(usdc.balanceOf(address(vault)), p.budget);
    }

    function test_TopUp() public {
        uint256 id = _create(_params());
        _fund(address(this), 50e6);
        usdc.approve(address(vault), 50e6);
        vault.topUp(id, 50e6);
        assertEq(vault.getCampaign(id).params.budget, 200e6);
        assertEq(usdc.balanceOf(address(vault)), 200e6);
    }

    function test_TopUp_RevertsForUnknownCampaignOrZero() public {
        vm.expectRevert(ICampaignVault.CampaignNotActive.selector);
        vault.topUp(99, 1);
        uint256 id = _create(_params());
        vm.expectRevert(ICampaignVault.InvalidParams.selector);
        vault.topUp(id, 0);
    }

    // ─────────────────────────── registerClip ───────────────────────────

    function test_Register_Direct() public {
        uint256 id = _create(_params());
        vm.expectEmit(address(vault));
        emit ICampaignVault.ClipRegistered(1, id, clipper, "dQw4w9WgXcQ");
        uint256 clipId = _register(id, "dQw4w9WgXcQ");
        ICampaignVault.Clip memory c = vault.getClip(clipId);
        assertEq(c.clipper, clipper);
        assertEq(uint8(c.status), uint8(ICampaignVault.ClipStatus.Pending));
        assertEq(c.registeredAt, T0);
        assertEq(vault.clipIdByVideo(keccak256("dQw4w9WgXcQ")), 0); // reserved only once ownership is proven
        assertEq(vault.watchListLength(), 1);
    }

    function test_Register_WithSig_RelayerPaysGas() public {
        uint256 id = _create(_params());
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _signRegister(clipperPk, id, "dQw4w9WgXcQ", 0, deadline);
        vm.prank(relayer);
        uint256 clipId = vault.registerClipWithSig(_req(id, "dQw4w9WgXcQ", 0, deadline), sig);
        assertEq(vault.getClip(clipId).clipper, clipper);
        assertEq(vault.nonces(clipper), 1);
    }

    function test_Register_WithSig_Reverts() public {
        uint256 id = _create(_params());
        uint256 deadline = block.timestamp + 10 minutes;

        // expired
        bytes memory sig = _signRegister(clipperPk, id, "aaaaaaaaaaa", 0, block.timestamp - 1);
        vm.expectRevert(ICampaignVault.ExpiredDeadline.selector);
        vault.registerClipWithSig(_req(id, "aaaaaaaaaaa", 0, block.timestamp - 1), sig);

        // wrong signer
        sig = _signRegister(0xBAD, id, "aaaaaaaaaaa", 0, deadline);
        vm.expectRevert(ICampaignVault.InvalidSignature.selector);
        vault.registerClipWithSig(_req(id, "aaaaaaaaaaa", 0, deadline), sig);

        // tampered video id
        sig = _signRegister(clipperPk, id, "aaaaaaaaaaa", 0, deadline);
        vm.expectRevert(ICampaignVault.InvalidSignature.selector);
        vault.registerClipWithSig(_req(id, "bbbbbbbbbbb", 0, deadline), sig);

        // wrong nonce
        sig = _signRegister(clipperPk, id, "aaaaaaaaaaa", 5, deadline);
        vm.expectRevert(ICampaignVault.InvalidNonce.selector);
        vault.registerClipWithSig(_req(id, "aaaaaaaaaaa", 5, deadline), sig);

        // replay
        sig = _signRegister(clipperPk, id, "aaaaaaaaaaa", 0, deadline);
        vault.registerClipWithSig(_req(id, "aaaaaaaaaaa", 0, deadline), sig);
        vm.expectRevert(ICampaignVault.InvalidNonce.selector);
        vault.registerClipWithSig(_req(id, "aaaaaaaaaaa", 0, deadline), sig);
    }

    function test_Register_SigForOneCampaignCantBeUsedForAnother() public {
        uint256 a = _create(_params());
        uint256 b = _create(_params());
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _signRegister(clipperPk, a, "aaaaaaaaaaa", 0, deadline);
        vm.expectRevert(ICampaignVault.InvalidSignature.selector);
        vault.registerClipWithSig(_req(b, "aaaaaaaaaaa", 0, deadline), sig);
    }

    function test_Register_VideoReservedOnlyOnActivation() public {
        uint256 a = _create(_params());
        uint256 b = _create(_params());
        uint256 first = _register(a, "dQw4w9WgXcQ");
        uint256 second = _register(b, "dQw4w9WgXcQ"); // allowed while nobody has proven ownership
        assertEq(vault.clipIdByVideo(keccak256("dQw4w9WgXcQ")), 0);

        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](2);
        us[0] = _upd(first, 100, 10, 1);
        us[1] = _upd(second, 100, 10, 1);
        vm.expectEmit(address(vault));
        emit ICampaignVault.ClipRejected(second, uint8(ICampaignVault.RejectReason.DuplicateVideo));
        _report(us);
        assertEq(vault.clipIdByVideo(keccak256("dQw4w9WgXcQ")), first);

        vm.prank(clipper);
        vm.expectRevert(ICampaignVault.VideoAlreadyRegistered.selector);
        vault.registerClip(b, "dQw4w9WgXcQ");
    }

    function test_Register_InvalidVideoIds() public {
        uint256 id = _create(_params());
        string[5] memory bad = ["dQw4w9WgXc", "dQw4w9WgXcQQ", "dQw4w9WgXc!", "dQw4w9 gXcQ", ""];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(clipper);
            vm.expectRevert(ICampaignVault.InvalidVideoId.selector);
            vault.registerClip(id, bad[i]);
        }
        _register(id, "a-Z_09azAZ9"); // every allowed character class
    }

    function test_Register_TierGate() public {
        ICampaignVault.CampaignParams memory p = _params();
        p.minTier = 1;
        uint256 id = _create(p);
        vm.prank(clipper);
        vm.expectRevert(ICampaignVault.TierTooLow.selector);
        vault.registerClip(id, "dQw4w9WgXcQ");
    }

    function test_Register_CampaignChecks() public {
        vm.prank(clipper);
        vm.expectRevert(ICampaignVault.CampaignNotActive.selector);
        vault.registerClip(1, "dQw4w9WgXcQ");

        uint256 id = _create(_params());
        vm.warp(T0 + 30 days);
        vm.prank(clipper);
        vm.expectRevert(ICampaignVault.CampaignEnded.selector);
        vault.registerClip(id, "dQw4w9WgXcQ");
    }

    function test_Register_RevertsWhenPaused() public {
        uint256 id = _create(_params());
        vault.setPaused(true);
        vm.prank(clipper);
        vm.expectRevert();
        vault.registerClip(id, "dQw4w9WgXcQ");
    }

    // ─────────────────────────── setPayoutAddressWithSig ───────────────────────────

    function test_SetPayoutWithSig() public {
        address payout = makeAddr("exchange");
        uint256 deadline = block.timestamp + 10 minutes;
        bytes32 structHash = keccak256(abi.encode(vault.SET_PAYOUT_TYPEHASH(), clipper, payout, uint256(0), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(clipperPk, digest);

        assertEq(vault.payoutAddressOf(clipper), clipper);
        vm.prank(relayer);
        vault.setPayoutAddressWithSig(ICampaignVault.SetPayout(clipper, payout, 0, deadline), abi.encodePacked(r, s, v));
        assertEq(vault.payoutAddressOf(clipper), payout);
        assertEq(vault.nonces(clipper), 1);
    }

    // ─────────────────────────── onReport: rule 1 and access ───────────────────────────

    function test_Report_OnlyForwarder() public {
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), FORWARDER));
        vault.onReport("", abi.encode(uint64(1), new ICampaignVault.ClipUpdate[](0)));
    }

    function test_Report_StaleOrEqualRoundReverts() public {
        _report(new ICampaignVault.ClipUpdate[](0)); // round 1
        vm.startPrank(FORWARDER, ORACLE);
        vm.expectRevert(abi.encodeWithSelector(ICampaignVault.StaleRound.selector, 1, 1));
        vault.onReport("", abi.encode(uint64(1), new ICampaignVault.ClipUpdate[](0)));
        vm.expectRevert(abi.encodeWithSelector(ICampaignVault.StaleRound.selector, 0, 1));
        vault.onReport("", abi.encode(uint64(0), new ICampaignVault.ClipUpdate[](0)));
        vault.onReport("", abi.encode(uint64(7), new ICampaignVault.ClipUpdate[](0))); // gaps are fine
        vm.stopPrank();
        assertEq(vault.lastRound(), 7);
    }

    function test_Report_UnknownClipSkippedOthersProcessed() public {
        uint256 id = _create(_params());
        uint256 clipId = _register(id, "dQw4w9WgXcQ");
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](2);
        us[0] = _upd(999, 100, 10, 1);
        us[1] = _upd(clipId, 1000, 100, 1);
        vm.expectEmit(address(vault));
        emit ICampaignVault.ReportEntrySkipped(999, uint8(ICampaignVault.SkipReason.UnknownClip));
        _report(us);
        assertEq(vault.getClip(clipId).accrued, 1e6);
    }

    // ─────────────────────────── rule 2: pending clips ───────────────────────────

    function test_Pending_ActivatesWithOwnershipAndAccruesSameReport() public {
        uint256 id = _create(_params());
        uint256 clipId = _register(id, "dQw4w9WgXcQ");
        vm.expectEmit(address(vault));
        emit ICampaignVault.ClipActivated(clipId);
        _report1(_upd(clipId, 5000, 100, 1));
        ICampaignVault.Clip memory c = vault.getClip(clipId);
        assertEq(uint8(c.status), uint8(ICampaignVault.ClipStatus.Active));
        assertEq(c.publishedAt, T0 + 1);
        assertEq(c.accrued, 5e6);
    }

    function test_Pending_WaitsWithoutCode() public {
        uint256 id = _create(_params());
        uint256 clipId = _register(id, "dQw4w9WgXcQ");
        _report1(_upd(clipId, 5000, 100, 0));
        assertEq(uint8(vault.getClip(clipId).status), uint8(ICampaignVault.ClipStatus.Pending));
        assertEq(vault.getClip(clipId).accrued, 0);
    }

    function test_Pending_PublishedBeforeStartNeverActivates() public {
        uint256 id = _create(_params());
        uint256 clipId = _register(id, "dQw4w9WgXcQ");
        ICampaignVault.ClipUpdate memory u = _upd(clipId, 5000, 100, 1);
        u.publishedAt = T0 - 1;
        _report1(u);
        assertEq(uint8(vault.getClip(clipId).status), uint8(ICampaignVault.ClipStatus.Pending));
    }

    function test_Pending_RejectedAfterTimeout() public {
        uint256 id = _create(_params());
        uint256 clipId = _register(id, "dQw4w9WgXcQ");
        vm.warp(T0 + TIMEOUT - 1);
        _report1(_upd(clipId, 5000, 100, 0));
        assertEq(uint8(vault.getClip(clipId).status), uint8(ICampaignVault.ClipStatus.Pending));

        vm.warp(T0 + TIMEOUT);
        vm.expectEmit(address(vault));
        emit ICampaignVault.ClipRejected(clipId, uint8(ICampaignVault.RejectReason.NoOwnership));
        _report1(_upd(clipId, 5000, 100, 0));
        assertEq(uint8(vault.getClip(clipId).status), uint8(ICampaignVault.ClipStatus.Rejected));
        assertEq(vault.watchListLength(), 0);
    }

    function test_Unavailable_EndsPendingAndActiveAfterStrikes() public {
        uint256 id = _create(_params());
        uint256 a = _register(id, "aaaaaaaaaaa");
        uint256 b = _activeClip(id, "bbbbbbbbbbb");
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](2);
        us[0] = _upd(a, 0, 0, 2);
        us[1] = _upd(b, 9000, 900, 3);
        _report(us);
        _report(us);
        assertEq(uint8(vault.getClip(b).status), uint8(ICampaignVault.ClipStatus.Active)); // 2 strikes: still alive
        _report(us);
        assertEq(uint8(vault.getClip(a).status), uint8(ICampaignVault.ClipStatus.Ended));
        assertEq(uint8(vault.getClip(b).status), uint8(ICampaignVault.ClipStatus.Ended));
        assertEq(vault.getClip(b).accrued, 0);
        assertEq(vault.watchListLength(), 0);
    }

    // ─────────────────────────── rules 3–7 ───────────────────────────

    /// The worked example from the briefing, with the live-campaign parameters.
    function test_WorkedExample() public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");

        // R1: 12,000 views, 100 likes → $12
        vm.expectEmit(address(vault));
        emit ICampaignVault.ViewsVerified(clipId, id, clipper, 2, 12_000, 12_000, 100, 12e6, T0 + 86_400);
        _report1(_upd(clipId, 12_000, 100, 1));
        assertEq(vault.getClip(clipId).accrued, 12e6);

        // R2: 50,000 views, 300 likes → delta capped at 20,000 → $20, capped to $8 by maxPerClip
        _report1(_upd(clipId, 50_000, 300, 1));
        ICampaignVault.Clip memory c = vault.getClip(clipId);
        assertEq(c.accrued, 20e6);
        assertEq(c.lastViews, 50_000);
        ICampaignVault.Tranche[] memory t = vault.getTranches(clipId);
        assertEq(t.length, 2);
        assertEq(t[1].amount, 8e6);
        assertEq(t[1].views, 8000); // only the views actually paid

        // R3: views went down → nothing
        _report1(_upd(clipId, 49_000, 300, 1));
        assertEq(vault.getClip(clipId).lastViews, 50_000);
        assertEq(vault.getTranches(clipId).length, 2);
        assertEq(vault.getCampaign(id).reserved, 20e6);
    }

    function test_ViewsOnlyGoUp() public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");
        _report1(_upd(clipId, 1000, 100, 1));
        _report1(_upd(clipId, 1000, 100, 1));
        _report1(_upd(clipId, 500, 100, 1));
        assertEq(vault.getClip(clipId).accrued, 1e6);
        assertEq(vault.getTranches(clipId).length, 1);
    }

    function test_VelocityCap() public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");
        _report1(_upd(clipId, 20_001, 1000, 1));
        assertEq(vault.getClip(clipId).accrued, 20e6 - 0); // 20,000 views paid, not 20,001
        assertEq(vault.getTranches(clipId)[0].views, 20_000);
        assertEq(vault.getClip(clipId).lastViews, 20_001);
    }

    function test_LikeFloor() public {
        uint256 id = _create(_params()); // 50 bps = 0.5%
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");

        // 10,000 views needs ≥ 50 likes; 49 is suspect and those views are lost
        vm.expectEmit(address(vault));
        emit ICampaignVault.SuspectReport(clipId, 2, 10_000, 49);
        _report1(_upd(clipId, 10_000, 49, 1));
        assertEq(vault.getClip(clipId).accrued, 0);
        assertEq(vault.getClip(clipId).lastViews, 10_000);

        // exactly at the floor is paid (only the new delta)
        _report1(_upd(clipId, 12_000, 60, 1));
        assertEq(vault.getClip(clipId).accrued, 2e6);
    }

    function test_MissingLikesTreatedAsZeroAreSuspect() public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");
        _report1(_upd(clipId, 1000, 0, 1));
        assertEq(vault.getClip(clipId).accrued, 0);
    }

    function test_BudgetNeverOverdrawn() public {
        ICampaignVault.CampaignParams memory p = _params();
        p.budget = 30e6; // room for 1.5 maxed clips
        uint256 id = _create(p);
        uint256 a = _activeClip(id, "aaaaaaaaaaa");
        uint256 b = _activeClip(id, "bbbbbbbbbbb");
        uint256 c = _activeClip(id, "ccccccccccc");

        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](3);
        us[0] = _upd(a, 20_000, 1000, 1);
        us[1] = _upd(b, 20_000, 1000, 1);
        us[2] = _upd(c, 20_000, 1000, 1);
        _report(us);

        assertEq(vault.getClip(a).accrued, 20e6);
        assertEq(vault.getClip(b).accrued, 10e6);
        assertEq(vault.getClip(c).accrued, 0);
        assertEq(vault.getCampaign(id).reserved, 30e6);
    }

    function test_AccrualRoundsDown() public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");
        _report1(_upd(clipId, 1, 1, 1)); // 1 view × 1e6 / 1000 = 1000 units
        assertEq(vault.getClip(clipId).accrued, 1000);
    }

    // ─────────────────────────── pause / campaign window ───────────────────────────

    function test_Paused_RoundAdvancesEntriesSkipped() public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");
        vault.setPaused(true);
        vm.expectEmit(address(vault));
        emit ICampaignVault.ReportEntrySkipped(clipId, uint8(ICampaignVault.SkipReason.Paused));
        _report1(_upd(clipId, 5000, 500, 1));
        assertEq(vault.lastRound(), 2);
        assertEq(vault.getClip(clipId).accrued, 0);
        assertEq(vault.getClip(clipId).lastViews, 0);

        vault.setPaused(false);
        _report1(_upd(clipId, 5000, 500, 1));
        assertEq(vault.getClip(clipId).accrued, 5e6);
    }

    function test_AfterEndsAt_EntriesSkipped() public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");
        vm.warp(T0 + 30 days + 1);
        vm.expectEmit(address(vault));
        emit ICampaignVault.ReportEntrySkipped(clipId, uint8(ICampaignVault.SkipReason.CampaignClosed));
        _report1(_upd(clipId, 5000, 500, 1));
        assertEq(vault.getClip(clipId).accrued, 0);
    }

    // ─────────────────────────── activeClips ───────────────────────────

    function test_ActiveClips_RowsAndPaging() public {
        uint256 id = _create(_params());
        uint256 a = _register(id, "aaaaaaaaaaa");
        uint256 b = _activeClip(id, "bbbbbbbbbbb");
        _register(id, "ccccccccccc");

        ICampaignVault.ActiveClip[] memory rows = vault.activeClips(0, 500);
        assertEq(rows.length, 3);
        assertEq(rows[0].clipId, a);
        assertEq(rows[0].clipper, clipper);
        assertEq(rows[0].videoId, "aaaaaaaaaaa");
        assertEq(rows[0].status, uint8(ICampaignVault.ClipStatus.Pending));
        assertEq(rows[1].clipId, b);
        assertEq(rows[1].status, uint8(ICampaignVault.ClipStatus.Active));

        assertEq(vault.activeClips(1, 1).length, 1);
        assertEq(vault.activeClips(1, 1)[0].clipId, b);
        assertEq(vault.activeClips(3, 10).length, 0);
        assertEq(vault.activeClips(10, 10).length, 0);
    }

    function test_ActiveClips_DropsEndedAndClosedWindow() public {
        uint256 id = _create(_params());
        uint256 a = _activeClip(id, "aaaaaaaaaaa");
        _activeClip(id, "bbbbbbbbbbb");
        _report1(_upd(a, 0, 0, 2));
        _report1(_upd(a, 0, 0, 2));
        _report1(_upd(a, 0, 0, 2)); // a ends after 3 strikes
        assertEq(vault.activeClips(0, 10).length, 1);
        vm.warp(T0 + 30 days + 1);
        assertEq(vault.activeClips(0, 10).length, 0);
    }

    // ─────────────────────────── fuzz ───────────────────────────

    /// Over any sequence of reports for one clip: accrued ≤ maxPerClip, reserved ≤ budget, lastViews never falls.
    function testFuzz_ReportsRespectCaps(uint64[8] memory views, uint64[8] memory likes) public {
        uint256 id = _create(_params());
        uint256 clipId = _activeClip(id, "dQw4w9WgXcQ");
        uint64 prev;
        for (uint256 i; i < 8; ++i) {
            _report1(_upd(clipId, views[i], likes[i], 1));
            ICampaignVault.Clip memory c = vault.getClip(clipId);
            assertGe(c.lastViews, prev);
            prev = c.lastViews;
            assertLe(c.accrued, 20e6);
            assertLe(vault.getCampaign(id).reserved, 150e6);
            assertEq(vault.getCampaign(id).reserved, c.accrued);
        }
    }
}
