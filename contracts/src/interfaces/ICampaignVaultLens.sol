// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICampaignVault} from "./ICampaignVault.sol";

/// @title ICampaignVaultLens
/// @notice Read-only keeper views over CampaignVault, kept out of the vault so it stays under EIP-170.
///         Each function pages over one vault list, so a page can hold fewer than `limit` ids; keep paging
///         until `offset` passes the list's length.
interface ICampaignVaultLens {
    function vault() external view returns (ICampaignVault);
    /// @notice Clips with at least one matured, unreleased tranche that release() would pay (pages over the pay list).
    function releasableClips(uint256 offset, uint256 limit) external view returns (uint256[] memory);
    /// @notice Flagged clips whose resolveWindow has passed, for the keeper to autoResolve (pages over the flag list).
    function expiredFlags(uint256 offset, uint256 limit) external view returns (uint256[] memory);
    /// @notice Pending clips past pendingTimeout, for the keeper to pass to expirePending (pages over the watch list).
    function expiredPending(uint256 offset, uint256 limit) external view returns (uint256[] memory);
    /// @notice Watched clips whose campaign is closed or past endsAt, for the keeper to pass to sweep.
    function sweepableClips(uint256 offset, uint256 limit) external view returns (uint256[] memory);
    /// @notice The claim code a clipper puts in the video description to prove ownership. The vault never reads
    ///         it (the oracle reports ownership as a flag); this is the on-chain reference for the off-chain copies.
    function claimCode(uint256 campaignId, address clipper) external pure returns (string memory);
}
