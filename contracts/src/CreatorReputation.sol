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
    uint64 public constant TIER1_VIEWS = 5_000;
    uint64 public constant TIER2_VIEWS = 50_000;
    /// @notice Tier 2 needs rejections / (clipsPaid + rejections) below 5% (decision 5).
    uint256 public constant TIER2_MAX_REJECTION_BPS = 500;

    mapping(address vault => bool) public override isVault;

    mapping(address clipper => Stats) internal _stats;
    mapping(address clipper => mapping(address brand => bool)) public paidBy;
    mapping(address vault => mapping(uint256 clipId => bool)) public override clipCounted;

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

    function recordPaid(address clipper, address brand, uint256 clipId, uint64 paidViews, uint128 amount)
        external
        override
        onlyVault
    {
        Stats storage s = _stats[clipper];
        _touch(s);
        s.paidViews += paidViews;
        s.earned += amount;
        if (!clipCounted[msg.sender][clipId]) {
            clipCounted[msg.sender][clipId] = true;
            s.clipsPaid++;
        }
        if (!paidBy[clipper][brand]) {
            paidBy[clipper][brand] = true;
            s.brands++;
        }
        _emit(clipper, s);
    }

    function recordRejection(address clipper) external override onlyVault {
        Stats storage s = _stats[clipper];
        _touch(s);
        s.rejections++;
        _emit(clipper, s);
    }

    function stats(address clipper) external view override returns (Stats memory) {
        return _stats[clipper];
    }

    /// @notice 0 = new · 1 = ≥5k paid views and 0 rejections · 2 = ≥50k paid views and rejection rate < 5%.
    function tier(address clipper) public view override returns (uint8) {
        Stats storage s = _stats[clipper];
        if (s.paidViews >= TIER2_VIEWS) {
            uint256 outcomes = uint256(s.clipsPaid) + s.rejections;
            if (uint256(s.rejections) * 10_000 < TIER2_MAX_REJECTION_BPS * outcomes) return 2;
        }
        if (s.paidViews >= TIER1_VIEWS && s.rejections == 0) return 1;
        return 0;
    }

    function _touch(Stats storage s) internal {
        if (s.firstSeen == 0) s.firstSeen = uint64(block.timestamp);
    }

    function _emit(address clipper, Stats storage s) internal {
        emit ReputationUpdated(clipper, s.paidViews, s.earned, s.rejections, tier(clipper));
    }
}
