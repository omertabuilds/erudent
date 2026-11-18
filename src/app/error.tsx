"use client";

import { useEffect } from "react";
import StatusPage from "@/components/StatusPage";

/** Any uncaught error under the root layout. */
export default function Error({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <StatusPage code="ERROR" line="Something went wrong on our side." />;
}
