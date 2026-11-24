export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="border-b border-rule px-6 pb-5 pt-6 lg:px-10">
        <div className="h-3 w-40 rounded bg-wash" />
        <div className="mt-4 h-8 w-[min(520px,80%)] rounded bg-wash" />
        <div className="mt-3 h-3 w-64 rounded bg-wash" />
      </div>
      <div className="space-y-3 px-6 py-6 lg:px-10">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-14 rounded-lg bg-wash" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}
