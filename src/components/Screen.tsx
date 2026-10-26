import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface ScreenProps {
  title: string
  subtitle?: string
  children: ReactNode
  /** Long screens (lists, forms) start at the top instead of being centred. */
  top?: boolean
  /** A small "back" link above the title. */
  backTo?: string
  backLabel?: string
}

// One calm column per screen, centred, with a large title.
export function Screen({ title, subtitle, children, top = false, backTo, backLabel = 'חזרה' }: ScreenProps) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-8 ${top ? 'justify-start' : 'justify-center'}`}
    >
      <header className="flex flex-col gap-2 text-center">
        {backTo && (
          <Link to={backTo} className="self-start rounded-xl py-2 pe-3 text-base underline">
            → {backLabel}
          </Link>
        )}
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="text-lg text-ink/70">{subtitle}</p>}
      </header>
      {children}
    </main>
  )
}
