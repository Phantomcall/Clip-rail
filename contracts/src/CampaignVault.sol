// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {ReceiverTemplate} from "./cre/ReceiverTemplate.sol";
import {ICampaignVault} from "./interfaces/ICampaignVault.sol";
import {ICreatorReputation} from "./interfaces/ICreatorReputation.sol";

/// @title CampaignVault
/// @notice Escrow, clip registry, oracle report processing, hold window, flags and payouts for Cliprail.
/// @dev Report authentication (fail closed, see _authorizeReport):
///      - simulation: forwarder = Chainlink's permissionless MockKeystoneForwarder, so reports are only accepted
///        when tx.origin is the pinned oracle wallet (reportTransmitter);
///      - production: forwarder = KeystoneForwarder (DON-signed), reportTransmitter = 0, and the expected
///        workflow owner and ID must both be set, because any workflow on the DON can target any receiver.
///      Owner = a TimelockController on mainnet; the guardian can only pause.
contract CampaignVault is ICampaignVault, ReceiverTemplate, EIP712, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────── Constants ───────────────────────────

    uint8 public constant FLAG_OWNERSHIP_OK = 1;
    uint8 public constant FLAG_UNAVAILABLE = 2;
    uint32 public constant MAX_HOLD_SECS = 7 days;
    /// @notice The oracle sends lastRound + 1; a bounded gap stops one bad report from bricking every later one.
    uint64 public constant MAX_ROUND_GAP = 1000;
    /// @notice Consecutive UNAVAILABLE reports before an Active clip ends (one bad API answer must not end it).
    uint8 public constant UNAVAILABLE_STRIKES = 3;
    /// @notice Open Pending clips one clipper may have in one campaign (limits watch-list spam).
    uint8 public constant MAX_PENDING_PER_CLIPPER = 3;
    /// @notice Tranches paid per clip per release call, to bound gas; the rest are paid on the next call.
    uint256 public constant MAX_TRANCHES_PER_RELEASE = 200;

    bytes32 public constant REGISTER_CLIP_TYPEHASH =
        keccak256("RegisterClip(uint256 campaignId,string videoId,address clipper,uint256 nonce,uint256 deadline)");
    bytes32 public constant SET_PAYOUT_TYPEHASH =
        keccak256("SetPayout(address clipper,address payout,uint256 nonce,uint256 deadline)");

    // ─────────────────────────── Config ───────────────────────────

    ICreatorReputation public immutable reputation;
    uint64 public immutable override pendingTimeout;
    uint64 public immutable override resolveWindow;

    address public override reportTransmitter;
    address public override guardian;

    // ─────────────────────────── State ───────────────────────────

    uint256 public campaignCount;
    uint256 public clipCount;
    uint64 public override lastRound;

    mapping(uint256 campaignId => Campaign) internal _campaigns;
    mapping(uint256 clipId => Clip) internal _clips;
    mapping(uint256 clipId => Tranche[]) internal _tranches;
    mapping(uint256 clipId => uint256) internal _trancheHead; // first unreleased tranche
    /// @notice The clip that proved ownership of a video (set on activation, not on registration).
    mapping(bytes32 videoKey => uint256 clipId) public clipIdByVideo;
    mapping(address clipper => uint256) public override nonces;
    mapping(address clipper => address) internal _payoutAddress;
    mapping(address token => bool) public override tokenAllowed;

    mapping(uint256 clipId => uint64) internal _lastUpdateRound;
    mapping(uint256 clipId => uint8) internal _unavailableStrikes;
    mapping(uint256 campaignId => mapping(address clipper => uint8)) internal _pendingCount;

    /// @dev Pending and Active clips the oracle still has to watch (swap-and-pop; index is 1-based).
    uint256[] internal _watchList;
    mapping(uint256 clipId => uint256) internal _watchIndex;

    /// @dev Clips with unreleased tranches, for the keeper (releasableClips).
    uint256[] internal _payList;
    mapping(uint256 clipId => uint256) internal _payIndex;

    /// @dev Flagged clips, for the keeper (expiredFlags).
    uint256[] internal _flagList;
    mapping(uint256 clipId => uint256) internal _flagIndex;

    mapping(uint256 clipId => bool) public everFlagged; // one flag per clip (audit R-3)
    mapping(uint256 clipId => ClipStatus) internal _statusBeforeFlag;
    mapping(uint256 campaignId => address) internal _refundTo; // set on close (audit R-2)

    constructor(address forwarder, ICreatorReputation reputation_, uint64 pendingTimeout_, uint64 resolveWindow_)
        ReceiverTemplate(forwarder)
        EIP712("Cliprail", "1")
    {
        if (address(reputation_) == address(0) || pendingTimeout_ == 0 || resolveWindow_ == 0) {
            revert InvalidParams();
        }
        reputation = reputation_;
        pendingTimeout = pendingTimeout_;
        resolveWindow = resolveWindow_;
    }

    // ─────────────────────────── Brand ───────────────────────────

    /// @notice Creates a campaign and pulls `p.budget` of `p.token` from the caller, who becomes the brand.
    function createCampaign(CampaignParams calldata p) external override nonReentrant returns (uint256) {
        return _createCampaign(p);
    }

    /// @notice Same as createCampaign, approving the vault with an EIP-2612 permit first.
    /// @dev The permit is wrapped in try/catch so a front-run permit (allowance already set) can't block creation.
    function createCampaignWithPermit(CampaignParams calldata p, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        override
        nonReentrant
        returns (uint256)
    {
        try IERC20Permit(p.token).permit(msg.sender, address(this), p.budget, deadline, v, r, s) {} catch {}
        return _createCampaign(p);
    }

    /// @notice Adds budget to an active campaign before it ends. Anyone may top up; refunds on close go to the brand.
    function topUp(uint256 campaignId, uint128 amount) external override nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        if (c.status != CampaignStatus.Active) revert CampaignNotActive();
        if (block.timestamp >= c.params.endsAt) revert CampaignEnded();
        if (amount == 0) revert InvalidParams();
        c.params.budget += amount;
        IERC20(c.params.token).safeTransferFrom(msg.sender, address(this), amount);
        emit CampaignToppedUp(campaignId, amount);
    }

    /// @notice Stops accrual and refunds budget − reserved − paid to the brand. Brand any time; anyone after endsAt.
    ///         Already-reserved tranches still release. Works while paused, so money can always leave.
    function closeCampaign(uint256 campaignId) external override nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        if (msg.sender != c.brand && block.timestamp <= c.params.endsAt) revert NotBrand();
        _close(campaignId, c, c.brand);
    }

    /// @notice Brand only: like closeCampaign, but the refund (and any later reject returns) go to `refundTo`.
    function closeCampaignTo(uint256 campaignId, address refundTo) external override nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        if (msg.sender != c.brand) revert NotBrand();
        if (refundTo == address(0) || refundTo == address(this)) revert InvalidRefundAddress();
        _close(campaignId, c, refundTo);
    }

    /// @notice Brand freezes a clip that still has unreleased earnings. One flag per clip (audit R-3); if the brand
    ///         doesn't resolve it within resolveWindow, anyone can autoResolve it as accepted.
    function flag(uint256 clipId, bytes32 reasonHash) external override {
        Clip storage clip = _clips[clipId];
        if (msg.sender != _campaigns[clip.campaignId].brand) revert NotBrand();
        if (clip.status != ClipStatus.Active && clip.status != ClipStatus.Ended) revert NotFlaggable();
        if (_trancheHead[clipId] >= _tranches[clipId].length) revert NotFlaggable(); // nothing left to freeze
        if (everFlagged[clipId]) revert AlreadyFlagged();

        everFlagged[clipId] = true;
        _statusBeforeFlag[clipId] = clip.status;
        clip.status = ClipStatus.Flagged;
        clip.flagDeadline = uint64(block.timestamp) + resolveWindow;
        _listAdd(_flagList, _flagIndex, clipId);
        emit Flagged(clipId, msg.sender, reasonHash, clip.flagDeadline);
    }

    /// @notice Brand resolves its flag. Reject: unreleased earnings return to the budget (or, if the campaign is
    ///         closed, to its refund address) and count against the clipper's reputation. Accept: the clip resumes.
    function resolve(uint256 clipId, bool reject) external override nonReentrant {
        Clip storage clip = _clips[clipId];
        if (clip.status != ClipStatus.Flagged) revert NotFlagged();
        Campaign storage c = _campaigns[clip.campaignId];
        if (msg.sender != c.brand) revert NotBrand();
        if (reject) _reject(clipId, clip, c);
        else _accept(clipId, clip);
    }

    // ─────────────────────────── Clipper ───────────────────────────

    /// @notice Direct registration; the clipper pays gas.
    function registerClip(uint256 campaignId, string calldata videoId) external override returns (uint256) {
        return _registerClip(campaignId, videoId, msg.sender);
    }

    /// @notice Relayed registration: the clipper signs RegisterClip off chain, the relayer pays gas.
    function registerClipWithSig(RegisterClip calldata r, bytes calldata sig) external override returns (uint256) {
        bytes32 structHash = keccak256(
            abi.encode(
                REGISTER_CLIP_TYPEHASH, r.campaignId, keccak256(bytes(r.videoId)), r.clipper, r.nonce, r.deadline
            )
        );
        _useSignature(r.clipper, r.nonce, r.deadline, structHash, sig);
        return _registerClip(r.campaignId, r.videoId, r.clipper);
    }

    /// @notice Relayed payout-address change. `payout = address(0)` resets payouts to the clipper.
    function setPayoutAddressWithSig(SetPayout calldata s, bytes calldata sig) external override {
        if (s.payout == address(this) || tokenAllowed[s.payout]) revert InvalidPayout();
        bytes32 structHash = keccak256(abi.encode(SET_PAYOUT_TYPEHASH, s.clipper, s.payout, s.nonce, s.deadline));
        _useSignature(s.clipper, s.nonce, s.deadline, structHash, sig);
        _payoutAddress[s.clipper] = s.payout;
        emit PayoutAddressSet(s.clipper, s.payout == address(0) ? s.clipper : s.payout);
    }

    // ─────────────────────────── Oracle ───────────────────────────

    /// @dev report = abi.encode(uint64 round, ClipUpdate[] u). Reverts only for an unauthorized sender or a bad
    ///      round; any bad entry is skipped with ReportEntrySkipped.
    function _processReport(bytes calldata report) internal override {
        _authorizeReport();
        (uint64 round, ClipUpdate[] memory updates) = abi.decode(report, (uint64, ClipUpdate[]));
        if (round <= lastRound) revert StaleRound(round, lastRound);
        if (round > lastRound + MAX_ROUND_GAP) revert RoundGapTooLarge(round, lastRound);
        lastRound = round;

        bool isPaused = paused();
        for (uint256 i; i < updates.length; ++i) {
            if (isPaused) emit ReportEntrySkipped(updates[i].clipId, uint8(SkipReason.Paused));
            else _applyUpdate(round, updates[i]);
        }
    }

    /// @dev Fail closed. ReceiverTemplate has already checked msg.sender == forwarder (when the forwarder is set).
    function _authorizeReport() internal view {
        if (this.getForwarderAddress() == address(0)) revert ReportsNotAuthorized();
        address transmitter = reportTransmitter;
        if (transmitter != address(0)) {
            // The mock forwarder is permissionless; the broadcasting oracle wallet is the only trustworthy signal.
            // solhint-disable-next-line avoid-tx-origin
            // slither-disable-next-line tx-origin
            if (tx.origin != transmitter) revert UnauthorizedTransmitter(tx.origin, transmitter);
        } else if (this.getExpectedWorkflowId() == bytes32(0) || this.getExpectedAuthor() == address(0)) {
            revert ReportsNotAuthorized();
        }
    }

    // ─────────────────────────── Anyone (keeper) ───────────────────────────

    /// @notice Pays every matured tranche of the given clips to each clipper's payout address. Anyone can call it
    ///         (the keeper does, every few minutes). Flagged and Rejected clips are skipped; a failed transfer is
    ///         skipped with ReleaseFailed instead of blocking the batch (audit R-1). Works while paused.
    function release(uint256[] calldata clipIds) external override nonReentrant {
        for (uint256 i; i < clipIds.length; ++i) {
            _release(clipIds[i]);
        }
    }

    /// @notice Anyone can accept a flag once its resolveWindow has passed without the brand resolving it.
    function autoResolve(uint256 clipId) external override {
        Clip storage clip = _clips[clipId];
        if (clip.status != ClipStatus.Flagged) revert NotFlagged();
        if (block.timestamp < clip.flagDeadline) revert FlagNotExpired();
        _accept(clipId, clip);
    }

    /// @notice Anyone can end watched clips whose campaign is closed or past endsAt; they can never earn again.
    function sweep(uint256[] calldata clipIds) external override {
        for (uint256 i; i < clipIds.length; ++i) {
            uint256 clipId = clipIds[i];
            Clip storage clip = _clips[clipId];
            if (_watchIndex[clipId] == 0 || _isOpen(_campaigns[clip.campaignId])) continue;
            if (clip.status == ClipStatus.Pending) _pendingCount[clip.campaignId][clip.clipper]--;
            if (clip.status == ClipStatus.Flagged) {
                _statusBeforeFlag[clipId] = ClipStatus.Ended; // resolves back to Ended, not Active
                _unwatch(clipId);
            } else {
                _end(clipId, clip);
            }
        }
    }

    /// @notice Anyone can reject a Pending clip once pendingTimeout has passed (no report needed). Blocked while
    ///         paused, because the oracle can't report while paused either (review follow-up 4).
    function expirePending(uint256 clipId) external override whenNotPaused {
        Clip storage clip = _clips[clipId];
        if (clip.status != ClipStatus.Pending) revert NotPending();
        if (block.timestamp < clip.registeredAt + pendingTimeout) revert PendingNotExpired();
        _rejectPending(clipId, clip, RejectReason.NoOwnership);
    }

    // ─────────────────────────── Owner / guardian ───────────────────────────

    function setTokenAllowed(address token, bool allowed) external override onlyOwner {
        tokenAllowed[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// @notice Pauses create, register and reports. Release, close and resolve keep working.
    ///         The owner or the guardian can pause; only the owner can unpause.
    function setPaused(bool paused_) external override {
        if (paused_) {
            if (msg.sender != owner() && msg.sender != guardian) revert NotGuardian();
            _pause();
        } else {
            _checkOwner();
            _unpause();
        }
    }

    function setReportTransmitter(address transmitter) external override onlyOwner {
        reportTransmitter = transmitter;
        emit ReportTransmitterSet(transmitter);
    }

    function setGuardian(address guardian_) external override onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    // ─────────────────────────── Views ───────────────────────────

    function getCampaign(uint256 campaignId) external view override returns (Campaign memory) {
        return _campaigns[campaignId];
    }

    function getClip(uint256 clipId) external view override returns (Clip memory) {
        return _clips[clipId];
    }

    function getTranches(uint256 clipId) external view override returns (Tranche[] memory) {
        return _tranches[clipId];
    }

    /// @notice Pending and Active clips of open campaigns with budget left, for the oracle. Pages over the watch
    ///         list, so a page can hold fewer than `limit` rows; keep paging until `offset >= watchListLength()`.
    function activeClips(uint256 offset, uint256 limit) external view override returns (ActiveClip[] memory rows) {
        uint256 len = _watchList.length;
        uint256 end = offset + limit > len ? len : offset + limit;
        if (offset >= end) return rows;

        rows = new ActiveClip[](end - offset);
        uint256 n;
        for (uint256 i = offset; i < end; ++i) {
            uint256 clipId = _watchList[i];
            Clip storage clip = _clips[clipId];
            Campaign storage c = _campaigns[clip.campaignId];
            if (clip.status == ClipStatus.Flagged || !_isOpen(c) || _free(c) == 0) continue;
            rows[n++] = ActiveClip({
                clipId: clipId,
                campaignId: clip.campaignId,
                clipper: clip.clipper,
                videoId: clip.videoId,
                status: uint8(clip.status),
                lastViews: clip.lastViews,
                lastLikes: clip.lastLikes
            });
        }
        assembly {
            mstore(rows, n) // trim to the rows actually filled
        }
    }

    function watchListLength() external view returns (uint256) {
        return _watchList.length;
    }

    function keeperList(KeeperList list, uint256 offset, uint256 limit)
        external
        view
        override
        returns (uint256[] memory ids)
    {
        uint256[] storage l = list == KeeperList.Watch ? _watchList : list == KeeperList.Pay ? _payList : _flagList;
        uint256 len = l.length;
        uint256 start = offset > len ? len : offset;
        uint256 end = limit > len - start ? len : start + limit;
        ids = new uint256[](end - start);
        for (uint256 i = start; i < end; ++i) {
            ids[i - start] = l[i];
        }
    }

    function nextUnlockAt(uint256 clipId) external view override returns (uint64) {
        Tranche[] storage ts = _tranches[clipId];
        uint256 head = _trancheHead[clipId];
        return head < ts.length ? ts[head].unlockAt : type(uint64).max;
    }

    function refundAddressOf(uint256 campaignId) external view returns (address) {
        return _refundTo[campaignId];
    }

    function payoutAddressOf(address clipper) external view override returns (address) {
        address p = _payoutAddress[clipper];
        return p == address(0) ? clipper : p;
    }

    /// @notice EIP-712 domain separator for {name:"Cliprail", version:"1", chainId, verifyingContract: this}.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ─────────────────────────── Internal: campaigns & clips ───────────────────────────

    function _createCampaign(CampaignParams calldata p) internal whenNotPaused returns (uint256 id) {
        if (!tokenAllowed[p.token]) revert TokenNotAllowed();
        if (
            p.budget == 0 || p.cpm == 0 || p.maxPerClip == 0 || p.maxViewsPerReport == 0 || p.minLikeBps > 10_000
                || p.holdSecs > MAX_HOLD_SECS || p.endsAt <= p.startsAt || p.endsAt <= block.timestamp
        ) revert InvalidParams();

        id = ++campaignCount;
        Campaign storage c = _campaigns[id];
        c.params = p;
        c.brand = msg.sender;
        c.status = CampaignStatus.Active;

        IERC20(p.token).safeTransferFrom(msg.sender, address(this), p.budget);
        emit CampaignCreated(
            id,
            msg.sender,
            p.token,
            p.budget,
            p.cpm,
            p.maxPerClip,
            p.holdSecs,
            p.startsAt,
            p.endsAt,
            p.minTier,
            p.briefHash
        );
    }

    /// @dev The video id is only reserved once a clip proves ownership (on activation), so registering someone
    ///      else's Short first can't lock its owner out.
    function _registerClip(uint256 campaignId, string calldata videoId, address clipper)
        internal
        whenNotPaused
        returns (uint256 clipId)
    {
        Campaign storage c = _campaigns[campaignId];
        if (c.status != CampaignStatus.Active) revert CampaignNotActive();
        if (block.timestamp >= c.params.endsAt) revert CampaignEnded();
        if (!_isValidVideoId(videoId)) revert InvalidVideoId();
        if (clipIdByVideo[keccak256(bytes(videoId))] != 0) revert VideoAlreadyRegistered();
        if (_pendingCount[campaignId][clipper] >= MAX_PENDING_PER_CLIPPER) revert TooManyPending();
        if (reputation.tier(clipper) < c.params.minTier) revert TierTooLow();

        clipId = ++clipCount;
        Clip storage clip = _clips[clipId];
        clip.campaignId = campaignId;
        clip.clipper = clipper;
        clip.status = ClipStatus.Pending;
        clip.registeredAt = uint64(block.timestamp);
        clip.videoId = videoId;
        _pendingCount[campaignId][clipper]++;
        _watch(clipId);

        emit ClipRegistered(clipId, campaignId, clipper, videoId);
    }

    /// @dev Checks deadline, nonce and signature (EOA or ERC-1271), then consumes the nonce.
    function _useSignature(address signer, uint256 nonce, uint256 deadline, bytes32 structHash, bytes calldata sig)
        internal
    {
        if (block.timestamp > deadline) revert ExpiredDeadline();
        if (nonce != nonces[signer]) revert InvalidNonce();
        if (!SignatureChecker.isValidSignatureNow(signer, _hashTypedDataV4(structHash), sig)) {
            revert InvalidSignature();
        }
        nonces[signer] = nonce + 1;
    }

    // ─────────────────────────── Internal: report rules (PRD §5.2) ───────────────────────────

    function _applyUpdate(uint64 round, ClipUpdate memory u) internal {
        Clip storage clip = _clips[u.clipId];
        if (clip.status == ClipStatus.None) {
            emit ReportEntrySkipped(u.clipId, uint8(SkipReason.UnknownClip));
            return;
        }
        // One update per clip per report, so a repeated entry can't stack velocity caps.
        if (_lastUpdateRound[u.clipId] == round) {
            emit ReportEntrySkipped(u.clipId, uint8(SkipReason.DuplicateEntry));
            return;
        }
        _lastUpdateRound[u.clipId] = round;

        if (clip.status != ClipStatus.Pending && clip.status != ClipStatus.Active) {
            // Flagged clips don't move lastViews, so accepted flags get paid on a later report (decision 4).
            emit ReportEntrySkipped(u.clipId, uint8(SkipReason.NotReportable));
            return;
        }
        Campaign storage c = _campaigns[clip.campaignId];
        if (!_isOpen(c)) {
            emit ReportEntrySkipped(u.clipId, uint8(SkipReason.CampaignClosed));
            return;
        }

        // Rule 2: unavailable. A clip ends only after UNAVAILABLE_STRIKES consecutive reports, so one bad API answer
        // (or a Short still processing right after upload) doesn't end it.
        if (u.flags & FLAG_UNAVAILABLE != 0) {
            if (++_unavailableStrikes[u.clipId] >= UNAVAILABLE_STRIKES) {
                if (clip.status == ClipStatus.Pending) _pendingCount[clip.campaignId][clip.clipper]--;
                _end(u.clipId, clip);
            } else {
                emit ReportEntrySkipped(u.clipId, uint8(SkipReason.Unavailable));
            }
            return;
        }
        if (_unavailableStrikes[u.clipId] != 0) delete _unavailableStrikes[u.clipId];

        // Rule 2: a pending clip activates (and reserves its video), times out, or waits.
        if (clip.status == ClipStatus.Pending) {
            if (u.flags & FLAG_OWNERSHIP_OK != 0 && u.publishedAt >= c.params.startsAt) {
                bytes32 key = keccak256(bytes(clip.videoId));
                if (clipIdByVideo[key] != 0) {
                    _rejectPending(u.clipId, clip, RejectReason.DuplicateVideo);
                    return;
                }
                clipIdByVideo[key] = u.clipId;
                _pendingCount[clip.campaignId][clip.clipper]--;
                clip.status = ClipStatus.Active;
                clip.publishedAt = u.publishedAt;
                emit ClipActivated(u.clipId);
            } else {
                if (block.timestamp >= clip.registeredAt + pendingTimeout) {
                    _rejectPending(u.clipId, clip, RejectReason.NoOwnership);
                }
                return;
            }
        }

        _accrue(round, u, clip, c);
    }

    /// @dev Rules 3–7 for an Active clip.
    function _accrue(uint64 round, ClipUpdate memory u, Clip storage clip, Campaign storage c) internal {
        // Rule 3: views only go up.
        if (u.views <= clip.lastViews) return;

        // Rule 4: velocity cap; views above the cap are never paid.
        uint64 delta = u.views - clip.lastViews;
        if (delta > c.params.maxViewsPerReport) delta = c.params.maxViewsPerReport;
        clip.lastViews = u.views;
        clip.lastLikes = u.likes;

        // Rule 5: like floor on totals.
        if (uint256(u.likes) * 10_000 < uint256(c.params.minLikeBps) * u.views) {
            emit SuspectReport(u.clipId, round, u.views, u.likes);
            return;
        }

        // Rule 6: amount, capped by the per-clip cap and the free budget.
        uint256 full = uint256(delta) * c.params.cpm / 1000;
        uint256 amount = full;
        uint256 clipRoom = c.params.maxPerClip > clip.accrued ? c.params.maxPerClip - clip.accrued : 0;
        if (amount > clipRoom) amount = clipRoom;
        uint256 free = _free(c);
        if (amount > free) amount = free;
        if (amount == 0) return;
        // Views actually paid when the amount was capped; rounding down never over-credits reputation.
        // slither-disable-next-line divide-before-multiply
        uint64 paidViews = amount == full ? delta : uint64(amount * 1000 / c.params.cpm);

        // Rule 7: reserve and add a tranche.
        uint64 unlockAt = uint64(block.timestamp) + c.params.holdSecs;
        c.reserved += uint128(amount);
        clip.accrued += uint128(amount);
        _tranches[u.clipId].push(Tranche({amount: uint128(amount), views: paidViews, unlockAt: unlockAt}));
        if (_payIndex[u.clipId] == 0) _listAdd(_payList, _payIndex, u.clipId);

        emit ViewsVerified(
            u.clipId, clip.campaignId, clip.clipper, round, u.views, delta, u.likes, uint128(amount), unlockAt
        );

        // A clip at its cap can't earn more: stop spending oracle quota on it.
        if (clip.accrued >= c.params.maxPerClip) _unwatch(u.clipId);
    }

    function _rejectPending(uint256 clipId, Clip storage clip, RejectReason reason) internal {
        _pendingCount[clip.campaignId][clip.clipper]--;
        clip.status = ClipStatus.Rejected;
        _unwatch(clipId);
        emit ClipRejected(clipId, uint8(reason));
    }

    function _end(uint256 clipId, Clip storage clip) internal {
        clip.status = ClipStatus.Ended;
        _unwatch(clipId);
        emit ClipEnded(clipId);
    }

    // ─────────────────────────── Internal: payouts, flags, close ───────────────────────────

    function _release(uint256 clipId) internal {
        Clip storage clip = _clips[clipId];
        if (clip.status != ClipStatus.Active && clip.status != ClipStatus.Ended) return; // never pay Flagged/Rejected

        Tranche[] storage ts = _tranches[clipId];
        uint256 head = _trancheHead[clipId];
        uint256 stop = head + MAX_TRANCHES_PER_RELEASE;
        if (stop > ts.length) stop = ts.length;
        uint256 amount = 0;
        uint256 views = 0;
        uint256 i = head;
        for (; i < stop && ts[i].unlockAt <= block.timestamp; ++i) {
            amount += ts[i].amount;
            views += ts[i].views;
        }
        if (amount == 0) return;

        Campaign storage c = _campaigns[clip.campaignId];
        address to = _payoutAddress[clip.clipper];
        if (to == address(0)) to = clip.clipper;

        // Effects before the transfer; rolled back below if the transfer fails.
        _trancheHead[clipId] = i;
        clip.released += uint128(amount);
        c.reserved -= uint128(amount);
        c.paid += uint128(amount);

        if (!_tryTransfer(c.params.token, to, amount)) {
            _trancheHead[clipId] = head;
            clip.released -= uint128(amount);
            c.reserved += uint128(amount);
            c.paid -= uint128(amount);
            emit ReleaseFailed(clipId, to, uint128(amount));
            return;
        }
        if (i == ts.length) _listRemove(_payList, _payIndex, clipId);
        emit Released(clipId, clip.clipper, uint128(amount));

        // Reputation must never block a payout.
        try reputation.recordPaid(clip.clipper, c.brand, clipId, uint64(views), uint128(amount)) {} catch {}
    }

    function _reject(uint256 clipId, Clip storage clip, Campaign storage c) internal {
        Tranche[] storage ts = _tranches[clipId];
        uint256 returned = 0;
        for (uint256 i = _trancheHead[clipId]; i < ts.length; ++i) {
            returned += ts[i].amount;
        }
        _trancheHead[clipId] = ts.length;
        c.reserved -= uint128(returned);
        clip.accrued -= uint128(returned); // keeps Σ accrued = reserved + paid (audit R-5)
        clip.status = ClipStatus.Rejected;
        _unwatch(clipId);
        _listRemove(_payList, _payIndex, clipId);
        _listRemove(_flagList, _flagIndex, clipId);

        emit Resolved(clipId, true, uint128(returned));
        emit ClipRejected(clipId, uint8(RejectReason.BrandRejected));

        // A closed campaign's budget is already settled: send the returned amount on to its refund address.
        if (c.status == CampaignStatus.Closed && returned > 0) {
            c.params.budget -= uint128(returned);
            address to = _refundTo[clip.campaignId];
            IERC20(c.params.token).safeTransfer(to, returned);
            emit CampaignRefunded(clip.campaignId, to, uint128(returned));
        }
        try reputation.recordRejection(clip.clipper) {} catch {}
    }

    function _accept(uint256 clipId, Clip storage clip) internal {
        ClipStatus previous = _statusBeforeFlag[clipId];
        clip.status = previous;
        _listRemove(_flagList, _flagIndex, clipId);
        emit Resolved(clipId, false, 0);
    }

    function _close(uint256 campaignId, Campaign storage c, address refundTo) internal {
        if (c.status != CampaignStatus.Active) revert CampaignNotActive();
        uint128 refund = c.params.budget - c.reserved - c.paid;
        c.status = CampaignStatus.Closed;
        c.params.budget = c.reserved + c.paid;
        _refundTo[campaignId] = refundTo;
        if (refund > 0) IERC20(c.params.token).safeTransfer(refundTo, refund);
        emit CampaignClosed(campaignId, refund);
    }

    /// @dev Like SafeERC20.safeTransfer, but returns false instead of reverting (e.g. a blacklisted recipient).
    function _tryTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok) return false;
        if (ret.length == 0) return token.code.length > 0;
        return ret.length >= 32 && abi.decode(ret, (bool));
    }

    // ─────────────────────────── Internal: helpers ───────────────────────────

    /// @dev Accruing: Active and not past endsAt.
    function _isOpen(Campaign storage c) internal view returns (bool) {
        return c.status == CampaignStatus.Active && block.timestamp <= c.params.endsAt;
    }

    function _free(Campaign storage c) internal view returns (uint256) {
        return uint256(c.params.budget) - c.reserved - c.paid;
    }

    /// @dev Exactly 11 characters of [A-Za-z0-9_-].
    function _isValidVideoId(string calldata id) internal pure returns (bool) {
        bytes calldata b = bytes(id);
        if (b.length != 11) return false;
        for (uint256 i; i < 11; ++i) {
            bytes1 ch = b[i];
            bool ok = (ch >= "0" && ch <= "9") || (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch == "_"
                || ch == "-";
            if (!ok) return false;
        }
        return true;
    }

    function _watch(uint256 clipId) internal {
        _listAdd(_watchList, _watchIndex, clipId);
    }

    function _unwatch(uint256 clipId) internal {
        _listRemove(_watchList, _watchIndex, clipId);
    }

    /// @dev Swap-and-pop set over an array with a 1-based index mapping.
    function _listAdd(uint256[] storage list, mapping(uint256 => uint256) storage index, uint256 id) internal {
        if (index[id] != 0) return;
        list.push(id);
        index[id] = list.length;
    }

    function _listRemove(uint256[] storage list, mapping(uint256 => uint256) storage index, uint256 id) internal {
        uint256 idx = index[id];
        if (idx == 0) return;
        uint256 last = list[list.length - 1];
        list[idx - 1] = last;
        index[last] = idx;
        list.pop();
        delete index[id];
    }
}
