import { Suspense } from "react";
import { Proof } from "./Proof";

export default function DetailsPage() {
  return (
    <Suspense>
      <Proof />
    </Suspense>
  );
}
