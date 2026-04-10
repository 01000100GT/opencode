/**
 * Mock LSP Client适配器
 * 用于测试，模拟LSP服务器响应
 */

import type {
  LSPClient,
  Position,
  Diagnostic,
  DocumentSymbol,
  WorkspaceSymbol,
  Location,
  Hover,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
} from "../domain/lsp"

export class MockLSPClient implements LSPClient {
  private diagnostics: Map<string, Diagnostic[]> = new Map()
  private initialized = false

  async initialize(): Promise<void> {
    this.initialized = true
  }

  async openDocument(uri: string): Promise<void> {
    if (!this.diagnostics.has(uri)) {
      this.diagnostics.set(uri, [])
    }
  }

  async changeDocument(uri: string): Promise<void> {
    // 模拟诊断更新
    const mockDiagnostics = this.generateMockDiagnostics(uri)
    this.diagnostics.set(uri, mockDiagnostics)
  }

  async closeDocument(): Promise<void> {}

  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    return this.diagnostics.get(uri) || []
  }

  async getAllDiagnostics(): Promise<Record<string, Diagnostic[]>> {
    const result: Record<string, Diagnostic[]> = {}
    for (const [uri, diags] of this.diagnostics) {
      result[uri] = diags
    }
    return result
  }

  async definition(uri: string, position: Position): Promise<Location[]> {
    return [{
      uri: uri.replace(".ts", "_def.ts"),
      range: {
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: 10 },
      },
    }]
  }

  async references(uri: string, position: Position): Promise<Location[]> {
    return [
      { uri, range: { start: position, end: { line: position.line, character: position.character + 5 } } },
    ]
  }

  async hover(uri: string, position: Position): Promise<Hover | null> {
    return {
      contents: `Hover information for ${uri} at line ${position.line}`,
      range: {
        start: position,
        end: { line: position.line, character: position.character + 5 },
      },
    }
  }

  async documentSymbol(uri: string): Promise<DocumentSymbol[]> {
    return [
      {
        name: "mockFunction",
        kind: 12, // Function
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } },
        selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } },
      },
    ]
  }

  async workspaceSymbol(): Promise<WorkspaceSymbol[]> {
    return [
      {
        name: "MockClass",
        kind: 5, // Class
        location: {
          uri: "file:///mock/file.ts",
          range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
        },
      },
    ]
  }

  async implementation(uri: string, position: Position): Promise<Location[]> {
    return this.definition(uri, position)
  }

  async prepareCallHierarchy(uri: string, position: Position): Promise<CallHierarchyItem[]> {
    return [{
      name: "mockCaller",
      kind: 12,
      uri,
      range: { start: position, end: { line: position.line, character: position.character + 5 } },
      selectionRange: { start: position, end: { line: position.line, character: position.character + 5 } },
    }]
  }

  async incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[]> {
    return [{
      from: {
        name: "callerFunction",
        kind: 12,
        uri: item.uri,
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
        selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 14 } },
      },
      fromRanges: [item.range],
    }]
  }

  async outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]> {
    return [{
      to: {
        name: "calleeFunction",
        kind: 12,
        uri: item.uri,
        range: { start: { line: 10, character: 0 }, end: { line: 15, character: 1 } },
        selectionRange: { start: { line: 10, character: 0 }, end: { line: 10, character: 14 } },
      },
      fromRanges: [item.range],
    }]
  }

  async shutdown(): Promise<void> {
    this.initialized = false
  }

  private generateMockDiagnostics(uri: string): Diagnostic[] {
    // 随机生成一些诊断信息用于测试
    const hasError = Math.random() > 0.7
    if (!hasError) return []

    return [{
      range: {
        start: { line: 5, character: 10 },
        end: { line: 5, character: 20 },
      },
      severity: 1,
      code: "TS2345",
      source: "typescript",
      message: `Mock error in ${uri}: Argument of type 'string' is not assignable to parameter of type 'number'.`,
    }]
  }
}
