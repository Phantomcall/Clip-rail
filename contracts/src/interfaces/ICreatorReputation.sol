// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ICreatorReputation (PRD §5.4)
/// @notice Append-only clipper stats. Only the vault writes; the vault reads tier() to gate campaigns.
interface ICreatorReputation {
    struct Stats {
        uint64 paidViews;
        uint128 earned;
        uint32 clipsPaid;
        uint32 rejections;
        uint32 brands; // distinct brands that have paid this clipper
        uint64 firstSeen;
    }

    event VaultAdded(address indexed vault);
    event VaultRemoved(address indexed vault);
    event ReputationUpdated(address indexed clipper, uint64 paidViews, uint128 earned, uint32 rejections, uint8 tier);

    error NotVault();
    error InvalidVault();

    /// @notice Authorises a vault to write stats. Owner only (a 24 h timelock on mainnet). The vault must be a
    ///         contract whose reputation() is this contract, so a typo or an impostor can't be added.
    function addVault(address vault) external;
    /// @notice Revokes a vault's write access, e.g. once an old vault has released everything after a redeploy.
    function removeVault(address vault) external;
    function recordPaid(address clipper, address brand, uint64 paidViews, uint128 amount) external;
    function recordRejection(address clipper) external;

    function isVault(address vault) external view returns (bool);
    function stats(address clipper) external view returns (Stats memory);
    /// @notice 0 = new · 1 = ≥5k paid views and 0 rejections · 2 = ≥50k paid views and rejection rate < 5%
    function tier(address clipper) external view returns (uint8);
}
