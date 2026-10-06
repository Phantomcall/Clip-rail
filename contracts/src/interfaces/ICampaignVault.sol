// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ICampaignVault (PRD §5.1–5.3 + playbook §C)
/// @notice Frozen interface. Change only with all three owners agreeing in chat.
interface ICampaignVault {
    // ─────────────────────────── Types ───────────────────────────

    /// @notice Watch = Pending/Active clips the oracle reports on; Pay = clips with unreleased tranches;
    ///         Flag = clips awaiting resolve.
    enum KeeperList {
        Watch,
        Pay,
        Flag
    }

    enum CampaignStatus {
        None,
        Active,
        Closed
    }

    enum ClipStatus {
        None,
        Pending,
        Active,
        Flagged,
        Rejected,
        Ended
    }

    /// @dev ClipRejected reasons
    enum RejectReason {
        NoOwnership, // pendingTimeout passed without OWNERSHIP_OK + publishedAt ≥ startsAt
        BrandRejected, // resolve(clipId, true)
        DuplicateVideo // another clip already proved ownership of this video
    }

    /// @dev ReportEntrySkipped reasons
    enum SkipReason {
        UnknownClip,
        CampaignClosed,
        Paused,
        NotReportable, // Rejected / Ended / Flagged
        DuplicateEntry, // clip already updated in this report
        Unavailable // unavailable strike; the clip ends after UNAVAILABLE_STRIKES in a row
    }

    struct CampaignParams {
        address token;
        uint128 budget;
        uint128 cpm; // token units per 1,000 views
        uint128 maxPerClip;
        uint64 maxViewsPerReport; // velocity cap
        uint16 minLikeBps; // likes/views floor, out of 10,000
        uint32 holdSecs;
        uint64 startsAt;
        uint64 endsAt;
        uint8 minTier;
        bytes32 briefHash;
    }

    struct Campaign {
        CampaignParams params;
        address brand;
        CampaignStatus status;
        uint128 reserved;
        uint128 paid;
    }

    struct Clip {
        uint256 campaignId;
        address clipper;
        ClipStatus status;
        uint64 registeredAt;
        uint64 publishedAt;
        uint64 lastViews;
        uint64 lastLikes;
        uint64 flagDeadline;
        uint128 accrued;
        uint128 released;
        string videoId;
    }

    struct Tranche {
        uint128 amount;
        uint64 views;
        uint64 unlockAt;
    }

    /// @dev Row returned by activeClips(). Shape matches the CRE oracle (cre/oracle/abi.ts).
    struct ActiveClip {
        uint256 clipId;
        uint256 campaignId;
        address clipper;
        string videoId;
        uint8 status;
        uint64 lastViews;
        uint64 lastLikes;
    }

    /// @dev report = abi.encode(uint64 round, ClipUpdate[] u)
    struct ClipUpdate {
        uint256 clipId;
        uint64 views;
        uint64 likes;
        uint64 publishedAt;
        uint8 flags; // FLAG_OWNERSHIP_OK | FLAG_UNAVAILABLE
    }

    struct RegisterClip {
        uint256 campaignId;
        string videoId;
        address clipper;
        uint256 nonce;
        uint256 deadline;
    }

    struct SetPayout {
        address clipper;
        address payout;
        uint256 nonce;
        uint256 deadline;
    }

    // ─────────────────────────── Events (Envio mirrors these) ───────────────────────────

    event CampaignCreated(
        uint256 indexed id,
        address indexed brand,
        address token,
        uint128 budget,
        uint128 cpm,
        uint128 maxPerClip,
        uint32 holdSecs,
        uint64 startsAt,
        uint64 endsAt,
        uint8 minTier,
        bytes32 briefHash
    );
    event CampaignToppedUp(uint256 indexed id, uint128 amount);
    event CampaignClosed(uint256 indexed id, uint128 refund);

    event ClipRegistered(uint256 indexed clipId, uint256 indexed campaignId, address indexed clipper, string videoId);
    event ClipActivated(uint256 indexed clipId);
    event ClipRejected(uint256 indexed clipId, uint8 reason);
    event ClipEnded(uint256 indexed clipId);

    /// @notice The VerifiedView receipt.
    event ViewsVerified(
        uint256 indexed clipId,
        uint256 indexed campaignId,
        address indexed clipper,
        uint64 round,
        uint64 totalViews,
        uint64 deltaViews,
        uint64 likes,
        uint128 amount,
        uint64 unlockAt
    );
    event SuspectReport(uint256 indexed clipId, uint64 round, uint64 views, uint64 likes);
    event ReportEntrySkipped(uint256 indexed clipId, uint8 reason);

    event Flagged(uint256 indexed clipId, address indexed brand, bytes32 reasonHash, uint64 deadline);
    event Resolved(uint256 indexed clipId, bool rejected, uint128 returned);
    event Released(uint256 indexed clipId, address indexed clipper, uint128 amount);
    /// @notice A payout transfer failed (e.g. a blacklisted payout address); the tranches stay unreleased and the
    ///         rest of the batch is still paid.
    event ReleaseFailed(uint256 indexed clipId, address indexed to, uint128 amount);
    /// @notice Budget returned by a reject after the campaign closed, sent to the campaign's refund address.
    event CampaignRefunded(uint256 indexed id, address indexed to, uint128 amount);

    event PayoutAddressSet(address indexed clipper, address indexed payout);
    event TokenAllowed(address indexed token, bool allowed);
    event ReportTransmitterSet(address indexed transmitter);
    event GuardianSet(address indexed guardian);

    // ─────────────────────────── Errors ───────────────────────────

    error TokenNotAllowed();
    error InvalidParams();
    error NotBrand();
    error CampaignNotActive();
    error CampaignEnded();
    error InvalidVideoId();
    error VideoAlreadyRegistered();
    error TierTooLow();
    error ExpiredDeadline();
    error InvalidNonce();
    error InvalidSignature();
    error StaleRound(uint64 round, uint64 lastRound);
    error NotFlaggable();
    error NotFlagged();
    error FlagNotExpired();
    error ReportsNotAuthorized();
    error UnauthorizedTransmitter(address origin, address expected);
    error RoundGapTooLarge(uint64 round, uint64 lastRound);
    error TooManyPending();
    error NotPending();
    error PendingNotExpired();
    error InvalidPayout();
    error NotGuardian();
    error AlreadyFlagged();
    /// @notice The flag window has passed: only autoResolve (accept) is possible now (audit V1-2).
    error FlagExpired();
    error InvalidRefundAddress();

    // ─────────────────────────── Brand ───────────────────────────

    function createCampaign(CampaignParams calldata p) external returns (uint256 campaignId);
    function createCampaignWithPermit(CampaignParams calldata p, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        returns (uint256 campaignId);
    function topUp(uint256 campaignId, uint128 amount) external;
    /// @notice Brand any time; anyone after endsAt. Refunds budget − reserved − paid to the brand.
    function closeCampaign(uint256 campaignId) external;
    /// @notice Brand only: close and send the refund (and any later reject returns) to `refundTo`, e.g. when the
    ///         brand's own address can't receive the token.
    function closeCampaignTo(uint256 campaignId, address refundTo) external;
    /// @notice Pays the clip's matured tranches first, then freezes the rest (audit V1-1).
    function flag(uint256 clipId, bytes32 reasonHash) external;
    /// @notice Brand only, before the flag deadline (audit V1-2).
    function resolve(uint256 clipId, bool reject) external;

    // ─────────────────────────── Clipper ───────────────────────────

    function registerClip(uint256 campaignId, string calldata videoId) external returns (uint256 clipId);
    function registerClipWithSig(RegisterClip calldata r, bytes calldata sig) external returns (uint256 clipId);
    function setPayoutAddressWithSig(SetPayout calldata s, bytes calldata sig) external;

    // ─────────────────────────── Anyone (keeper) ───────────────────────────

    function release(uint256[] calldata clipIds) external;
    function autoResolve(uint256 clipId) external;
    /// @notice Rejects a Pending clip whose pendingTimeout has passed without proven ownership.
    function expirePending(uint256 clipId) external;
    /// @notice Ends watched clips whose campaign is closed or past endsAt, so they stop taking oracle page slots.
    function sweep(uint256[] calldata clipIds) external;

    // ─────────────────────────── Owner ───────────────────────────

    function setTokenAllowed(address token, bool allowed) external;
    /// @notice Owner or guardian can pause; only the owner can unpause.
    function setPaused(bool paused) external;
    /// @notice While non-zero, reports are accepted only when tx.origin is this address (the oracle wallet that
    ///         broadcasts through the permissionless mock forwarder). Set to zero only with workflow identity set.
    function setReportTransmitter(address transmitter) external;
    function setGuardian(address guardian) external;

    // ─────────────────────────── Views ───────────────────────────

    function getCampaign(uint256 campaignId) external view returns (Campaign memory);
    function getClip(uint256 clipId) external view returns (Clip memory);
    function getTranches(uint256 clipId) external view returns (Tranche[] memory);
    function activeClips(uint256 offset, uint256 limit) external view returns (ActiveClip[] memory);
    /// @notice A raw, unfiltered page of one keeper list. CampaignVaultLens filters these into the keeper's
    ///         to-do lists (releasable, expired flags, expired pending, sweepable).
    function keeperList(KeeperList list, uint256 offset, uint256 limit) external view returns (uint256[] memory);
    /// @notice unlockAt of the clip's first unreleased tranche; type(uint64).max when none is left.
    function nextUnlockAt(uint256 clipId) external view returns (uint64);
    function lastRound() external view returns (uint64);
    /// @notice One counter shared by RegisterClip and SetPayout signatures.
    function nonces(address clipper) external view returns (uint256);
    function payoutAddressOf(address clipper) external view returns (address);
    function tokenAllowed(address token) external view returns (bool);
    function pendingTimeout() external view returns (uint64);
    function resolveWindow() external view returns (uint64);
    function reportTransmitter() external view returns (address);
    function guardian() external view returns (address);
}
