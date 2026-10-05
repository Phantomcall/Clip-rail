// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICreatorReputation} from "./interfaces/ICreatorReputation.sol";

/// @notice The one thing CreatorReputation asks of a vault: that it was built for this reputation contract.
interface IReputationLinked {
    function reputation() external view returns (address);
}

/// @title CreatorReputation
/// @notice Append-only clipper stats written only by authorised CampaignVaults on release or rejection.
/// @dev The owner (a 24 h TimelockController on mainnet) can only add or remove vaults, so reputation survives a
///      vault redeploy (I-5.2). Nobody can edit stats directly. An old vault keeps write access until it is removed,
///      so its outstanding releases can still record payouts.
contract CreatorReputation is ICreatorReputation, Ownable {
    mapping(address vault => bool) public override isVault;

    // slither-disable-next-line uninitialized-state (written by recordPaid/recordRejection in I-2.4)
    mapping(address clipper => Stats) internal _stats;
    mapping(address clipper => mapping(address brand => bool)) public paidBy;

    modifier onlyVault() {
        if (!isVault[msg.sender]) revert NotVault();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function addVault(address vault_) external override onlyOwner {
        if (isVault[vault_] || vault_.code.length == 0) revert InvalidVault();
        try IReputationLinked(vault_).reputation() returns (address linked) {
            if (linked != address(this)) revert InvalidVault();
        } catch {
            revert InvalidVault();
        }
        isVault[vault_] = true;
        emit VaultAdded(vault_);
    }

    function removeVault(address vault_) external override onlyOwner {
        if (!isVault[vault_]) revert InvalidVault();
        isVault[vault_] = false;
        emit VaultRemoved(vault_);
    }

    /// @dev TODO I-2.4
    function recordPaid(address, address, uint64, uint128) external view override onlyVault {
        revert("TODO I-2.4");
    }

    /// @dev TODO I-2.4
    function recordRejection(address) external view override onlyVault {
        revert("TODO I-2.4");
    }

    function stats(address clipper) external view override returns (Stats memory) {
        return _stats[clipper];
    }

    /// @dev TODO I-2.4 (tier 2 denominator still to be agreed)
    function tier(address) external pure override returns (uint8) {
        return 0;
    }
}
