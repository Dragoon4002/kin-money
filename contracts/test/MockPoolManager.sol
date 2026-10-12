// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey, SwapParams} from "../src/KinCashoutV2.sol";

interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

/// @notice Uniswap v4 PoolManager stand-in: fixed rate (bps), exact-input swaps, sync/settle/take flash accounting.
///         Knobs: `fillBps` < 10_000 reports a partial fill; `flipDelta` puts each delta in the other currency slot.
contract MockPoolManager {
    uint256 public rateBps = 9_990;
    uint256 public fillBps = 10_000;
    bool public flipDelta;
    address synced;
    uint256 syncedBal;
    int256 owed; // input still to be paid in the current unlock

    function setFill(uint256 bps) external {
        fillBps = bps;
    }

    function setFlipDelta(bool f) external {
        flipDelta = f;
    }

    function unlock(bytes calldata data) external returns (bytes memory r) {
        r = IUnlockCallback(msg.sender).unlockCallback(data);
        require(owed == 0, "unsettled");
    }

    function swap(PoolKey memory key, SwapParams memory p, bytes calldata) external returns (int256) {
        require(key.currency0 < key.currency1 && p.amountSpecified < 0, "bad swap");
        int128 amtIn = int128(int256(uint256(-p.amountSpecified) * fillBps / 10_000));
        int128 amtOut = int128(int256(uint256(uint128(amtIn)) * rateBps / 10_000));
        owed += amtIn;
        bool inIs0 = p.zeroForOne != flipDelta;
        (int128 d0, int128 d1) = inIs0 ? (-amtIn, amtOut) : (amtOut, -amtIn);
        return (int256(d0) << 128) | int256(uint256(uint128(d1)));
    }

    function sync(address c) external {
        (synced, syncedBal) = (c, IERC20(c).balanceOf(address(this)));
    }

    function settle() external payable returns (uint256 paid) {
        paid = IERC20(synced).balanceOf(address(this)) - syncedBal;
        owed -= int256(paid);
    }

    function take(address c, address to, uint256 amount) external {
        IERC20(c).transfer(to, amount);
    }
}
