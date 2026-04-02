let _baseUrl = ''

export async function initClient(): Promise<void> {
  const port = await window.electronAPI.getPythonPort()
  if (port) {
    _baseUrl = `http://127.0.0.1:${port}`
  }
}

export function getBaseUrl(): string {
  return _baseUrl
}

export function getWsUrl(): string {
  return _baseUrl.replace('http', 'ws')
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${_baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API error ${response.status}: ${text}`)
  }
  return response.json()
}

export function createWebSocket(path: string): WebSocket {
  return new WebSocket(`${getWsUrl()}${path}`)
}
