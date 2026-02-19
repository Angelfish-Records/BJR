// web/app/(site)/home/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function HomeRootRedirect() {
  redirect("/home/player");
}
