// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {KinKeeper} from "../src/KinKeeper.sol";

/// @notice Deploys KinKeeper (CRE receiver) against the Kin contracts in deployments/<chainId>.json and adds its key.
///         CRE_FORWARDER defaults to the testnet simulation forwarder.
contract DeployKinKeeper is Script {
    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        address cre = vm.envOr("CRE_FORWARDER", address(0xB9F79d863261869B234c481D1f9A7af84AeAd192));
        address mandate = vm.parseJsonAddress(json, ".KinMandate");
        address giftLink = vm.parseJsonAddress(json, ".KinGiftLink");
        address circle = vm.parseJsonAddress(json, ".KinCircle");
        address escrow = vm.parseJsonAddress(json, ".KinEscrow");
        require(
            mandate.code.length != 0 && giftLink.code.length != 0 && circle.code.length != 0 && escrow.code.length != 0,
            "Kin contracts missing on this chain"
        );

        vm.startBroadcast();
        address keeper = address(new KinKeeper(cre, mandate, giftLink, circle, escrow));
        vm.stopBroadcast();

        vm.writeJson(vm.toString(keeper), path, ".KinKeeper");
    }
}
