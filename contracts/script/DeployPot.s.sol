// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {KinPot} from "../src/KinPot.sol";

/// @notice Deploys KinPot against the existing forwarder + AUSD in deployments/<chainId>.json and replaces its key (redeploy).
contract DeployPot is Script {
    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        address fwd = vm.parseJsonAddress(json, ".KinForwarder");
        address ausd = vm.parseJsonAddress(json, ".AUSD");
        require(fwd.code.length != 0 && ausd.code.length != 0, "forwarder/AUSD missing on this chain");

        vm.startBroadcast();
        address pot = address(new KinPot(fwd, ausd));
        vm.stopBroadcast();

        vm.writeJson(vm.toString(pot), path, ".KinPot");
    }
}
