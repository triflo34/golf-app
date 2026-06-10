import { StrategyClient } from "./strategy-client";

export default async function CourseStrategyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hole?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const initialHole = Number(sp.hole);
  return (
    <StrategyClient
      courseId={id}
      initialHole={Number.isInteger(initialHole) && initialHole >= 1 && initialHole <= 36 ? initialHole : 1}
    />
  );
}
