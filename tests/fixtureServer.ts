import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface Route {
  status?: number
  headers?: Record<string, string>
  body?: string | Buffer
}

export class FixtureServer {
  private server: Server
  constructor(private routes: Record<string, Route>) {
    this.server = createServer((req, res) => {
      const route = this.routes[req.url ?? '/']
      if (!route) {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('<html><body>not found</body></html>')
        return
      }
      res.writeHead(route.status ?? 200, { 'content-type': 'text/html', ...route.headers })
      res.end(route.body ?? '<html><body>ok</body></html>')
    })
  }
  /** Replace the routes after listen(), so fixtures can embed the server's own base URL. */
  set(routes: Record<string, Route>): void {
    this.routes = routes
  }
  async listen(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r))
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.server.close((e) => (e ? reject(e) : resolve())))
  }
}
