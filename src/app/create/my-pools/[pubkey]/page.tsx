import { Header } from "@/components/Header";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPoolPage({
  params,
}: {
  params: Promise<{ pubkey: string }>;
}) {
  const { pubkey } = await params;
  return (
    <>
      <Header />
      <AdminDashboard poolAddress={pubkey} />
    </>
  );
}
