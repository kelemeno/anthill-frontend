// Placeholders in the shape of what's loading, so pages keep their layout and
// the content fades in where it belongs.
import { Card, cx } from "../ui";

export function Skeleton(props: { className?: string; round?: boolean }) {
  return (
    <div
      aria-hidden
      className={cx("animate-pulse bg-slate-200/70", props.round ? "rounded-full" : "rounded-md", props.className)}
    />
  );
}

// A faint tree (1, 2, 4, 8 circles) breathing while the real one loads.
export function GhostTree(props: { className?: string }) {
  const W = 480;
  const levels = [1, 2, 4, 8];
  const nodes = levels.flatMap((count, depth) =>
    Array.from({ length: count }, (_, i) => ({
      x: ((i + 0.5) * W) / count,
      y: 30 + depth * 72,
      r: depth === 0 ? 18 : 14 - depth,
      depth,
      i,
    })),
  );
  return (
    <svg viewBox={`0 0 ${W} ${30 + 3 * 72 + 40}`} className={cx("w-full", props.className)} aria-label="Loading the tree">
      {nodes
        .filter((n) => n.depth > 0)
        .map((n) => {
          const parent = { x: ((Math.floor(n.i / 2) + 0.5) * W) / levels[n.depth - 1], y: n.y - 72 };
          const my = (parent.y + n.y) / 2;
          return (
            <path
              key={`l-${n.depth}-${n.i}`}
              d={`M ${parent.x} ${parent.y} C ${parent.x} ${my}, ${n.x} ${my}, ${n.x} ${n.y}`}
              className="fill-none stroke-slate-200"
              strokeWidth={1.5}
            />
          );
        })}
      {nodes.map((n) => (
        <circle
          key={`${n.depth}-${n.i}`}
          cx={n.x}
          cy={n.y}
          r={n.r}
          className="animate-pulse fill-slate-200"
          style={{ animationDelay: `${n.depth * 150}ms` }}
        />
      ))}
    </svg>
  );
}

// Rows like PersonRow: avatar, name, detail.
export function RowsSkeleton(props: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-50">
      {Array.from({ length: props.rows ?? 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2.5">
          <Skeleton round className="h-9 w-9 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cx("h-3.5", ["w-1/2", "w-2/5", "w-3/5"][i % 3])} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// The "You" overview: the header card, next steps and sources, the neighbourhood.
export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-4">
          <Skeleton round className="h-[60px] w-[60px] shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="mt-5 h-8 w-48" />
      </Card>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <Skeleton className="mb-4 h-4 w-32" />
            <RowsSkeleton rows={3} />
          </Card>
          <Card>
            <Skeleton className="mb-4 h-4 w-56" />
            <Skeleton className="mb-3 h-2.5 w-full" />
            <RowsSkeleton rows={2} />
          </Card>
        </div>
        <Card>
          <Skeleton className="mb-4 h-4 w-40" />
          <GhostTree />
        </Card>
      </div>
    </div>
  );
}

// Cards like the communities on the home page.
export function CardGridSkeleton(props: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: props.cards ?? 3 }, (_, i) => (
        <Card key={i}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="mt-4 h-3 w-full" />
          <Skeleton className="mt-2 h-5 w-24" />
        </Card>
      ))}
    </div>
  );
}
