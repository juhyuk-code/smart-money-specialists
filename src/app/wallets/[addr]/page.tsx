import { redirect } from "next/navigation";

export default function WalletDetailPage({
  params: _params,
}: {
  params: { addr: string };
}) {
  void _params;
  redirect("/");
}
