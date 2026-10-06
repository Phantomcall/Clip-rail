// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CampaignVaultLens} from "../src/CampaignVaultLens.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ICampaignVault} from "../src/interfaces/ICampaignVault.sol";

/// @notice Testnet only: mints MockUSDC and creates the test campaign used for the oracle dry run (I-2.7), the M1
///         loop test and the judge sandbox. Same rules as the live campaign (Appendix 3) except a 10-minute hold.
///
/// Reads the vault, lens and MockUSDC from packages/abi/addresses.json. Guards, so the claim code shared with the team
/// can't silently change:
///   EXPECT_CAMPAIGN_ID (default 1)  the vault must be about to create exactly this id
///   EXPECT_CLAIM_CODE  (optional)   the brand wallet's claim code must equal this, e.g. CR-0E9A273285510A02
///   START_AT           (optional)   unix start time; backdate it so Shorts already posted (after that time) activate
///
///   START_AT=1791236593 EXPECT_CLAIM_CODE=CR-0E9A273285510A02 \
///   forge script script/CreateTestCampaign.s.sol --rpc-url https://testnet-rpc.monad.xyz \
///     --account cliprail-deployer --broadcast
contract CreateTestCampaign is Script {
    /// Same shape and key order as the web wizard's JSON.stringify({brandName, title, sourceVideoId, brief}), so the
    /// app reads this campaign like any campaign created in the app.
    string constant BRIEF = '{"brandName":"Cliprail","title":"Cliprail test campaign","sourceVideoId":"",'
        '"brief":"Cliprail testnet test campaign: post any original Short with your claim code in the description."}';

    function run() external {
        require(block.chainid == 10143, "testnet only");
        string memory json = vm.readFile("../packages/abi/addresses.json");
        CampaignVault vault = CampaignVault(vm.parseJsonAddress(json, ".10143.vault"));
        MockUSDC usdc = MockUSDC(vm.parseJsonAddress(json, ".10143.mockUsdc"));
        CampaignVaultLens lens = CampaignVaultLens(vm.parseJsonAddress(json, ".10143.lens"));
        require(address(lens.vault()) == address(vault), "lens in addresses.json is not for this vault");

        uint256 expectedId = vm.envOr("EXPECT_CAMPAIGN_ID", uint256(1));
        require(vault.campaignCount() + 1 == expectedId, "campaign id would differ from EXPECT_CAMPAIGN_ID");

        ICampaignVault.CampaignParams memory p = ICampaignVault.CampaignParams({
            token: address(usdc),
            budget: 1_000e6, // 1,000 MockUSDC
            cpm: 1e6, // $1 per 1,000 views
            maxPerClip: 20e6, // $20
            maxViewsPerReport: 20_000,
            minLikeBps: 50, // 0.5%
            holdSecs: 600, // 10 minutes, so M1 sees a payout
            startsAt: uint64(vm.envOr("START_AT", block.timestamp)),
            endsAt: uint64(block.timestamp + 30 days),
            minTier: 0,
            briefHash: keccak256(bytes(BRIEF))
        });

        require(p.startsAt <= block.timestamp, "START_AT is in the future");

        vm.startBroadcast(); // the guards below are view calls: nothing is sent if they fail
        (, address brand,) = vm.readCallers();
        string memory code = lens.claimCode(expectedId, brand);
        string memory expectedCode = vm.envOr("EXPECT_CLAIM_CODE", string(""));
        require(
            bytes(expectedCode).length == 0 || keccak256(bytes(code)) == keccak256(bytes(expectedCode)),
            "claim code would differ from EXPECT_CLAIM_CODE (wrong wallet?)"
        );

        usdc.mint(brand, p.budget);
        usdc.approve(address(vault), p.budget);
        uint256 id = vault.createCampaign(p);
        vm.stopBroadcast();

        console.log("campaignId", id);
        console.log("brand     ", brand);
        console.log("startsAt  ", p.startsAt);
        console.log("endsAt    ", p.endsAt);
        console.log("brief     ", BRIEF);
        console.log("briefHash ");
        console.logBytes32(p.briefHash);
        console.log("claim code for the brand wallet:", code);
    }
}
