export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-screen bg-ash-navy">
      <div className="w-10 h-10 border-4 border-ash-light border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
