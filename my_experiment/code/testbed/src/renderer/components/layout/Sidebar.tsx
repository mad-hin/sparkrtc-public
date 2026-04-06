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
    <aside className="w-56 bg-surface-secondary flex flex-col h-full border-r border-[#393939]">
      {/* Logo — Carbon masthead style */}
      <div className="px-4 py-4 border-b border-[#393939]">
        <h1 className="text-body-long font-semibold text-[#f4f4f4] tracking-tight">SparkRTC</h1>
        <p className="text-caption text-[#6f6f6f] mt-0.5">Experiment Testbed</p>
      </div>

      {/* Nav — Carbon side-nav pattern: no border-radius, left-border active indicator */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-body-short font-normal transition-colors border-l-[3px] ${
                isActive
                  ? 'border-accent bg-[#353535] text-[#f4f4f4]'
                  : 'border-transparent text-[#c6c6c6] hover:text-[#f4f4f4] hover:bg-[#353535]'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.5} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#393939]">
        <p className="text-caption text-[#525252]">v1.0.0</p>
      </div>
    </aside>
  )
}
