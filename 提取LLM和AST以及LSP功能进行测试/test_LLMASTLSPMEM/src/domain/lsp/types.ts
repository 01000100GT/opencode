/**
 * LSP领域类型定义
 * 基于Language Server Protocol规范
 */

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface Location {
  uri: string
  range: Range
}

export interface Diagnostic {
  range: Range
  severity: 1 | 2 | 3 | 4
  code?: string | number
  source?: string
  message: string
}

export interface DocumentSymbol {
  name: string
  kind: number
  range: Range
  selectionRange: Range
  children?: DocumentSymbol[]
}

export interface WorkspaceSymbol {
  name: string
  kind: number
  location: Location
}

export interface Hover {
  contents: string | { language: string; value: string }
  range?: Range
}

export interface CallHierarchyItem {
  name: string
  kind: number
  uri: string
  range: Range
  selectionRange: Range
}

export interface CallHierarchyIncomingCall {
  from: CallHierarchyItem
  fromRanges: Range[]
}

export interface CallHierarchyOutgoingCall {
  to: CallHierarchyItem
  fromRanges: Range[]
}

export type LSPOperation =
  | "goToDefinition"
  | "findReferences"
  | "hover"
  | "documentSymbol"
  | "workspaceSymbol"
  | "goToImplementation"
  | "prepareCallHierarchy"
  | "incomingCalls"
  | "outgoingCalls"

export interface LSPRequest {
  operation: LSPOperation
  filePath: string
  line: number
  character: number
}

export interface LSPResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
