import type { Metadata } from "next";
import StatusPage from "@/components/StatusPage";

export const metadata: Metadata = {
  title: "Not found — Erudent",
};

export default function NotFound() {
  return <StatusPage code="404" line="There exists no such page." />;
}
