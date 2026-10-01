// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {KinTest} from "./KinTest.sol";
import {KinNames} from "../src/KinNames.sol";

contract KinNamesTest is KinTest {
    KinNames names;

    function setUp() public override {
        super.setUp();
        names = new KinNames(address(fwd));
    }

    function test_Claim() public {
        vm.expectEmit(address(names));
        emit KinNames.NameClaimed(alice, "alice_1");
        vm.prank(alice);
        names.claim("alice_1");
        assertEq(names.resolve("alice_1"), alice);
        assertEq(names.nameOf(alice), "alice_1");
    }

    function test_RevertInvalid() public {
        string[5] memory bad = ["ab", "abcdefghijklmnopqrstu", "Alice", "al-ice", "al ice"];
        for (uint256 i; i < bad.length; ++i) {
            vm.expectRevert(KinNames.InvalidName.selector);
            vm.prank(alice);
            names.claim(bad[i]);
        }
    }

    function test_RevertTakenAndAlreadyNamed() public {
        vm.prank(alice);
        names.claim("mom");
        vm.expectRevert(KinNames.NameTaken.selector);
        vm.prank(bob);
        names.claim("mom");
        vm.expectRevert(KinNames.AlreadyNamed.selector);
        vm.prank(alice);
        names.claim("mom2");
    }

    function test_ClaimViaForwarder() public {
        _forward(BOB_PK, address(names), abi.encodeCall(KinNames.claim, ("bob")));
        assertEq(names.resolve("bob"), bob);
    }
}
