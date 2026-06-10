import { StrategyClient } from "./strategy-client";

export default async function CourseStrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StrategyClient courseId={id} />;
}
