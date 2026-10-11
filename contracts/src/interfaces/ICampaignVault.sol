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

    /// @notice Creates a campaign and pulls `p.budget` of `p.token` (an allowed token) from the caller, who becomes
    ///         the brand. Needs an allowance first; see createCampaignWithPermit for the one-transaction path.
    /// @param p Budget, CPM, per-clip cap, velocity cap, like floor, hold, schedule, minimum tier and brief hash.
    /// @return campaignId The new campaign's id (1-based).
    function createCampaign(CampaignParams calldata p) external returns (uint256 campaignId);
    /// @notice Same as createCampaign, approving the vault with the token's EIP-2612 permit in the same transaction.
    /// @return campaignId The new campaign's id (1-based).
    function createCampaignWithPermit(CampaignParams calldata p, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        returns (uint256 campaignId);
    /// @notice Adds `amount` to an active campaign's budget before it ends. Anyone may top up; refunds go to the brand.
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

    /// @notice Registers the caller's YouTube Short (an 11-character video id) on a campaign. The clip starts
    ///         Pending and earns only after the oracle sees the claim code in the description (OWNERSHIP_OK).
    /// @return clipId The new clip's id (1-based).
    function registerClip(uint256 campaignId, string calldata videoId) external returns (uint256 clipId);
    /// @notice Gasless registerClip: the clipper signs the EIP-712 RegisterClip (EOA or ERC-1271) and anyone, in
    ///         practice the ops relayer, submits it and pays the gas.
    /// @return clipId The new clip's id (1-based).
    function registerClipWithSig(RegisterClip calldata r, bytes calldata sig) external returns (uint256 clipId);
    /// @notice Gasless change of where a clipper's payouts go, from a signed EIP-712 SetPayout. `payout = 0` resets
    ///         payouts to the clipper's own address.
    function setPayoutAddressWithSig(SetPayout calldata s, bytes calldata sig) external;

    // ─────────────────────────── Anyone (keeper) ───────────────────────────

    /// @notice Pays every matured tranche of the given clips to each clipper's payout address. Anyone may call it.
    ///         A failed transfer emits ReleaseFailed and the rest of the batch is still paid.
    function release(uint256[] calldata clipIds) external;
    /// @notice Accepts a flag the brand didn't resolve within resolveWindow; the clip resumes. Anyone may call it.
    function autoResolve(uint256 clipId) external;
    /// @notice Rejects a Pending clip whose pendingTimeout has passed without proven ownership.
    function expirePending(uint256 clipId) external;
    /// @notice Ends watched clips whose campaign is closed or past endsAt, so they stop taking oracle page slots.
    function sweep(uint256[] calldata clipIds) external;

    // ─────────────────────────── Owner ───────────────────────────

    /// @notice Owner only: adds or removes a token campaigns may be funded in. Existing campaigns are unaffected.
    function setTokenAllowed(address token, bool allowed) external;
    /// @notice Owner or guardian can pause; only the owner can unpause.
    function setPaused(bool paused) external;
    /// @notice While non-zero, reports are accepted only when tx.origin is this address (the oracle wallet that
    ///         broadcasts through the permissionless mock forwarder). Set to zero only with workflow identity set.
    function setReportTransmitter(address transmitter) external;
    /// @notice Owner only: sets the guardian, the address that may pause (but not unpause) besides the owner.
    function setGuardian(address guardian) external;

    // ─────────────────────────── Views ───────────────────────────

    /// @notice A campaign's parameters, brand, status and money (reserved = in hold, paid = released).
    function getCampaign(uint256 campaignId) external view returns (Campaign memory);
    /// @notice A clip's campaign, clipper, status, last reported views and likes, flag deadline and earnings.
    function getClip(uint256 clipId) external view returns (Clip memory);
    /// @notice Every tranche a clip has accrued, released or not, in order (amount, views and unlock time).
    function getTranches(uint256 clipId) external view returns (Tranche[] memory);
    /// @notice A page of the clips the oracle reports on: Pending and Active clips of open campaigns with budget.
    function activeClips(uint256 offset, uint256 limit) external view returns (ActiveClip[] memory);
    /// @notice A raw, unfiltered page of one keeper list. CampaignVaultLens filters these into the keeper's
    ///         to-do lists (releasable, expired flags, expired pending, sweepable).
    function keeperList(KeeperList list, uint256 offset, uint256 limit) external view returns (uint256[] memory);
    /// @notice unlockAt of the clip's first unreleased tranche; type(uint64).max when none is left.
    function nextUnlockAt(uint256 clipId) external view returns (uint64);
    /// @notice The last accepted report round; the next report must be newer and within MAX_ROUND_GAP.
    function lastRound() external view returns (uint64);
    /// @notice One counter shared by RegisterClip and SetPayout signatures.
    function nonces(address clipper) external view returns (uint256);
    /// @notice Where `clipper`'s payouts go: the address set with setPayoutAddressWithSig, else the clipper.
    function payoutAddressOf(address clipper) external view returns (address);
    /// @notice Whether campaigns may be created in `token`.
    function tokenAllowed(address token) external view returns (bool);
    /// @notice Seconds a clip may stay Pending without proven ownership before expirePending can reject it.
    function pendingTimeout() external view returns (uint64);
    /// @notice Seconds a brand has to resolve a flag before anyone can autoResolve it as accepted.
    function resolveWindow() external view returns (uint64);
    /// @notice The oracle wallet reports must come from (tx.origin) while the mock forwarder is in use; 0 = off.
    function reportTransmitter() external view returns (address);
    /// @notice The address that may pause besides the owner.
    function guardian() external view returns (address);
}
