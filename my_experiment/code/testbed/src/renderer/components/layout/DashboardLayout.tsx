import React, { useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function DashboardLayout() {
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()

    // Create a simple custom context menu
    const menu = document.createElement('div')
    menu.className = 'fixed z-[9999] bg-[#262626] border border-[#393939] py-1 text-sm text-[#f4f4f4] shadow-lg'
    menu.style.left = `${e.clientX}px`
    menu.style.top = `${e.clientY}px`

    const items = [
      {
        label: 'Screenshot to Clipboard',
        shortcut: '',
        action: async () => {
          try {
            await window.electronAPI.screenshotToClipboard()
          } catch (err) {
            console.error('Screenshot failed:', err)
          }
        }
      },
      {
        label: 'Screenshot to File...',
        shortcut: '',
        action: async () => {
          try {
            await window.electronAPI.takeScreenshot()
          } catch (err) {
            console.error('Screenshot failed:', err)
          }
        }
      },
      { label: 'separator' },
      {
        label: 'Reload',
        shortcut: 'Ctrl+R',
        action: () => window.location.reload()
      },
      {
        label: 'Toggle DevTools',
        shortcut: 'F12',
        action: () => {
          // Electron DevTools toggle via keyboard shortcut simulation
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F12', code: 'F12' }))
        }
      },
    ]

    items.forEach(item => {
      if (item.label === 'separator') {
        const hr = document.createElement('div')
        hr.className = 'border-t border-[#393939] my-1'
        menu.appendChild(hr)
        return
      }
      const btn = document.createElement('button')
      btn.className = 'w-full text-left px-4 py-1.5 hover:bg-[#353535] flex items-center justify-between gap-8 transition-colors'
      btn.innerHTML = `<span>${item.label}</span>${item.shortcut ? `<span class="text-[#6f6f6f] text-xs">${item.shortcut}</span>` : ''}`
      btn.onclick = () => {
        menu.remove()
        item.action?.()
      }
      menu.appendChild(btn)
    })

    document.body.appendChild(menu)

    // Close on click anywhere else
    const close = () => { menu.remove(); document.removeEventListener('click', close) }
    setTimeout(() => document.addEventListener('click', close), 0)
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface" onContextMenu={handleContextMenu}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
