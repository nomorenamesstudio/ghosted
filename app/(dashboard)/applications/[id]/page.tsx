import { ApplicationDetail } from "@/components/ApplicationDetail";

export default function ApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <ApplicationDetail id={params.id} />;
}
