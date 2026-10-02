import { Redirect } from "expo-router";
import { useAccount } from "@/lib/account";

/** Gate: account with a Kin name → tabs; otherwise onboarding. */
export default function Index() {
  const { profile } = useAccount();
  return <Redirect href={profile?.name ? "/tabs" : "/onboard"} />;
}
