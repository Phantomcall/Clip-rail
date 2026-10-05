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

    /// @dev TODO I-2.3
    function closeCampaign(uint256) external pure override {
        revert NotImplemented();
    }

    /// @dev TODO I-2.2
    function flag(uint256, bytes32) external pure override {
        revert NotImplemented();
    }

    /// @dev TODO I-2.2
    function resolve(uint256, bool) external pure override {
        revert NotImplemented();
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
            if (tx.origin != transmitter) revert UnauthorizedTransmitter(tx.origin, transmitter);
        } else if (this.getExpectedWorkflowId() == bytes32(0) || this.getExpectedAuthor() == address(0)) {
            revert ReportsNotAuthorized();
        }
    }

    // ─────────────────────────── Anyone (keeper) ───────────────────────────

    /// @dev TODO I-2.1
    function release(uint256[] calldata) external pure override {
        revert NotImplemented();
    }

    /// @dev TODO I-2.2
    function autoResolve(uint256) external pure override {
        revert NotImplemented();
    }

    /// @notice Anyone can reject a Pending clip once pendingTimeout has passed (no report needed).
    function expirePending(uint256 clipId) external override {
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

    /// @dev TODO I-2.1
    function releasableClips(uint256, uint256) external pure override returns (uint256[] memory) {
        revert NotImplemented();
    }

    /// @dev TODO I-2.2
    function expiredFlags(uint256, uint256) external pure override returns (uint256[] memory) {
        revert NotImplemented();
    }

    function payoutAddressOf(address clipper) external view override returns (address) {
        address p = _payoutAddress[clipper];
        return p == address(0) ? clipper : p;
    }

    /// @notice "CR-" + upper(hex(keccak256(abi.encodePacked(campaignId, clipper)))[2:18]): 64 bits, so an attacker
    ///         can't grind an address whose code matches someone else's.
    /// @dev Must match packages/shared claimCode() and the CRE workflow byte for byte.
    function claimCode(uint256 campaignId, address clipper) public pure override returns (string memory) {
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
        uint64 paidViews = amount == full ? delta : uint64(amount * 1000 / c.params.cpm);

        // Rule 7: reserve and add a tranche.
        uint64 unlockAt = uint64(block.timestamp) + c.params.holdSecs;
        c.reserved += uint128(amount);
        clip.accrued += uint128(amount);
        _tranches[u.clipId].push(Tranche({amount: uint128(amount), views: paidViews, unlockAt: unlockAt}));

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
        _watchList.push(clipId);
        _watchIndex[clipId] = _watchList.length;
    }

    function _unwatch(uint256 clipId) internal {
        uint256 idx = _watchIndex[clipId];
        if (idx == 0) return;
        uint256 last = _watchList[_watchList.length - 1];
        _watchList[idx - 1] = last;
        _watchIndex[last] = idx;
        _watchList.pop();
        delete _watchIndex[clipId];
    }
}
