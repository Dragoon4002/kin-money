// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {KinAddMoney} from "../src/KinAddMoney.sol";

/// @notice Deploys KinAddMoney (no forwarder). Env: USDC, AUSD, POOL_MANAGER, POOL_FEE, POOL_TICK_SPACING.
///         Mainnet: USDC=0x7547…b603 AUSD=0x0000…a012a POOL_MANAGER=0x188d…Ea8e POOL_FEE=50 POOL_TICK_SPACING=1.
contract DeployAddMoney is Script {
    function run() external {
        address usdc = vm.envAddress("USDC");
        address ausd = vm.envAddress("AUSD");
        address pm = vm.envAddress("POOL_MANAGER");
        require(usdc.code.length != 0 && ausd.code.length != 0 && pm.code.length != 0, "USDC/AUSD/pool manager missing");

        vm.startBroadcast();
        address add = address(
            new KinAddMoney(
                usdc,
                ausd,
                pm,
                uint24(vm.envUint("POOL_FEE")),
                int24(int256(vm.envUint("POOL_TICK_SPACING"))),
                address(0)
            )
        );
        vm.stopBroadcast();

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        if (!vm.exists(path)) vm.writeFile(path, "{}");
        vm.writeJson(vm.toString(add), path, ".KinAddMoney");
    }
}
