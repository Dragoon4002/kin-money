// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {KinCircle} from "../src/KinCircle.sol";

/// @notice Deploys KinCircle against the existing forwarder + AUSD in deployments/<chainId>.json (redeploy).
///         Prints the address; set `.KinCircle` in the deployments json yourself (jq) so parallel edits don't race.
contract DeployCircle is Script {
    function run() external {
        string memory json = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        address fwd = vm.parseJsonAddress(json, ".KinForwarder");
        address ausd = vm.parseJsonAddress(json, ".AUSD");
        require(fwd.code.length != 0 && ausd.code.length != 0, "forwarder/AUSD missing on this chain");

        vm.startBroadcast();
        address circle = address(new KinCircle(fwd, ausd));
        vm.stopBroadcast();
        console.log("KinCircle", circle);
    }
}
