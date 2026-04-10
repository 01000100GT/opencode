/**
 * 记忆框架领域类型定义
 * 支持短期工作记忆和长期持久化记忆
 */

export interface MemoryEntry {
  id: string
  type: MemoryType
  content: string
  metadata: MemoryMetadata
  createdAt: number
  updatedAt: number
  accessCount: number
  lastAccessedAt: number
}

export type MemoryType =
  | "conversation"
  | "code_context"
  | "file_operation"
  | "lsp_diagnostic"
  | "ast_analysis"
  | "user_preference"
  | "project_context"

export interface MemoryMetadata {
  source?: string
  filePath?: string
  lineRange?: { start: number; end: number }
  tags: string[]
  importance: number
  relevanceScore?: number
}

export interface MemoryQuery {
  types?: MemoryType[]
  tags?: string[]
  source?: string
  filePath?: string
  timeRange?: { start: number; end: number }
  minImportance?: number
  limit?: number
  offset?: number
}

export interface MemorySearchResult {
  entries: MemoryEntry[]
  total: number
  hasMore: boolean
}

export interface ContextWindow {
  maxTokens: number
  currentTokens: number
  entries: MemoryEntry[]
}

export interface MemoryStats {
  totalEntries: number
  entriesByType: Record<MemoryType, number>
  oldestEntry: number
  newestEntry: number
  averageImportance: number
}
