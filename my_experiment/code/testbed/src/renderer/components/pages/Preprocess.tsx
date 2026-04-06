import React, { useState } from 'react'
import { Film, QrCode, FolderOpen } from 'lucide-react'
import { api } from '../../api/client'

export default function Preprocess() {
  const [filePath, setFilePath] = useState('')
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [fps, setFps] = useState(24)
  const [converting, setConverting] = useState(false)
  const [overlaying, setOverlaying] = useState(false)
  const [status, setStatus] = useState('')

  const handleSelectFile = async () => {
    const path = await window.electronAPI.openFile({
      filters: [
        { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'yuv'] }
      ]
    })
    if (path) setFilePath(path)
  }

  const handleConvert = async () => {
    if (!filePath) return
    setConverting(true)
    setStatus('Converting to YUV...')
    try {
      await api('/api/preprocess/convert', {
        method: 'POST',
        body: JSON.stringify({ file_path: filePath, width, height, fps })
      })
      setStatus('Conversion complete!')
    } catch (err) {
      setStatus(`Error: ${err}`)
    } finally {
      setConverting(false)
    }
  }

  const handleQROverlay = async () => {
    if (!filePath) return
    setOverlaying(true)
    setStatus('Overlaying QR codes...')
    try {
      await api('/api/preprocess/qrcode', {
        method: 'POST',
        body: JSON.stringify({ file_path: filePath, width, height, fps })
      })
      setStatus('QR overlay complete!')
    } catch (err) {
      setStatus(`Error: ${err}`)
    } finally {
      setOverlaying(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#f4f4f4]">Pre-processing</h2>
        <p className="text-sm text-[#c6c6c6] mt-1">
          Convert video to YUV format and overlay QR codes for frame tracking
        </p>
      </div>

      <div className="bg-surface-secondary border border-[#393939] rounded-none p-6 max-w-2xl">
        {/* File selection */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-[#c6c6c6] mb-2">
            Source Video
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={filePath}
              readOnly
              placeholder="Select a video file..."
              className="flex-1 bg-surface border border-[#393939] rounded-none px-3 py-2 text-sm text-[#f4f4f4] placeholder-[#6f6f6f]"
            />
            <button
              onClick={handleSelectFile}
              className="px-4 py-2 bg-surface-tertiary hover:bg-[#525252] text-[#f4f4f4] rounded-none text-sm font-medium transition-colors flex items-center gap-2"
            >
              <FolderOpen size={16} />
              Browse
            </button>
          </div>
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-sm font-medium text-[#c6c6c6] mb-2">Width</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              min={64}
              max={7680}
              className="w-full bg-surface border border-[#393939] rounded-none px-3 py-2 text-sm text-[#f4f4f4]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#c6c6c6] mb-2">Height</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              min={64}
              max={4320}
              className="w-full bg-surface border border-[#393939] rounded-none px-3 py-2 text-sm text-[#f4f4f4]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#c6c6c6] mb-2">FPS</label>
            <input
              type="number"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              min={1}
              max={120}
              className="w-full bg-surface border border-[#393939] rounded-none px-3 py-2 text-sm text-[#f4f4f4]"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleConvert}
            disabled={!filePath || converting}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-[#f4f4f4] rounded-none text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Film size={16} />
            {converting ? 'Converting...' : 'Convert to YUV'}
          </button>
          <button
            onClick={handleQROverlay}
            disabled={!filePath || overlaying}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-[#f4f4f4] rounded-none text-sm font-medium transition-colors flex items-center gap-2"
          >
            <QrCode size={16} />
            {overlaying ? 'Overlaying...' : 'Add QR Codes'}
          </button>
        </div>

        {/* Status */}
        {status && (
          <div className="mt-4 px-4 py-3 bg-surface rounded-none border border-[#393939]">
            <p className="text-sm text-[#c6c6c6]">{status}</p>
          </div>
        )}
      </div>
    </div>
  )
}
