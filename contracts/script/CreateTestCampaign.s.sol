// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ICampaignVault} from "../src/interfaces/ICampaignVault.sol";

/// @notice Testnet only: mints MockUSDC and creates the test campaign used for the oracle dry run (I-2.7), the M1
///         loop test and the judge sandbox. Same rules as the live campaign (Appendix 3) except a 10-minute hold.
///
/// Reads the vault and MockUSDC from packages/abi/addresses.json. Refuses to run unless the vault has no campaigns
/// yet (EXPECT_CAMPAIGN_ID, default 1), so the claim code shared with the team can't silently change.
///
///   forge script script/CreateTestCampaign.s.sol --rpc-url https://testnet-rpc.monad.xyz \
///     --account cliprail-deployer --broadcast
contract CreateTestCampaign is Script {
    string constant BRIEF =
        "Cliprail testnet test campaign: post any original Short with your claim code in the description.";

    function run() external {
        require(block.chainid == 10143, "testnet only");
        string memory json = vm.readFile("../packages/abi/addresses.json");
        CampaignVault vault = CampaignVault(vm.parseJsonAddress(json, ".10143.vault"));
        MockUSDC usdc = MockUSDC(vm.parseJsonAddress(json, ".10143.mockUsdc"));

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
            startsAt: uint64(block.timestamp),
            endsAt: uint64(block.timestamp + 30 days),
            minTier: 0,
            briefHash: keccak256(bytes(BRIEF))
        });

        vm.startBroadcast();
        (, address brand,) = vm.readCallers();
        usdc.mint(brand, p.budget);
        usdc.approve(address(vault), p.budget);
        uint256 id = vault.createCampaign(p);
        vm.stopBroadcast();

        console.log("campaignId", id);
        console.log("brand     ", brand);
        console.log("startsAt  ", p.startsAt);
        console.log("endsAt    ", p.endsAt);
        console.log("brief     ", BRIEF);
        console.log("claim code for the brand wallet:", vault.claimCode(id, brand));
    }
}
