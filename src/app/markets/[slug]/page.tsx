import { MarketDetailSurface } from "@/components/MarketDetailSurface";

export default function MarketDetailPage({ params }: { params: { slug: string } }) {
  return <MarketDetailSurface marketId={decodeURIComponent(params.slug)} />;
}
