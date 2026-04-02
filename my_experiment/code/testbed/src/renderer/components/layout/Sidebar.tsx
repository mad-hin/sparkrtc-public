import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Film,
  Play,
  BrainCircuit,
  Bot,
  GitCompare,
  Settings
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/preprocess', icon: Film, label: 'Pre-process' },
  { to: '/experiment', icon: Play, label: 'Experiment' },
  { to: '/analysis', icon: BrainCircuit, label: 'Analysis' },
  { to: '/agent', icon: Bot, label: 'Code Agent' },
  { to: '/compare', icon: GitCompare, label: 'Compare' },
  { to: '/settings', icon: Settings, label: 'Settings' }
]

export default function Sidebar() {
  return (
    <aside className="w-56 bg-surface-secondary border-r border-slate-700 flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700">
        <h1 className="text-lg font-bold text-white tracking-tight">SparkRTC</h1>
        <p className="text-xs text-slate-400 mt-0.5">Experiment Testbed</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-tertiary/50'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-700">
        <p className="text-xs text-slate-500">v1.0.0</p>
      </div>
    </aside>
  )
}
