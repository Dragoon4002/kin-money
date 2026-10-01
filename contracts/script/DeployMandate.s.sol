// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {KinMandate} from "../src/KinMandate.sol";

/// @notice Deploys KinMandate against the existing forwarder + AUSD in deployments/<chainId>.json and adds its key.
contract DeployMandate is Script {
    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        address fwd = vm.parseJsonAddress(json, ".KinForwarder");
        address ausd = vm.parseJsonAddress(json, ".AUSD");
        require(fwd.code.length != 0 && ausd.code.length != 0, "forwarder/AUSD missing on this chain");

        vm.startBroadcast();
        address mandate = address(new KinMandate(fwd, ausd));
        vm.stopBroadcast();

        vm.writeJson(vm.toString(mandate), path, ".KinMandate");
    }
}
