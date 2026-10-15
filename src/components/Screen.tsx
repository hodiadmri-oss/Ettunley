import type { ReactNode } from 'react'

interface ScreenProps {
  title: string
  subtitle?: string
  children: ReactNode
}

// One calm column per screen, centred, with a large title.
export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-8">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="text-lg text-ink/70">{subtitle}</p>}
      </header>
      {children}
    </main>
  )
}
