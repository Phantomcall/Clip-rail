// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICampaignVault} from "./interfaces/ICampaignVault.sol";
import {ICampaignVaultLens} from "./interfaces/ICampaignVaultLens.sol";

/// @title CampaignVaultLens
/// @notice Keeper to-do lists computed from the vault's public state. Holds no funds and has no write access;
///         a redeploy only needs the new vault address.
contract CampaignVaultLens is ICampaignVaultLens {
    ICampaignVault public immutable override vault;

    constructor(ICampaignVault vault_) {
        vault = vault_;
    }

    function releasableClips(uint256 offset, uint256 limit) external view override returns (uint256[] memory ids) {
        ids = vault.keeperList(ICampaignVault.KeeperList.Pay, offset, limit);
        uint256 n = 0;
        for (uint256 i; i < ids.length; ++i) {
            uint256 clipId = ids[i];
            ICampaignVault.ClipStatus st = vault.getClip(clipId).status;
            if (st == ICampaignVault.ClipStatus.Flagged || st == ICampaignVault.ClipStatus.Rejected) continue;
            if (vault.nextUnlockAt(clipId) <= block.timestamp) ids[n++] = clipId;
        }
        _trim(ids, n);
    }

    function expiredFlags(uint256 offset, uint256 limit) external view override returns (uint256[] memory ids) {
        ids = vault.keeperList(ICampaignVault.KeeperList.Flag, offset, limit);
        uint256 n = 0;
        for (uint256 i; i < ids.length; ++i) {
            if (block.timestamp >= vault.getClip(ids[i]).flagDeadline) ids[n++] = ids[i];
        }
        _trim(ids, n);
    }

    function expiredPending(uint256 offset, uint256 limit) external view override returns (uint256[] memory ids) {
        ids = vault.keeperList(ICampaignVault.KeeperList.Watch, offset, limit);
        uint64 timeout = vault.pendingTimeout();
        uint256 n = 0;
        for (uint256 i; i < ids.length; ++i) {
            ICampaignVault.Clip memory clip = vault.getClip(ids[i]);
            if (clip.status == ICampaignVault.ClipStatus.Pending && block.timestamp >= clip.registeredAt + timeout) {
                ids[n++] = ids[i];
            }
        }
        _trim(ids, n);
    }

    function sweepableClips(uint256 offset, uint256 limit) external view override returns (uint256[] memory ids) {
        ids = vault.keeperList(ICampaignVault.KeeperList.Watch, offset, limit);
        uint256 n = 0;
        for (uint256 i; i < ids.length; ++i) {
            ICampaignVault.Campaign memory c = vault.getCampaign(vault.getClip(ids[i]).campaignId);
            // Same test as the vault's _isOpen: accruing means Active and not past endsAt.
            bool open = c.status == ICampaignVault.CampaignStatus.Active && block.timestamp <= c.params.endsAt;
            if (!open) ids[n++] = ids[i];
        }
        _trim(ids, n);
    }

    /// @notice "CR-" + upper(hex(keccak256(abi.encodePacked(campaignId, clipper)))[2:18]): 64 bits, so an attacker
    ///         can't grind an address whose code matches someone else's.
    /// @dev Must match packages/shared claimCode() and the CRE workflow byte for byte.
    function claimCode(uint256 campaignId, address clipper) external pure override returns (string memory) {
        bytes32 h = keccak256(abi.encodePacked(campaignId, clipper));
        bytes memory hexUpper = "0123456789ABCDEF";
        bytes memory out = new bytes(19);
        out[0] = "C";
        out[1] = "R";
        out[2] = "-";
        for (uint256 i; i < 8; ++i) {
            uint8 b = uint8(h[i]);
            out[3 + i * 2] = hexUpper[b >> 4];
            out[4 + i * 2] = hexUpper[b & 0x0f];
        }
        return string(out);
    }

    function _trim(uint256[] memory ids, uint256 n) internal pure {
        assembly {
            mstore(ids, n) // keep only the ids that passed the filter
        }
    }
}
