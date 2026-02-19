import { redirect } from "next/navigation";

interface RunPageProps {
  params: Promise<{ runId: string }>;
}

export default async function LegacyRunPage({ params }: RunPageProps) {
  const { runId } = await params;
  redirect(`/audits/${runId}`);
}
