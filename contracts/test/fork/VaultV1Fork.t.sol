// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CampaignVault} from "../../src/CampaignVault.sol";
import {CampaignVaultLens} from "../../src/CampaignVaultLens.sol";
import {CreatorReputation} from "../../src/CreatorReputation.sol";
import {ICampaignVault} from "../../src/interfaces/ICampaignVault.sol";

/// Circle's FiatToken v2 admin surface (the real testnet USDC).
interface IFiatToken is IERC20 {
    function configureMinter(address minter, uint256 allowance) external returns (bool);
    function mint(address to, uint256 amount) external returns (bool);
    function blacklist(address account) external;
    function pause() external;
    function unpause() external;
}

/// Chainlink's MockKeystoneForwarder as deployed on Monad testnet (the one the oracle uses).
interface IMockForwarder {
    function report(address receiver, bytes calldata rawReport, bytes calldata ctx, bytes[] calldata sigs) external;
    function route(bytes32 id, address transmitter, address receiver, bytes calldata meta, bytes calldata rep)
        external
        returns (bool);
}

/// v1 against the real Monad testnet contracts: Circle USDC (blacklist, pause) and Chainlink's mock forwarder.
/// Opt in with MONAD_TESTNET_FORK=<rpc url>; skipped otherwise (CI has no RPC).
contract VaultV1ForkTest is Test {
    IFiatToken constant USDC = IFiatToken(0x534b2f3A21130d7a60830c2Df862319e593943A3);
    IMockForwarder constant FORWARDER = IMockForwarder(0xB9F79d863261869B234c481D1f9A7af84AeAd192);
    address constant MASTER_MINTER = 0x87f2e95621D8f12b83bb4a3E9975c0eAd524D437;
    address constant BLACKLISTER = 0xA5a9723c4D658a6F92701ce3A5246Fa7d4723c26;
    address constant PAUSER = 0x7A154EA9156D354504ad9A401380AA548039BE8b;
    uint256 constant FORK_BLOCK = 68_734_103;
    uint32 constant HOLD = 600;

    address oracle = makeAddr("oracle");
    address brand = makeAddr("brand");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address safe = makeAddr("safe");

    CreatorReputation reputation;
    CampaignVault vault;
    CampaignVaultLens lens;
    uint64 round;
    uint256 campaign;

    function setUp() public {
        string memory rpc = vm.envOr("MONAD_TESTNET_FORK", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc, FORK_BLOCK);

        reputation = new CreatorReputation();
        vault = new CampaignVault(address(FORWARDER), reputation, 600, 1800);
        lens = new CampaignVaultLens(vault);
        reputation.addVault(address(vault));
        vault.setTokenAllowed(address(USDC), true);
        vault.setReportTransmitter(oracle);

        // Mint real USDC to the brand through Circle's own minter flow.
        vm.prank(MASTER_MINTER);
        USDC.configureMinter(address(this), 1_000e6);
        USDC.mint(brand, 1_000e6);

        vm.startPrank(brand);
        USDC.approve(address(vault), 100e6);
        campaign = vault.createCampaign(
            ICampaignVault.CampaignParams({
                token: address(USDC),
                budget: 100e6,
                cpm: 1e6,
                maxPerClip: 20e6,
                maxViewsPerReport: 20_000,
                minLikeBps: 50,
                holdSecs: HOLD,
                startsAt: uint64(block.timestamp),
                endsAt: uint64(block.timestamp + 7 days),
                minTier: 0,
                briefHash: keccak256("fork")
            })
        );
        vm.stopPrank();
    }

    // ─────────────────────────── helpers ───────────────────────────

    /// 109-byte forwarder header (version, executionId, timestamp, donId, configVersion, cid, name, owner, reportId)
    /// followed by the vault's report body, exactly what the CRE runtime hands MockKeystoneForwarder.report.
    function _raw(bytes memory body) internal returns (bytes memory) {
        return bytes.concat(
            bytes1(0x01),
            keccak256(abi.encode(++round, "exec")),
            bytes4(uint32(block.timestamp)),
            bytes4(0),
            bytes4(0),
            bytes32(0),
            bytes10("cliprail"),
            bytes20(address(0)),
            bytes2(0x0001),
            body
        );
    }

    function _send(address from, ICampaignVault.ClipUpdate[] memory us) internal {
        bytes memory raw = _raw(abi.encode(round + 1, us));
        vm.prank(from, from); // an EOA broadcasting: msg.sender == tx.origin
        FORWARDER.report(address(vault), raw, "", new bytes[](0));
    }

    function _update(uint256 clipId, uint64 views) internal view returns (ICampaignVault.ClipUpdate[] memory us) {
        us = new ICampaignVault.ClipUpdate[](1);
        us[0] = ICampaignVault.ClipUpdate(clipId, views, views / 10, uint64(block.timestamp), 1);
    }

    function _register(address who, string memory videoId) internal returns (uint256 id) {
        vm.prank(who);
        id = vault.registerClip(campaign, videoId);
        _send(oracle, _update(id, 0)); // activate
    }

    function _two(uint256 a, uint256 b) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
    }

    function _solvent() internal view {
        ICampaignVault.Campaign memory c = vault.getCampaign(campaign);
        assertEq(USDC.balanceOf(address(vault)), c.params.budget - c.paid, "vault USDC != budget - paid");
    }

    // ─────────────────────────── tests ───────────────────────────

    /// The full loop through the real forwarder and real USDC: activate, accrue, mature, release.
    function test_Fork_ReportThroughRealForwarderThenRelease() public {
        uint256 clip = _register(alice, "aaaaaaaaaaa");
        assertEq(uint8(vault.getClip(clip).status), uint8(ICampaignVault.ClipStatus.Active));
        _send(oracle, _update(clip, 5_000));
        assertEq(vault.getClip(clip).accrued, 5e6);

        vm.warp(block.timestamp + HOLD);
        assertEq(lens.releasableClips(0, 10)[0], clip);
        vault.release(lens.releasableClips(0, 10));
        assertEq(USDC.balanceOf(alice), 5e6);
        assertEq(reputation.stats(alice).paidViews, 5_000);
        _solvent();
    }

    /// The real forwarder is permissionless (report and even route are public). Only the oracle wallet gets in, and
    /// the forwarder swallows the vault's revert, so the attacker's transaction "succeeds" while changing nothing.
    function test_Fork_ForgedReportsChangeNothing() public {
        uint256 clip = _register(alice, "aaaaaaaaaaa");
        address attacker = makeAddr("attacker");

        _send(attacker, _update(clip, 20_000)); // through report()
        vm.prank(attacker, attacker);
        bool ok =
            FORWARDER.route(bytes32(0), attacker, address(vault), "", abi.encode(round + 50, _update(clip, 20_000)));
        assertFalse(ok);

        assertEq(vault.getClip(clip).accrued, 0);
        assertEq(vault.getClip(clip).lastViews, 0);
    }

    /// R-1 with Circle's real blacklist: the blacklisted clipper is skipped, everyone else in the batch is paid.
    function test_Fork_RealBlacklistDoesNotBlockBatch() public {
        uint256 a = _register(alice, "aaaaaaaaaaa");
        uint256 b = _register(bob, "bbbbbbbbbbb");
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](2);
        us[0] = ICampaignVault.ClipUpdate(a, 4_000, 400, uint64(block.timestamp), 1);
        us[1] = ICampaignVault.ClipUpdate(b, 3_000, 300, uint64(block.timestamp), 1);
        _send(oracle, us);

        vm.prank(BLACKLISTER);
        USDC.blacklist(bob);
        vm.warp(block.timestamp + HOLD);

        vm.expectEmit(address(vault));
        emit ICampaignVault.ReleaseFailed(b, bob, 3e6);
        vault.release(_two(a, b));
        assertEq(USDC.balanceOf(alice), 4e6);
        assertEq(vault.getClip(b).released, 0);
        assertEq(lens.releasableClips(0, 10).length, 1); // bob stays owed
        _solvent();
    }

    /// If Circle pauses USDC, payouts fail softly (nothing reverts, nothing is lost) and go through after unpause.
    function test_Fork_UsdcPausedThenUnpaused() public {
        uint256 a = _register(alice, "aaaaaaaaaaa");
        _send(oracle, _update(a, 5_000));
        vm.warp(block.timestamp + HOLD);

        vm.prank(PAUSER);
        USDC.pause();
        vault.release(lens.releasableClips(0, 10));
        assertEq(vault.getClip(a).released, 0);

        vm.prank(PAUSER);
        USDC.unpause();
        vault.release(lens.releasableClips(0, 10));
        assertEq(USDC.balanceOf(alice), 5e6);
        _solvent();
    }

    /// R-2 with the real blacklist: a blacklisted brand can't close to itself, but can close to a safe address, and a
    /// later reject's returned budget goes there too.
    function test_Fork_BlacklistedBrandRefundAndLateReject() public {
        uint256 a = _register(alice, "aaaaaaaaaaa");
        _send(oracle, _update(a, 5_000));

        vm.prank(BLACKLISTER);
        USDC.blacklist(brand);

        vm.prank(brand);
        vm.expectRevert(); // FiatToken: "Blacklistable: account is blacklisted"
        vault.closeCampaign(campaign);

        vm.prank(brand);
        vault.closeCampaignTo(campaign, safe);
        assertEq(USDC.balanceOf(safe), 95e6);

        vm.startPrank(brand);
        vault.flag(a, "bots");
        vault.resolve(a, true);
        vm.stopPrank();
        assertEq(USDC.balanceOf(safe), 100e6);
        assertEq(USDC.balanceOf(address(vault)), 0);
        _solvent();
    }

    /// V1-1 on the real token: a flag after maturity pays the matured part to the clipper first.
    function test_Fork_FlagPaysMaturedFirst() public {
        uint256 a = _register(alice, "aaaaaaaaaaa");
        _send(oracle, _update(a, 5_000));
        vm.warp(block.timestamp + HOLD / 2);
        _send(oracle, _update(a, 8_000));
        vm.warp(block.timestamp + HOLD / 2); // first tranche matured, second still in hold

        vm.startPrank(brand);
        vault.flag(a, "x");
        vault.resolve(a, true);
        vm.stopPrank();
        assertEq(USDC.balanceOf(alice), 5e6);
        assertEq(vault.getCampaign(campaign).reserved, 0);
        _solvent();
    }
}
