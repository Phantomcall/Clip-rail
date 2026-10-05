// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CampaignVault} from "../../src/CampaignVault.sol";
import {CreatorReputation} from "../../src/CreatorReputation.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {ICampaignVault} from "../../src/interfaces/ICampaignVault.sol";
import {ICreatorReputation} from "../../src/interfaces/ICreatorReputation.sol";
import {IReceiver} from "../../src/cre/IReceiver.sol";
import {ReceiverTemplate} from "../../src/cre/ReceiverTemplate.sol";

/// @dev Same behaviour as Chainlink's MockKeystoneForwarder.report(): "permissionless and skips all
///      signature/config validations" (chainlink-evm contracts/cre/src/dev/MockKeystoneForwarder.sol).
contract PermissionlessForwarder {
    function report(address receiver, bytes calldata metadata, bytes calldata rep) external {
        IReceiver(receiver).onReport(metadata, rep);
    }
}

/// Regression tests for docs/audit/2026-10-05-vault-core.md. Each test replays the original attack and asserts
/// it now fails, then checks the honest path still works.
contract AuditRegressionsTest is Test {
    uint64 constant T0 = 1_000_000;

    PermissionlessForwarder mockForwarder;
    CreatorReputation reputation;
    CampaignVault vault;
    MockUSDC usdc;

    address oracle = makeAddr("oracle");
    address brand = makeAddr("brand");
    address attacker = makeAddr("attacker");
    address victim = makeAddr("victim");
    uint64 round;

    function setUp() public {
        vm.warp(T0);
        mockForwarder = new PermissionlessForwarder();
        reputation = new CreatorReputation();
        vault = new CampaignVault(address(mockForwarder), reputation, 1800, 1800);
        reputation.setVault(address(vault));
        usdc = new MockUSDC();
        vault.setTokenAllowed(address(usdc), true);
        vault.setReportTransmitter(oracle);
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _campaign(uint128 budget, uint128 maxPerClip) internal returns (uint256 id) {
        ICampaignVault.CampaignParams memory p = ICampaignVault.CampaignParams({
            token: address(usdc),
            budget: budget,
            cpm: 1e6,
            maxPerClip: maxPerClip,
            maxViewsPerReport: 20_000,
            minLikeBps: 50,
            holdSecs: 86_400,
            startsAt: T0,
            endsAt: T0 + 30 days,
            minTier: 0,
            briefHash: 0
        });
        usdc.mint(brand, budget);
        vm.startPrank(brand);
        usdc.approve(address(vault), budget);
        id = vault.createCampaign(p);
        vm.stopPrank();
    }

    function _upd(uint256 clipId, uint64 views, uint64 likes, uint8 flags)
        internal
        pure
        returns (ICampaignVault.ClipUpdate memory)
    {
        return ICampaignVault.ClipUpdate(clipId, views, likes, T0 + 1, flags);
    }

    function _one(ICampaignVault.ClipUpdate memory u) internal pure returns (ICampaignVault.ClipUpdate[] memory us) {
        us = new ICampaignVault.ClipUpdate[](1);
        us[0] = u;
    }

    /// The honest oracle: its wallet broadcasts through the public mock forwarder.
    function _oracleReport(ICampaignVault.ClipUpdate[] memory us) internal {
        vm.prank(oracle, oracle);
        mockForwarder.report(address(vault), "", abi.encode(++round, us));
    }

    function _reg(address who, uint256 id, string memory videoId) internal returns (uint256) {
        vm.prank(who);
        return vault.registerClip(id, videoId);
    }

    // ─────────────── C-1: forged reports through the mock forwarder ───────────────

    function test_C1_AttackerCannotReportThroughMockForwarder() public {
        uint256 id = _campaign(150e6, 20e6);
        uint256 clip = _reg(attacker, id, "atk00000001");

        vm.prank(attacker, attacker);
        vm.expectRevert(abi.encodeWithSelector(ICampaignVault.UnauthorizedTransmitter.selector, attacker, oracle));
        mockForwarder.report(address(vault), "", abi.encode(uint64(1), _one(_upd(clip, 20_000, 10_000, 1))));
        assertEq(vault.getCampaign(id).reserved, 0);

        // The honest oracle still gets through.
        _oracleReport(_one(_upd(clip, 1000, 100, 1)));
        assertEq(vault.getClip(clip).accrued, 1e6);
    }

    function test_C1_FailsClosedWithoutAnyReportAuth() public {
        vault.setReportTransmitter(address(0)); // no pin and no workflow identity
        vm.prank(oracle, oracle);
        vm.expectRevert(ICampaignVault.ReportsNotAuthorized.selector);
        mockForwarder.report(address(vault), "", abi.encode(uint64(1), new ICampaignVault.ClipUpdate[](0)));
    }

    function test_C1_FailsClosedWithZeroForwarder() public {
        vault.setForwarderAddress(address(0));
        vm.prank(oracle, oracle);
        vm.expectRevert(ICampaignVault.ReportsNotAuthorized.selector);
        vault.onReport("", abi.encode(uint64(1), new ICampaignVault.ClipUpdate[](0)));
    }

    // ─────────────── H-4: production forwarder needs workflow identity ───────────────

    function test_H4_ProductionForwarderRequiresWorkflowIdentity() public {
        address keystone = makeAddr("keystoneForwarder");
        address workflowOwner = makeAddr("workflowOwner");
        bytes32 workflowId = keccak256("cliprail-oracle");
        vault.setForwarderAddress(keystone);
        vault.setReportTransmitter(address(0));
        bytes memory rep = abi.encode(uint64(1), new ICampaignVault.ClipUpdate[](0));
        bytes memory ourMeta = abi.encodePacked(workflowId, bytes10("cliprail"), workflowOwner, bytes2(0));
        bytes memory otherMeta = abi.encodePacked(keccak256("someone-else"), bytes10("x"), attacker, bytes2(0));

        // Identity not configured: nothing is accepted, not even from the real forwarder.
        vm.prank(keystone);
        vm.expectRevert(ICampaignVault.ReportsNotAuthorized.selector);
        vault.onReport(ourMeta, rep);

        vault.setExpectedAuthor(workflowOwner);
        vault.setExpectedWorkflowId(workflowId);

        // Another workflow on the same DON is rejected.
        vm.prank(keystone);
        vm.expectRevert();
        vault.onReport(otherMeta, rep);

        // Ours lands.
        vm.prank(keystone);
        vault.onReport(ourMeta, rep);
        assertEq(vault.lastRound(), 1);
    }

    function test_H4_PinnedTransmitterBlocksProductionUntilUnpinned() public {
        // During the switch, a pinned transmitter makes DON reports fail closed (tx.origin is a DON node).
        address keystone = makeAddr("keystoneForwarder");
        vault.setForwarderAddress(keystone);
        vm.prank(keystone, makeAddr("donNode"));
        vm.expectRevert();
        vault.onReport("", abi.encode(uint64(1), new ICampaignVault.ClipUpdate[](0)));
    }

    // ─────────────── H-1: round bricking ───────────────

    function test_H1_RoundGapBounded() public {
        vm.prank(oracle, oracle);
        vm.expectRevert(abi.encodeWithSelector(ICampaignVault.RoundGapTooLarge.selector, type(uint64).max, 0));
        mockForwarder.report(address(vault), "", abi.encode(type(uint64).max, new ICampaignVault.ClipUpdate[](0)));

        uint64 maxGap = vault.MAX_ROUND_GAP();
        vm.prank(oracle, oracle);
        mockForwarder.report(address(vault), "", abi.encode(maxGap, new ICampaignVault.ClipUpdate[](0)));
        assertEq(vault.lastRound(), maxGap);
    }

    // ─────────────── H-2: video squatting ───────────────

    function test_H2_SquatterCannotLockOutOwner() public {
        uint256 id = _campaign(150e6, 20e6);
        uint256 squat = _reg(attacker, id, "VictimShort");
        uint256 real = _reg(victim, id, "VictimShort"); // the owner can still register

        // The description holds the victim's code, so only the victim's clip gets OWNERSHIP_OK.
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](2);
        us[0] = _upd(squat, 5000, 500, 0);
        us[1] = _upd(real, 5000, 500, 1);
        _oracleReport(us);

        assertEq(uint8(vault.getClip(real).status), uint8(ICampaignVault.ClipStatus.Active));
        assertEq(vault.clipIdByVideo(keccak256("VictimShort")), real);
        assertEq(vault.getClip(real).accrued, 5e6);

        // The squat is cleaned up by anyone after the timeout.
        vm.warp(T0 + 1800);
        vault.expirePending(squat);
        assertEq(uint8(vault.getClip(squat).status), uint8(ICampaignVault.ClipStatus.Rejected));
    }

    function test_H2_EndedPendingClipDoesNotBurnVideo() public {
        uint256 id = _campaign(150e6, 20e6);
        uint256 a = _reg(victim, id, "JustPosted1");
        for (uint256 i; i < 3; ++i) {
            _oracleReport(_one(_upd(a, 0, 0, 2))); // still processing on YouTube
        }
        assertEq(uint8(vault.getClip(a).status), uint8(ICampaignVault.ClipStatus.Ended));
        _reg(victim, id, "JustPosted1"); // can try again
    }

    // ─────────────── H-3: claim code length ───────────────

    function test_H3_ClaimCodeIs64Bits() public view {
        bytes memory code = bytes(vault.claimCode(1, victim));
        assertEq(code.length, 19); // "CR-" + 16 hex = 64 bits
        for (uint256 i = 3; i < 19; ++i) {
            bytes1 ch = code[i];
            assertTrue((ch >= "0" && ch <= "9") || (ch >= "A" && ch <= "F"));
        }
    }

    // ─────────────── M-1: duplicate entries ───────────────

    function test_M1_DuplicateEntrySkipped() public {
        uint256 id = _campaign(150e6, 100e6);
        uint256 clip = _reg(victim, id, "dQw4w9WgXcQ");
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](2);
        us[0] = _upd(clip, 20_000, 10_000, 1);
        us[1] = _upd(clip, 40_000, 10_000, 1);
        vm.expectEmit(address(vault));
        emit ICampaignVault.ReportEntrySkipped(clip, uint8(ICampaignVault.SkipReason.DuplicateEntry));
        _oracleReport(us);
        assertEq(vault.getClip(clip).accrued, 20e6); // one velocity cap, not two
    }

    // ─────────────── M-2: owner key behind a timelock; guardian can only pause ───────────────

    function test_M2_TimelockDelaysForwarderSwap() public {
        address deployer = address(this);
        address[] memory roles = new address[](1);
        roles[0] = deployer;
        TimelockController timelock = new TimelockController(1 days, roles, roles, address(0));
        vault.setGuardian(deployer);
        vault.transferOwnership(address(timelock));

        // The old key can't act directly any more.
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer));
        vault.setForwarderAddress(attacker);

        // A change must be scheduled publicly and wait a day.
        bytes memory call = abi.encodeCall(ReceiverTemplate.setForwarderAddress, (makeAddr("keystone")));
        timelock.schedule(address(vault), 0, call, bytes32(0), bytes32(0), 1 days);
        vm.expectRevert();
        timelock.execute(address(vault), 0, call, bytes32(0), bytes32(0));
        vm.warp(block.timestamp + 1 days);
        timelock.execute(address(vault), 0, call, bytes32(0), bytes32(0));
        assertEq(vault.getForwarderAddress(), makeAddr("keystone"));

        // The guardian (same key) can still pause at once, but can't unpause.
        vault.setPaused(true);
        assertTrue(vault.paused());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer));
        vault.setPaused(false);
    }

    function test_M2_StrangerCannotPause() public {
        vm.prank(attacker);
        vm.expectRevert(ICampaignVault.NotGuardian.selector);
        vault.setPaused(true);
    }

    // ─────────────── M-3: transient unavailable ───────────────

    function test_M3_OneBadAnswerDoesNotEndClip() public {
        uint256 id = _campaign(150e6, 100e6);
        uint256 clip = _reg(victim, id, "dQw4w9WgXcQ");
        _oracleReport(_one(_upd(clip, 1000, 100, 1)));
        _oracleReport(_one(_upd(clip, 0, 0, 2)));
        _oracleReport(_one(_upd(clip, 0, 0, 2)));
        _oracleReport(_one(_upd(clip, 21_000, 2_100, 1))); // healthy again: strikes reset, keeps earning
        _oracleReport(_one(_upd(clip, 0, 0, 2)));
        _oracleReport(_one(_upd(clip, 0, 0, 2)));
        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Active));
        assertEq(vault.getClip(clip).accrued, 21e6);
        _oracleReport(_one(_upd(clip, 0, 0, 2))); // third in a row: really gone
        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Ended));
    }

    // ─────────────── M-4: spam / starvation ───────────────

    function test_M4_PendingCapPerClipper() public {
        uint256 id = _campaign(150e6, 20e6);
        _reg(attacker, id, "atk00000001");
        _reg(attacker, id, "atk00000002");
        _reg(attacker, id, "atk00000003");
        vm.prank(attacker);
        vm.expectRevert(ICampaignVault.TooManyPending.selector);
        vault.registerClip(id, "atk00000004");

        // Expiring one frees a slot.
        vm.warp(T0 + 1800);
        vault.expirePending(1);
        _reg(attacker, id, "atk00000004");
    }

    function test_M4_MaxedClipAndEmptyCampaignLeaveOraclePage() public {
        uint256 id = _campaign(30e6, 20e6);
        uint256 a = _reg(victim, id, "aaaaaaaaaaa");
        uint256 b = _reg(makeAddr("v2"), id, "bbbbbbbbbbb");
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](2);
        us[0] = _upd(a, 20_000, 1000, 1);
        us[1] = _upd(b, 5000, 1000, 1);
        _oracleReport(us);
        assertEq(vault.watchListLength(), 1); // a hit maxPerClip and was unwatched
        assertEq(vault.activeClips(0, 10).length, 1);

        _oracleReport(_one(_upd(b, 20_000, 1000, 1))); // budget now fully reserved
        assertEq(vault.getCampaign(id).reserved, 30e6);
        assertEq(vault.activeClips(0, 10).length, 0); // nothing left worth checking
    }

    // ─────────────── L-1 … L-5 ───────────────

    function test_L1_ExpirePendingRules() public {
        uint256 id = _campaign(150e6, 20e6);
        uint256 clip = _reg(victim, id, "dQw4w9WgXcQ");
        vm.expectRevert(ICampaignVault.PendingNotExpired.selector);
        vault.expirePending(clip);
        vm.expectRevert(ICampaignVault.NotPending.selector);
        vault.expirePending(999);

        _oracleReport(_one(_upd(clip, 100, 10, 1))); // activates
        vm.warp(T0 + 1800);
        vm.expectRevert(ICampaignVault.NotPending.selector);
        vault.expirePending(clip);
    }

    function test_L3_ConstructorValidates() public {
        vm.expectRevert(ICampaignVault.InvalidParams.selector);
        new CampaignVault(address(mockForwarder), ICreatorReputation(address(0)), 1800, 1800);
        vm.expectRevert(ICampaignVault.InvalidParams.selector);
        new CampaignVault(address(mockForwarder), reputation, 0, 1800);
        vm.expectRevert(ICampaignVault.InvalidParams.selector);
        new CampaignVault(address(mockForwarder), reputation, 1800, 0);
    }

    function test_L4_NoTopUpAfterEnd() public {
        uint256 id = _campaign(150e6, 20e6);
        vm.warp(T0 + 30 days);
        vm.expectRevert(ICampaignVault.CampaignEnded.selector);
        vault.topUp(id, 1);
    }

    function test_L5_PayoutCannotBeVaultOrToken() public {
        ICampaignVault.SetPayout memory s = ICampaignVault.SetPayout(victim, address(vault), 0, block.timestamp);
        vm.expectRevert(ICampaignVault.InvalidPayout.selector);
        vault.setPayoutAddressWithSig(s, "");
        s.payout = address(usdc);
        vm.expectRevert(ICampaignVault.InvalidPayout.selector);
        vault.setPayoutAddressWithSig(s, "");
    }
}
