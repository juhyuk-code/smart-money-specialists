import { WalletsSurface } from "@/components/ProductSurfaces";

export default function WalletsIndex({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  return <WalletsSurface category={searchParams?.category ?? "all"} />;
}
