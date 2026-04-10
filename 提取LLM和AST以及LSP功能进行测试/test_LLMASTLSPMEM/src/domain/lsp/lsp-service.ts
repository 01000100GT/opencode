/**
 * LSP领域服务
 * 核心业务逻辑：语言服务器协议交互
 */

import type {
  Position,
  Diagnostic,
  DocumentSymbol,
  WorkspaceSymbol,
  Location,
  Hover,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  LSPOperation,
  LSPResponse,
} from "./types"

export interface LSPClient {
  initialize(rootUri: string): Promise<void>
  openDocument(uri: string, languageId: string, content: string): Promise<void>
  changeDocument(uri: string, content: string): Promise<void>
  closeDocument(uri: string): Promise<void>
  getDiagnostics(uri: string): Promise<Diagnostic[]>
  getAllDiagnostics(): Promise<Record<string, Diagnostic[]>>
  definition(uri: string, position: Position): Promise<Location[]>
  references(uri: string, position: Position): Promise<Location[]>
  hover(uri: string, position: Position): Promise<Hover | null>
  documentSymbol(uri: string): Promise<DocumentSymbol[]>
  workspaceSymbol(query: string): Promise<WorkspaceSymbol[]>
  implementation(uri: string, position: Position): Promise<Location[]>
  prepareCallHierarchy(uri: string, position: Position): Promise<CallHierarchyItem[]>
  incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]>
  outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]>
  shutdown(): Promise<void>
}

export interface FileInfo {
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  normalize(path: string): string
  toUri(path: string): string
  fromUri(uri: string): string
}

export class LSPService {
  private clients: Map<string, LSPClient> = new Map()
  private fileLanguageMap: Map<string, string> = new Map([
    [".ts", "typescript"],
    [".tsx", "typescriptreact"],
    [".js", "javascript"],
    [".jsx", "javascriptreact"],
    [".py", "python"],
    [".rs", "rust"],
    [".go", "go"],
    [".java", "java"],
  ])

  constructor(
    private fs: FileInfo,
    private rootUri: string,
  ) {}

  async registerClient(languageId: string, client: LSPClient): Promise<void> {
    await client.initialize(this.rootUri)
    this.clients.set(languageId, client)
  }

  async touchFile(filePath: string, waitForDiagnostics = false): Promise<void> {
    const uri = this.fs.toUri(filePath)
    const languageId = this.detectLanguage(filePath)
    const client = this.clients.get(languageId)

    if (!client) return

    const exists = await this.fs.exists(filePath)
    if (!exists) return

    const content = await this.fs.read(filePath)
    await client.changeDocument(uri, content)

    if (waitForDiagnostics) {
      await this.delay(150)
    }
  }

  async diagnostics(): Promise<Record<string, Diagnostic[]>> {
    const allDiagnostics: Record<string, Diagnostic[]> = {}

    for (const [langId, client] of this.clients) {
      const diagnostics = await client.getAllDiagnostics()
      Object.assign(allDiagnostics, diagnostics)
    }

    return allDiagnostics
  }

  async execute<T>(
    operation: LSPOperation,
    filePath: string,
    line: number,
    character: number,
  ): Promise<LSPResponse<T>> {
    const uri = this.fs.toUri(filePath)
    const languageId = this.detectLanguage(filePath)
    const client = this.clients.get(languageId)

    if (!client) {
      return { success: false, error: `No LSP client available for ${languageId}` }
    }

    const exists = await this.fs.exists(filePath)
    if (!exists) {
      return { success: false, error: `File not found: ${filePath}` }
    }

    await this.touchFile(filePath, true)

    const position: Position = { line: line - 1, character: character - 1 }

    try {
      let result: T

      switch (operation) {
        case "goToDefinition":
          result = await client.definition(uri, position) as T
          break
        case "findReferences":
          result = await client.references(uri, position) as T
          break
        case "hover":
          result = await client.hover(uri, position) as T
          break
        case "documentSymbol":
          result = await client.documentSymbol(uri) as T
          break
        case "workspaceSymbol":
          result = await client.workspaceSymbol("") as T
          break
        case "goToImplementation":
          result = await client.implementation(uri, position) as T
          break
        case "prepareCallHierarchy":
          result = await client.prepareCallHierarchy(uri, position) as T
          break
        case "incomingCalls": {
          const items = await client.prepareCallHierarchy(uri, position)
          if (items.length === 0) {
            return { success: true, data: [] as T }
          }
          result = await client.incomingCalls(items[0]) as T
          break
        }
        case "outgoingCalls": {
          const items = await client.prepareCallHierarchy(uri, position)
          if (items.length === 0) {
            return { success: true, data: [] as T }
          }
          result = await client.outgoingCalls(items[0]) as T
          break
        }
        default:
          return { success: false, error: `Unknown operation: ${operation}` }
      }

      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async shutdown(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.shutdown()
    }
    this.clients.clear()
  }

  hasClient(filePath: string): boolean {
    const languageId = this.detectLanguage(filePath)
    return this.clients.has(languageId)
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.substring(filePath.lastIndexOf("."))
    return this.fileLanguageMap.get(ext) || "plaintext"
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
