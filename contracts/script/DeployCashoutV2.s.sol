// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {KinCashoutV2} from "../src/KinCashoutV2.sol";

/// @notice Deploys KinCashoutV2 (no forwarder). Env: AUSD, SETTLE_TOKEN, AGORA_PAIR (0 = venue off),
///         POOL_MANAGER (0 = Uniswap venue off), POOL_FEE, POOL_TICK_SPACING, AGORA_WHITELISTER (testnet self-serve).
///         Testnet: AGORA_PAIR=0x1Aa8…b0ae AGORA_WHITELISTER=0x7c10…6BD5, settle token = pair's other side.
///         Mainnet: SETTLE_TOKEN=USDC 0x7547…b603, AGORA_PAIR=0xf332…2470 (works once Agora whitelists),
///         POOL_MANAGER=0x188d…Ea8e POOL_FEE=50 POOL_TICK_SPACING=1.
contract DeployCashoutV2 is Script {
    function run() external {
        address ausd = vm.envAddress("AUSD");
        address settle = vm.envAddress("SETTLE_TOKEN");
        address pair = vm.envOr("AGORA_PAIR", address(0));
        address pm = vm.envOr("POOL_MANAGER", address(0));
        address whitelister = vm.envOr("AGORA_WHITELISTER", address(0));
        require(ausd.code.length != 0 && settle.code.length != 0, "AUSD/settle token missing");

        vm.startBroadcast();
        address cash = address(
            new KinCashoutV2(
                ausd,
                settle,
                pair,
                pm,
                uint24(vm.envOr("POOL_FEE", uint256(0))),
                int24(int256(vm.envOr("POOL_TICK_SPACING", uint256(0)))),
                address(0)
            )
        );
        if (whitelister != address(0)) {
            (bool ok,) = whitelister.call(abi.encodeWithSignature("setApprovedSwapper(address)", cash));
            require(ok, "whitelist failed");
        }
        vm.stopBroadcast();

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        if (!vm.exists(path)) vm.writeFile(path, "{}");
        vm.writeJson(vm.toString(cash), path, ".KinCashoutV2");
    }
}
