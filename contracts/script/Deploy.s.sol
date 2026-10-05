// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {CampaignVault} from "../src/CampaignVault.sol";
import {CreatorReputation} from "../src/CreatorReputation.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Reputation → Vault → addVault → allow tokens → pin the oracle wallet → guardian → (mainnet) hand the
///         vault AND Reputation to a 24 h TimelockController (I-2.6, I-4.1, audit M-2). Reputation's owner can
///         only add or remove vaults, so reputation survives a vault redeploy; nobody can edit stats.
///
/// Env: ORACLE_ADDRESS (required): the cliprail-oracle wallet that broadcasts `cre workflow simulate --broadcast`.
///      GUARDIAN (optional, default: deployer): may pause, never unpause.
///      TIMELOCK_DELAY (optional, default: 86400 on mainnet, 0 = no timelock on testnet).
///      PENDING_TIMEOUT / RESOLVE_WINDOW (optional, seconds; defaults: testnet 600 / 1800, mainnet 172800 / 172800).
///      WRITE_ADDRESSES (optional, default: true): write the deployed addresses into packages/abi/addresses.json.
///      PROPOSER (optional, default: deployer): who may schedule and cancel owner actions. Use a team multisig on
///      mainnet. Anyone may execute a scheduled action once its delay has passed.
///
/// Testnet:  ORACLE_ADDRESS=0x… forge script script/Deploy.s.sol --rpc-url monadTestnet --account cliprail-deployer --broadcast
/// Mainnet rehearsal (I-3.6): anvil --fork-url https://rpc.monad.xyz, then --rpc-url http://localhost:8545
contract Deploy is Script {
    string constant ADDRESSES_JSON = "../packages/abi/addresses.json";

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
        // Testnet: a 10-minute pending timeout so the judge sandbox can show a rejection.
        uint64 pendingTimeout = uint64(vm.envOr("PENDING_TIMEOUT", mainnet ? uint256(172_800) : uint256(600)));
        uint64 resolveWindow = uint64(vm.envOr("RESOLVE_WINDOW", mainnet ? uint256(172_800) : uint256(1_800)));
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        uint256 delay = vm.envOr("TIMELOCK_DELAY", mainnet ? uint256(1 days) : uint256(0));

        vm.startBroadcast();
        // The broadcasting wallet. Forge rejects msg.sender inside a broadcast when deploying with --account.
        (, address deployer,) = vm.readCallers();
        address guardian = vm.envOr("GUARDIAN", deployer);

        CreatorReputation reputation = new CreatorReputation();
        CampaignVault vault = new CampaignVault(forwarder, reputation, pendingTimeout, resolveWindow);
        reputation.addVault(address(vault));

        address mockUsdc;
        if (mainnet) {
            vault.setTokenAllowed(MAINNET_USDC, true);
            vault.setTokenAllowed(MAINNET_AUSD, true);
        } else {
            mockUsdc = address(new MockUSDC());
            vault.setTokenAllowed(mockUsdc, true);
            vault.setTokenAllowed(TESTNET_USDC, true);
            vault.setTokenAllowed(TESTNET_AUSD, true);
            console.log("mockUsdc  ", mockUsdc);
        }

        // The mock forwarder is permissionless: only reports broadcast by our oracle wallet are accepted.
        vault.setReportTransmitter(oracle);
        vault.setGuardian(guardian);

        if (delay > 0) {
            address[] memory proposers = new address[](1);
            proposers[0] = vm.envOr("PROPOSER", deployer);
            address[] memory executors = new address[](1); // address(0) = anyone can execute after the delay
            TimelockController timelock = new TimelockController(delay, proposers, executors, address(0));
            vault.transferOwnership(address(timelock));
            reputation.transferOwnership(address(timelock));
            console.log("timelock  ", address(timelock));
        }

        vm.stopBroadcast();

        console.log("chainId   ", block.chainid);
        console.log("startBlock", block.number); // Envio start block (the deploy lands in this block or the next)
        console.log("reputation", address(reputation));
        console.log("vault     ", address(vault));
        console.log("oracle    ", oracle);
        console.log("guardian  ", guardian);
        console.log("pendingTimeout", pendingTimeout);

        if (vm.envOr("WRITE_ADDRESSES", true) && (block.chainid == 143 || block.chainid == 10143)) {
            _writeAddress(".vault", address(vault));
            _writeAddress(".reputation", address(reputation));
            if (mockUsdc != address(0)) _writeAddress(".mockUsdc", mockUsdc);
            console.log("wrote packages/abi/addresses.json");
        }
    }

    function _writeAddress(string memory field, address value) internal {
        string memory key = string.concat(".", vm.toString(block.chainid), field);
        vm.writeJson(string.concat('"', vm.toString(value), '"'), ADDRESSES_JSON, key);
    }
}
