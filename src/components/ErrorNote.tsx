export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-2xl bg-peach px-4 py-3 text-base">
      {message}
    </p>
  )
}
