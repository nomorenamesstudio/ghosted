import { ApplicationDetail } from "@/components/ApplicationDetail";

/**
 * Next 15 hands `params` in as a promise: a page can now start rendering before
 * the route's segments are resolved, which is what makes streaming a slow child
 * possible. The await is the whole change.
 */
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationDetail id={id} />;
}
