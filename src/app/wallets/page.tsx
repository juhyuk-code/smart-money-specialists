import { redirect } from "next/navigation";
import { WalletsSurface } from "@/components/ProductSurfaces";

export default function WalletsIndex({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  if (searchParams?.category) {
    redirect("/wallets");
  }

  return <WalletsSurface category={searchParams?.category ?? "all"} />;
}
