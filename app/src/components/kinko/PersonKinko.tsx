"use client";
import type { Address } from "viem";
import { useName } from "@/components/programs/kit";
import { useAccount } from "@/lib/account";
import { useAvatarLook } from "@/lib/kinko";
import { Kinko, type Mood } from "./Kinko";

type Props = { size?: number; mood?: Mood; avatar?: boolean; viewBox?: string };

/** A person's own Kinko: theirs from this phone if it's me, else their published look, else the stable default. */
export function PersonKinko({ name, ...rest }: Props & { name?: string }) {
  return <Kinko look={useAvatarLook(name?.replace(/^@/, "") || undefined)} {...rest} />;
}

/** Same, when you only have their account address (e.g. circle members). */
export function AddressKinko({ address, ...rest }: Props & { address?: Address }) {
  return <PersonKinko name={useName(address) || undefined} {...rest} />;
}

/** The signed-in user's own customised Kinko. */
export function MyKinko(props: Props) {
  return <PersonKinko name={useAccount().profile?.name} {...props} />;
}
