import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/teacher', label: 'התלמידים שלי', end: true },
  { to: '/teacher/area', label: 'איזור המורה שלי', end: false },
  { to: '/teacher/settings', label: 'הגדרות', end: false },
]

// The teacher's three areas, always one tap away.
export function TeacherTabs() {
  return (
    <nav aria-label="אזורי המורה" className="grid grid-cols-3 gap-1 rounded-2xl bg-peach p-1">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex min-h-12 items-center justify-center rounded-xl px-1 text-center text-base leading-tight ${isActive ? 'bg-ink font-bold text-white' : 'text-ink'}`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
