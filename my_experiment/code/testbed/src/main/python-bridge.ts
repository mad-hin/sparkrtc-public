import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import * as net from 'net'

export class PythonBridge {
  private process: ChildProcess | null = null
  private port: number = 0

  async start(): Promise<void> {
    this.port = await this.findFreePort()
    const backendDir = join(__dirname, '../../backend')

    // Use uv to run the backend
    const args = ['run', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(this.port)]

    this.process = spawn('uv', args, {
      cwd: backendDir,
      env: { ...process.env, PYTHONPATH: join(backendDir, '..', '..') },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      console.log(`[backend] ${data.toString().trim()}`)
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      console.log(`[backend] ${data.toString().trim()}`)
    })

    this.process.on('exit', (code) => {
      console.log(`Python backend exited with code ${code}`)
    })

    // Wait for backend to be ready
    await this.waitForHealth(15000)
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
  }

  getPort(): number {
    return this.port
  }

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr !== 'string') {
          const port = addr.port
          server.close(() => resolve(port))
        } else {
          reject(new Error('Could not find free port'))
        }
      })
      server.on('error', reject)
    })
  }

  private async waitForHealth(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/api/health`)
        if (response.ok) return
      } catch {
        // Server not ready yet
      }
      await new Promise(r => setTimeout(r, 300))
    }
    throw new Error(`Backend did not start within ${timeoutMs}ms`)
  }
}
