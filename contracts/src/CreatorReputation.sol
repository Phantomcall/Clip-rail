// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICreatorReputation} from "./interfaces/ICreatorReputation.sol";

/// @title CreatorReputation
/// @notice Append-only clipper stats written only by the CampaignVault on release or rejection.
contract CreatorReputation is ICreatorReputation, Ownable {
    address public override vault;

    // slither-disable-next-line uninitialized-state (written by recordPaid/recordRejection in I-2.4)
    mapping(address clipper => Stats) internal _stats;
    mapping(address clipper => mapping(address brand => bool)) public paidBy;

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor() Ownable(msg.sender) {}

    /// @notice One-time link to the vault (deploy script: Reputation → Vault → setVault).
    function setVault(address vault_) external override onlyOwner {
        if (vault != address(0)) revert VaultAlreadySet();
        if (vault_ == address(0)) revert ZeroAddress();
        vault = vault_;
        emit VaultSet(vault_);
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
