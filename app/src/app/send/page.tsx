import { Suspense } from "react";
import { SendForm } from "./SendForm";

export default function SendPage() {
  return (
    <Suspense>
      <SendForm />
    </Suspense>
  );
}
