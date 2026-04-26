export default function Loading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 animate-pulse space-y-4">
      <div className="h-4 w-40 skeleton" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-card-bg border border-card-border rounded" />
        ))}
      </div>
      <div className="h-[340px] bg-card-bg border border-card-border rounded" />
      <div className="h-[200px] bg-card-bg border border-card-border rounded" />
    </div>
  )
}
