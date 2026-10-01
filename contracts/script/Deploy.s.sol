// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {KinForwarder} from "../src/KinForwarder.sol";
import {KinNames} from "../src/KinNames.sol";
import {KinEscrow} from "../src/KinEscrow.sol";
import {KinStream} from "../src/KinStream.sol";
import {KinPot} from "../src/KinPot.sol";
import {KinCircle} from "../src/KinCircle.sol";

/// @notice Deploys all Kin contracts and writes deployments/<chainId>.json.
/// Env: AUSD (token address). Run with --private-key / --broadcast (see monad-deploy skill).
contract Deploy is Script {
    function run() external {
        address ausd = vm.envAddress("AUSD");
        require(ausd.code.length != 0 || block.chainid == 31337, "AUSD has no code on this chain");

        vm.startBroadcast();
        address fwd = address(new KinForwarder());
        address names = address(new KinNames(fwd));
        address escrow = address(new KinEscrow(fwd, ausd));
        address stream = address(new KinStream(fwd, ausd));
        address pot = address(new KinPot(fwd, ausd));
        address circle = address(new KinCircle(fwd, ausd));
        vm.stopBroadcast();

        string memory k = "deploy";
        vm.serializeAddress(k, "AUSD", ausd);
        vm.serializeAddress(k, "KinForwarder", fwd);
        vm.serializeAddress(k, "KinNames", names);
        vm.serializeAddress(k, "KinEscrow", escrow);
        vm.serializeAddress(k, "KinStream", stream);
        vm.serializeAddress(k, "KinPot", pot);
        string memory json = vm.serializeAddress(k, "KinCircle", circle);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
