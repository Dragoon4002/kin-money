import { redirect } from "next/navigation";

// Settings moved into /me.
export default function Settings() {
  redirect("/me");
}
