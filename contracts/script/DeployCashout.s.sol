// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {KinCashout} from "../src/KinCashout.sol";

/// @notice Deploys KinCashout against the existing forwarder + AUSD in deployments/<chainId>.json and Agora's
///         Instant Settlement pair (env AGORA_PAIR), then whitelists it as a swapper via Agora's testnet Whitelister
///         (env AGORA_WHITELISTER, optional: on mainnet Agora whitelists after verification).
contract DeployCashout is Script {
    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        address fwd = vm.parseJsonAddress(json, ".KinForwarder");
        address ausd = vm.parseJsonAddress(json, ".AUSD");
        address pair = vm.envAddress("AGORA_PAIR");
        address whitelister = vm.envOr("AGORA_WHITELISTER", address(0));
        require(fwd.code.length != 0 && ausd.code.length != 0 && pair.code.length != 0, "forwarder/AUSD/pair missing");

        vm.startBroadcast();
        address cash = address(new KinCashout(fwd, ausd, pair));
        if (whitelister != address(0)) {
            (bool ok,) = whitelister.call(abi.encodeWithSignature("setApprovedSwapper(address)", cash));
            require(ok, "whitelist failed");
        }
        vm.stopBroadcast();

        vm.writeJson(vm.toString(cash), path, ".KinCashout");
        vm.writeJson(vm.toString(pair), path, ".AgoraPair");
    }
}
