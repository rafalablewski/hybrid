import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin";

// The whole /admin surface is gated HERE, server-side, before any admin UI or
// data is sent to the browser. A non-admin (or signed-out) request never sees
// the panel — it's bounced to login. This is the real boundary; the
// client shell is just chrome. Maps cleanly onto an `admin.` subdomain later
// (a host rewrite to /admin inherits this exact guard).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return <>{children}</>;
}
