import { WalletDetailSurface } from "@/components/ProductSurfaces";

export default function WalletDetailPage({
  params,
}: {
  params: { addr: string };
}) {
  return <WalletDetailSurface wallet={decodeURIComponent(params.addr)} />;
}
