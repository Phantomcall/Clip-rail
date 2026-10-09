// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CampaignVaultLens} from "../src/CampaignVaultLens.sol";
import {ICampaignVault} from "../src/interfaces/ICampaignVault.sol";
import {ICreatorReputation} from "../src/interfaces/ICreatorReputation.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// Chainlink's MockKeystoneForwarder as deployed on Monad testnet (the one the oracle broadcasts through).
interface IMockForwarder {
    function report(address receiver, bytes calldata rawReport, bytes calldata ctx, bytes[] calldata sigs) external;
}

/// @notice Full regression of the deployed testnet contracts (playbook I-8.2): create → register by signature →
///         oracle report → hold → release → close. Testnet only. Addresses come from packages/abi/addresses.json.
///
/// **Fork mode** (`run`, the default): the whole lifecycle in one go against the live contracts, on a fork, so it
/// needs nobody and sends nothing. The oracle report goes through the real mock forwarder from the vault's pinned
/// `reportTransmitter`, and the hold is skipped with a time warp. Every step is checked; it ends with "SMOKE PASS".
///
///   forge script script/Smoke.s.sol --fork-url https://testnet-rpc.monad.xyz --network monad
///
/// **Live mode**, step by step on the real testnet (sends transactions; the brand is the broadcasting wallet). The
/// clipper is a throwaway key that only signs (it needs no MON): `cast wallet new`, then export SMOKE_CLIPPER_PK.
///   1. create():                  a small MockUSDC campaign with a 2-minute hold; prints its id and the claim code.
///   2. Post a new public Short with that claim code in its description (after step 1: it must be published after
///      the campaign starts), and give it a few views and likes.
///   3. register(campaignId, id):  the clipper signs RegisterClip, the brand submits it (registerClipWithSig).
///   4. Wait for the oracle: David's runner reports every few minutes; status(clipId) shows Active and the accrual.
///   5. status(clipId) again after the hold: the ops Worker's keeper normally releases on its own.
///   6. release(clipId):           releases if the keeper hasn't, and checks the clipper was paid.
///   7. close(campaignId):         the brand closes and the refund is checked to the unit.
///
///   S="forge script script/Smoke.s.sol --rpc-url https://testnet-rpc.monad.xyz --network monad --account cliprail-deployer --broadcast"
///   $S --sig "create()"
///   $S --sig "register(uint256,string)" <campaignId> <videoId>
///   forge script script/Smoke.s.sol --rpc-url https://testnet-rpc.monad.xyz --sig "status(uint256)" <clipId>
///   $S --sig "release(uint256)" <clipId>
///   $S --sig "close(uint256)" <campaignId>
contract Smoke is Script {
    CampaignVault vault;
    CampaignVaultLens lens;
    ICreatorReputation reputation;
    MockUSDC usdc;
    IMockForwarder forwarder;

    uint128 constant BUDGET = 100e6; // 100 MockUSDC
    uint128 constant CPM = 1e6; // 1 MockUSDC per 1,000 views
    uint128 constant MAX_PER_CLIP = 20e6;
    uint32 constant LIVE_HOLD = 120; // 2 minutes, so a live run finishes quickly
    uint32 constant FORK_HOLD = 600;
    uint8 constant OWNERSHIP_OK = 1;

    string constant BRIEF = '{"brandName":"Cliprail","title":"Cliprail smoke test","sourceVideoId":"",'
        '"brief":"Automated regression campaign. Not for clippers."}';

    function _load() internal {
        require(block.chainid == 10143, "testnet only");
        string memory json = vm.readFile("../packages/abi/addresses.json");
        vault = CampaignVault(vm.parseJsonAddress(json, ".10143.vault"));
        lens = CampaignVaultLens(vm.parseJsonAddress(json, ".10143.lens"));
        reputation = ICreatorReputation(vm.parseJsonAddress(json, ".10143.reputation"));
        usdc = MockUSDC(vm.parseJsonAddress(json, ".10143.mockUsdc"));
        forwarder = IMockForwarder(vm.parseJsonAddress(json, ".10143.creForwarderMock"));
        require(address(lens.vault()) == address(vault), "lens in addresses.json is not for this vault");
        require(address(vault.reputation()) == address(reputation), "reputation in addresses.json is not the vault's");
        require(vault.tokenAllowed(address(usdc)), "MockUSDC is not an allowed token");
    }

    function _params(uint32 holdSecs, uint16 minLikeBps) internal view returns (ICampaignVault.CampaignParams memory) {
        return ICampaignVault.CampaignParams({
            token: address(usdc),
            budget: BUDGET,
            cpm: CPM,
            maxPerClip: MAX_PER_CLIP,
            maxViewsPerReport: 20_000,
            minLikeBps: minLikeBps,
            holdSecs: holdSecs,
            startsAt: uint64(block.timestamp),
            endsAt: uint64(block.timestamp + 2 days),
            minTier: 0,
            briefHash: keccak256(bytes(BRIEF))
        });
    }

    function _signRegister(uint256 pk, ICampaignVault.RegisterClip memory r) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                vault.REGISTER_CLIP_TYPEHASH(),
                r.campaignId,
                keccak256(bytes(r.videoId)),
                r.clipper,
                r.nonce,
                r.deadline
            )
        );
        (uint8 v, bytes32 rr, bytes32 s) =
            vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", vault.domainSeparator(), structHash)));
        return abi.encodePacked(rr, s, v);
    }

    function _check(bool ok, string memory what) internal pure {
        require(ok, string.concat("SMOKE FAIL: ", what));
        console.log(string.concat("  ok  ", what));
    }

    // ─────────────────────────── Fork mode ───────────────────────────

    /// The whole lifecycle on a fork of the live testnet. Uses pranks and a time warp, never broadcasts.
    function run() external {
        _load();
        address brand = makeAddr("cliprail-smoke-brand");
        address relayer = makeAddr("cliprail-smoke-relayer");
        (address clipper, uint256 clipperPk) = makeAddrAndKey("cliprail-smoke-clipper");
        address transmitter = vault.reportTransmitter();
        require(clipper.code.length == 0 && brand.code.length == 0, "smoke accounts have code on this chain");
        console.log("vault      ", address(vault));
        console.log("transmitter", transmitter);

        // 1. Create: the brand mints MockUSDC, approves and creates.
        console.log("1. create");
        vm.startPrank(brand);
        usdc.mint(brand, BUDGET);
        usdc.approve(address(vault), BUDGET);
        uint256 campaignId = vault.createCampaign(_params(FORK_HOLD, 50));
        vm.stopPrank();
        ICampaignVault.Campaign memory c = vault.getCampaign(campaignId);
        _check(c.brand == brand && c.params.budget == BUDGET, "campaign created with the full budget");
        _check(usdc.balanceOf(brand) == 0, "budget pulled from the brand");

        // 2. Register by signature: the clipper signs, someone else pays the gas.
        console.log("2. register by signature");
        string memory videoId = "SmokeTest01";
        uint256 nonce = vault.nonces(clipper);
        ICampaignVault.RegisterClip memory r =
            ICampaignVault.RegisterClip(campaignId, videoId, clipper, nonce, block.timestamp + 10 minutes);
        bytes memory sig = _signRegister(clipperPk, r);
        vm.prank(relayer);
        uint256 clipId = vault.registerClipWithSig(r, sig);
        _check(vault.getClip(clipId).status == ICampaignVault.ClipStatus.Pending, "clip registered as Pending");
        _check(vault.nonces(clipper) == nonce + 1, "signature nonce consumed");
        vm.prank(relayer);
        try vault.registerClipWithSig(r, sig) {
            revert("SMOKE FAIL: a replayed signature registered again");
        } catch {
            console.log("  ok  replayed signature rejected");
        }

        // 3. Oracle report through the real forwarder from the pinned oracle wallet: activate and accrue.
        console.log("3. oracle report");
        uint64 views = 5_000;
        _report(transmitter, clipId, views, 100);
        ICampaignVault.Clip memory clip = vault.getClip(clipId);
        uint128 expected = uint128(uint256(views) * CPM / 1000); // 5 MockUSDC
        _check(clip.status == ICampaignVault.ClipStatus.Active, "clip activated by the report");
        _check(clip.accrued == expected && clip.lastViews == views, "accrued views x cpm / 1000");
        _check(vault.getCampaign(campaignId).reserved == expected, "campaign reserved the accrual");

        // A report from anyone else is swallowed by the forwarder and changes nothing.
        _report(makeAddr("cliprail-smoke-attacker"), clipId, 15_000, 300);
        _check(vault.getClip(clipId).accrued == expected, "forged report changed nothing");

        // 4. Hold: nothing is releasable until it ends.
        console.log("4. hold");
        _check(!_releasable(clipId), "not releasable during the hold");
        vm.warp(block.timestamp + FORK_HOLD + 1);
        _check(_releasable(clipId), "releasable once the hold ends (lens)");

        // 5. Release: anyone can call it; the clipper gets paid and reputation records it.
        console.log("5. release");
        ICreatorReputation.Stats memory before = reputation.stats(clipper);
        uint256[] memory ids = new uint256[](1);
        ids[0] = clipId;
        vm.prank(relayer);
        vault.release(ids);
        _check(usdc.balanceOf(clipper) == expected, "clipper received the accrual");
        _check(vault.getClip(clipId).released == expected, "clip released == accrued");
        ICreatorReputation.Stats memory afterStats = reputation.stats(clipper);
        _check(afterStats.paidViews == before.paidViews + views, "reputation paidViews +5,000");
        _check(
            afterStats.earned == before.earned + expected && afterStats.clipsPaid == before.clipsPaid + 1,
            "reputation earned and clipsPaid"
        );
        vm.prank(relayer);
        vault.release(ids);
        _check(usdc.balanceOf(clipper) == expected, "a second release pays nothing");

        // 6. Close: the brand gets back exactly budget - reserved - paid.
        console.log("6. close");
        c = vault.getCampaign(campaignId);
        uint256 refund = c.params.budget - c.reserved - c.paid;
        vm.prank(brand);
        vault.closeCampaign(campaignId);
        _check(usdc.balanceOf(brand) == refund, "refund exact to the unit (95 MockUSDC)");
        _check(vault.getCampaign(campaignId).status == ICampaignVault.CampaignStatus.Closed, "campaign Closed");
        vm.prank(relayer);
        vault.sweep(ids);
        _check(
            vault.getClip(clipId).status == ICampaignVault.ClipStatus.Ended, "sweep ends the clip of a closed campaign"
        );

        console.log("SMOKE PASS");
    }

    function _report(address from, uint256 clipId, uint64 views, uint64 likes) internal {
        ICampaignVault.ClipUpdate[] memory us = new ICampaignVault.ClipUpdate[](1);
        us[0] = ICampaignVault.ClipUpdate(clipId, views, likes, uint64(block.timestamp), OWNERSHIP_OK);
        uint64 round = vault.lastRound() + 1;
        // 109-byte forwarder header (version, executionId, timestamp, donId, configVersion, cid, name, owner,
        // reportId), then the report body: what the CRE runtime hands MockKeystoneForwarder.report.
        bytes memory raw = bytes.concat(
            bytes1(0x01),
            keccak256(abi.encode(round, "smoke")),
            bytes4(uint32(block.timestamp)),
            bytes4(0),
            bytes4(0),
            bytes32(0),
            bytes10("cliprail"),
            bytes20(address(0)),
            bytes2(0x0001),
            abi.encode(round, us)
        );
        vm.prank(from, from); // an EOA broadcasting: msg.sender == tx.origin
        forwarder.report(address(vault), raw, "", new bytes[](0));
    }

    function _releasable(uint256 clipId) internal view returns (bool) {
        for (uint256 offset; offset < 5_000; offset += 200) {
            uint256[] memory raw = vault.keeperList(ICampaignVault.KeeperList.Pay, offset, 200);
            uint256[] memory ids = lens.releasableClips(offset, 200);
            for (uint256 i; i < ids.length; ++i) {
                if (ids[i] == clipId) return true;
            }
            if (raw.length < 200) break;
        }
        return false;
    }

    // ─────────────────────────── Live mode ───────────────────────────

    function _clipperPk() internal view returns (uint256 pk) {
        pk = vm.envUint("SMOKE_CLIPPER_PK");
        require(vm.addr(pk).code.length == 0, "SMOKE_CLIPPER_PK's address has code (EIP-7702?): use a fresh key");
    }

    /// Step 1: the broadcasting wallet creates a small campaign as the brand. minLikeBps is 0, so a fresh Short with
    /// few likes still accrues.
    function create() external {
        _load();
        address clipper = vm.addr(_clipperPk());
        ICampaignVault.CampaignParams memory p = _params(LIVE_HOLD, 0);
        vm.startBroadcast();
        (, address brand,) = vm.readCallers();
        usdc.mint(brand, BUDGET);
        usdc.approve(address(vault), BUDGET);
        uint256 id = vault.createCampaign(p);
        vm.stopBroadcast();
        console.log("campaignId ", id);
        console.log("brand      ", brand);
        console.log("clipper    ", clipper);
        console.log("startsAt   ", p.startsAt);
        console.log("Put this claim code in the new Short's description:", lens.claimCode(id, clipper));
    }

    /// Step 3: the clipper signs, the broadcasting wallet submits (the relayer's job in the app).
    function register(uint256 campaignId, string calldata videoId) external {
        _load();
        uint256 pk = _clipperPk();
        address clipper = vm.addr(pk);
        ICampaignVault.RegisterClip memory r = ICampaignVault.RegisterClip(
            campaignId, videoId, clipper, vault.nonces(clipper), block.timestamp + 30 minutes
        );
        bytes memory sig = _signRegister(pk, r);
        vm.startBroadcast();
        uint256 clipId = vault.registerClipWithSig(r, sig);
        vm.stopBroadcast();
        require(vault.getClip(clipId).status == ICampaignVault.ClipStatus.Pending, "SMOKE FAIL: clip not Pending");
        console.log("clipId     ", clipId);
        console.log("claim code ", lens.claimCode(campaignId, clipper));
        console.log("Next: wait for the oracle's next report, then status(clipId).");
    }

    /// Steps 4-5: read-only.
    function status(uint256 clipId) external {
        _load();
        ICampaignVault.Clip memory clip = vault.getClip(clipId);
        string[6] memory names = ["None", "Pending", "Active", "Flagged", "Rejected", "Ended"];
        console.log("status     ", names[uint8(clip.status)]);
        console.log("lastViews  ", clip.lastViews);
        console.log("lastLikes  ", clip.lastLikes);
        console.log("accrued    ", clip.accrued);
        console.log("released   ", clip.released);
        uint64 next = vault.nextUnlockAt(clipId);
        if (next == type(uint64).max) console.log("nothing left to release");
        else console.log("next unlock in (s)", next > block.timestamp ? next - block.timestamp : 0);
        console.log("clipper MockUSDC", usdc.balanceOf(clip.clipper));
    }

    /// Step 6: releases if the keeper hasn't already, then checks the clipper holds what was released.
    function release(uint256 clipId) external {
        _load();
        ICampaignVault.Clip memory clip = vault.getClip(clipId);
        require(
            clip.accrued > 0, "SMOKE FAIL: nothing accrued yet (has the oracle reported? does the Short have views?)"
        );
        uint64 next = vault.nextUnlockAt(clipId);
        if (clip.released == 0 && next > block.timestamp) {
            console.log("still in hold; run release again in (s)", next - block.timestamp);
            return;
        }
        if (clip.released < clip.accrued && next <= block.timestamp) {
            uint256[] memory ids = new uint256[](1);
            ids[0] = clipId;
            vm.startBroadcast();
            vault.release(ids);
            vm.stopBroadcast();
            clip = vault.getClip(clipId);
        } else {
            console.log("already released (the keeper did it)");
        }
        require(clip.released > 0, "SMOKE FAIL: nothing released");
        require(usdc.balanceOf(clip.clipper) >= clip.released, "SMOKE FAIL: clipper doesn't hold the payout");
        console.log("released   ", clip.released);
        console.log("clipper MockUSDC", usdc.balanceOf(clip.clipper));
    }

    /// Step 7: the brand closes; the refund must be exactly budget - reserved - paid.
    function close(uint256 campaignId) external {
        _load();
        ICampaignVault.Campaign memory c = vault.getCampaign(campaignId);
        uint256 refund = c.params.budget - c.reserved - c.paid;
        uint256 before = usdc.balanceOf(c.brand);
        vm.startBroadcast();
        vault.closeCampaign(campaignId);
        vm.stopBroadcast();
        require(usdc.balanceOf(c.brand) == before + refund, "SMOKE FAIL: refund is not budget - reserved - paid");
        require(vault.getCampaign(campaignId).status == ICampaignVault.CampaignStatus.Closed, "SMOKE FAIL: not Closed");
        console.log("refund     ", refund);
        console.log("SMOKE PASS (live)");
    }
}
