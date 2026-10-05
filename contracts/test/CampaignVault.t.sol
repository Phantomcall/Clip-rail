// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CreatorReputation} from "../src/CreatorReputation.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ICreatorReputation} from "../src/interfaces/ICreatorReputation.sol";

contract CampaignVaultTest is Test {
    address constant FORWARDER = address(0xF0);

    CreatorReputation reputation;
    CampaignVault vault;
    MockUSDC usdc;

    function setUp() public {
        reputation = new CreatorReputation();
        vault = new CampaignVault(FORWARDER, reputation, 1800, 1800);
        reputation.setVault(address(vault));
        usdc = new MockUSDC();
        vault.setTokenAllowed(address(usdc), true);
    }

    function test_Wiring() public view {
        assertEq(vault.getForwarderAddress(), FORWARDER);
        assertEq(reputation.vault(), address(vault));
        assertTrue(vault.tokenAllowed(address(usdc)));
        assertEq(vault.pendingTimeout(), 1800);
    }

    function test_SetVaultOnlyOnce() public {
        vm.expectRevert(ICreatorReputation.VaultAlreadySet.selector);
        reputation.setVault(address(1));
    }

    /// Vector = keccak256(encodePacked(uint256 1, address 0x…dEaD))[:8]; pinned identically in packages/shared tests.
    function test_ClaimCodeMatchesShared() public view {
        assertEq(vault.claimCode(1, 0x000000000000000000000000000000000000dEaD), "CR-09DAD21282658239");
    }

    function test_ClaimCodeShape(uint256 campaignId, address clipper) public view {
        bytes memory code = bytes(vault.claimCode(campaignId, clipper));
        assertEq(code.length, 19);
        assertEq(code[2], bytes1("-"));
    }

    function test_OnReportRejectsNonForwarder() public {
        vm.expectRevert();
        vault.onReport("", abi.encode(uint64(1), new bytes(0)));
    }
}
