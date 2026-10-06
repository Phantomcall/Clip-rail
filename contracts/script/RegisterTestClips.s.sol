// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CampaignVaultLens} from "../src/CampaignVaultLens.sol";

/// @notice Testnet only: registers the team's test Shorts on the test campaign (I-2.7) from the broadcasting wallet,
///         whose claim code must be in each Short's description. Pending clips are capped at 3 per clipper per
///         campaign, so pass at most 3.
///
///   VIDEO_IDS=id1,id2,id3 forge script script/RegisterTestClips.s.sol --rpc-url https://testnet-rpc.monad.xyz \
///     --account cliprail-deployer --broadcast
contract RegisterTestClips is Script {
    function run() external {
        require(block.chainid == 10143, "testnet only");
        string memory json = vm.readFile("../packages/abi/addresses.json");
        CampaignVault vault = CampaignVault(vm.parseJsonAddress(json, ".10143.vault"));
        CampaignVaultLens lens = CampaignVaultLens(vm.parseJsonAddress(json, ".10143.lens"));
        uint256 campaignId = vm.envOr("CAMPAIGN_ID", uint256(1));
        string[] memory ids = vm.envString("VIDEO_IDS", ",");
        require(ids.length > 0 && ids.length <= 3, "pass 1 to 3 video ids");

        vm.startBroadcast();
        (, address clipper,) = vm.readCallers();
        uint256[] memory clipIds = new uint256[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            clipIds[i] = vault.registerClip(campaignId, ids[i]);
        }
        vm.stopBroadcast();

        console.log("campaignId", campaignId);
        console.log("clipper   ", clipper);
        console.log("claim code", lens.claimCode(campaignId, clipper));
        for (uint256 i; i < ids.length; ++i) {
            console.log(string.concat("clip ", vm.toString(clipIds[i]), "  video ", ids[i]));
        }
    }
}
