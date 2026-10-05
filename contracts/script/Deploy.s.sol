// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CreatorReputation} from "../src/CreatorReputation.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Reputation → Vault → setVault → renounce Reputation ownership → allow tokens → pin the oracle wallet →
///         guardian → (mainnet) hand the vault to a 24 h TimelockController (I-2.6, I-4.1, audit M-2).
///
/// Env: ORACLE_ADDRESS (required): the cliprail-oracle wallet that broadcasts `cre workflow simulate --broadcast`.
///      GUARDIAN (optional, default: deployer): may pause, never unpause.
///      TIMELOCK_DELAY (optional, default: 86400 on mainnet, 0 = no timelock on testnet).
///
/// Testnet:  ORACLE_ADDRESS=0x… forge script script/Deploy.s.sol --rpc-url monadTestnet --account cliprail-deployer --broadcast
/// Mainnet rehearsal (I-3.6): anvil --fork-url https://rpc.monad.xyz, then --rpc-url http://localhost:8545
/// TODO I-2.6: write addresses into packages/abi/addresses.json.
contract Deploy is Script {
    // Testnet (10143)
    address constant TESTNET_FORWARDER_MOCK = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    address constant TESTNET_USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address constant TESTNET_AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    // Mainnet (143)
    address constant MAINNET_FORWARDER_MOCK = 0x9eF6468C5f37b976E57d52054c693269479A784d;
    address constant MAINNET_USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant MAINNET_AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;

    function run() external {
        bool mainnet = block.chainid == 143;
        address forwarder = mainnet ? MAINNET_FORWARDER_MOCK : TESTNET_FORWARDER_MOCK;
        uint64 timeout = mainnet ? 172_800 : 1_800;
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        uint256 delay = vm.envOr("TIMELOCK_DELAY", mainnet ? uint256(1 days) : uint256(0));

        vm.startBroadcast();
        address deployer = msg.sender;
        address guardian = vm.envOr("GUARDIAN", deployer);

        CreatorReputation reputation = new CreatorReputation();
        CampaignVault vault = new CampaignVault(forwarder, reputation, timeout, timeout);
        reputation.setVault(address(vault));
        reputation.renounceOwnership(); // nothing left to administer: the vault is its only writer

        if (mainnet) {
            vault.setTokenAllowed(MAINNET_USDC, true);
            vault.setTokenAllowed(MAINNET_AUSD, true);
        } else {
            MockUSDC mock = new MockUSDC();
            vault.setTokenAllowed(address(mock), true);
            vault.setTokenAllowed(TESTNET_USDC, true);
            vault.setTokenAllowed(TESTNET_AUSD, true);
            console.log("mockUsdc  ", address(mock));
        }

        // The mock forwarder is permissionless: only reports broadcast by our oracle wallet are accepted.
        vault.setReportTransmitter(oracle);
        vault.setGuardian(guardian);

        if (delay > 0) {
            address[] memory roles = new address[](1);
            roles[0] = deployer;
            TimelockController timelock = new TimelockController(delay, roles, roles, address(0));
            vault.transferOwnership(address(timelock));
            console.log("timelock  ", address(timelock));
        }

        vm.stopBroadcast();

        console.log("chainId   ", block.chainid);
        console.log("reputation", address(reputation));
        console.log("vault     ", address(vault));
        console.log("oracle    ", oracle);
        console.log("guardian  ", guardian);
    }
}
