// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {KinMandate} from "./KinMandate.sol";
import {KinGiftLink} from "./KinGiftLink.sol";
import {KinCircle} from "./KinCircle.sol";
import {KinEscrow} from "./KinEscrow.sol";

/// @notice Chainlink CRE receiver: stores FX rates and runs permissionless Kin jobs, one report per workflow run.
///         Holds no funds; every job pays the position's payee, never the caller.
///         Each rate may move at most MAX_MOVE_PCT from its previous value per report (first set unbounded).
/// @dev ponytail: trusts the forwarder only (no workflowId/owner check). The CRE forwarder is shared, so any
///      workflow can post here; the per-report rate bound caps what a rogue report can do. Jobs are permissionless.
contract KinKeeper is IReceiver {
    struct Rate {
        uint64 value; // local currency per 1 USD, 1e6 scale
        uint40 updatedAt;
    }

    uint8 public constant COLLECT = 0;
    uint8 public constant OPEN = 1;
    uint8 public constant SETTLE = 2;
    uint8 public constant RELEASE = 3;
    uint256 public constant MAX_MOVE_PCT = 15;

    address public immutable forwarder;
    KinMandate public immutable mandate;
    KinGiftLink public immutable giftLink;
    KinCircle public immutable circle;
    KinEscrow public immutable escrow;

    mapping(bytes3 => Rate) public rates;

    error NotForwarder();
    error LengthMismatch();
    error ZeroRate(bytes3 code);
    error RateJump(bytes3 code, uint64 previous, uint64 value);

    event RateUpdated(bytes3 indexed code, uint64 value);
    event JobRun(uint8 indexed kind, uint256 indexed id, bool ok);

    constructor(address forwarder_, address mandate_, address giftLink_, address circle_, address escrow_) {
        forwarder = forwarder_;
        mandate = KinMandate(mandate_);
        giftLink = KinGiftLink(giftLink_);
        circle = KinCircle(circle_);
        escrow = KinEscrow(escrow_);
    }

    function rateOf(bytes3 code) external view returns (uint64 value, uint40 updatedAt) {
        Rate memory r = rates[code];
        return (r.value, r.updatedAt);
    }

    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder) revert NotForwarder();
        (
            bytes3[] memory codes,
            uint64[] memory values,
            uint256[] memory collects,
            uint256[] memory opens,
            uint256[] memory settles,
            uint256[] memory releases
        ) = abi.decode(report, (bytes3[], uint64[], uint256[], uint256[], uint256[], uint256[]));

        if (codes.length != values.length) revert LengthMismatch();
        for (uint256 i; i < codes.length; ++i) {
            if (values[i] == 0) revert ZeroRate(codes[i]);
            uint256 prev = rates[codes[i]].value;
            if (
                prev != 0
                    && (uint256(values[i]) * 100 > prev * (100 + MAX_MOVE_PCT)
                        || uint256(values[i]) * 100 < prev * (100 - MAX_MOVE_PCT))
            ) revert RateJump(codes[i], uint64(prev), values[i]);
            rates[codes[i]] = Rate(values[i], uint40(block.timestamp));
            emit RateUpdated(codes[i], values[i]);
        }

        // Each job in try/catch: an already-settled or not-yet-due id must not block the rest.
        for (uint256 i; i < collects.length; ++i) {
            bool ok;
            try mandate.collect(collects[i]) {
                ok = true;
            } catch {}
            emit JobRun(COLLECT, collects[i], ok);
        }
        for (uint256 i; i < opens.length; ++i) {
            bool ok;
            try giftLink.open(opens[i]) {
                ok = true;
            } catch {}
            emit JobRun(OPEN, opens[i], ok);
        }
        for (uint256 i; i < settles.length; ++i) {
            bool ok;
            try circle.settle(settles[i]) {
                ok = true;
            } catch {}
            emit JobRun(SETTLE, settles[i], ok);
        }
        for (uint256 i; i < releases.length; ++i) {
            bool ok;
            try escrow.release(releases[i]) {
                ok = true;
            } catch {}
            emit JobRun(RELEASE, releases[i], ok);
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
