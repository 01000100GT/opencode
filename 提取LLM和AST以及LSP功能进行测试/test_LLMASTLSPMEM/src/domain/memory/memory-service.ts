/**
 * 记忆框架领域服务
 * 核心业务逻辑：记忆存储、检索、压缩和上下文管理
 */

import type {
  MemoryEntry,
  MemoryType,
  MemoryMetadata,
  MemoryQuery,
  MemorySearchResult,
  ContextWindow,
  MemoryStats,
} from "./types"

export interface StorageAdapter {
  save(entry: MemoryEntry): Promise<void>
  load(id: string): Promise<MemoryEntry | null>
  delete(id: string): Promise<void>
  query(filter: (entry: MemoryEntry) => boolean): Promise<MemoryEntry[]>
  clear(): Promise<void>
}

export interface Tokenizer {
  countTokens(text: string): number
}

export class MemoryService {
  private entries: Map<string, MemoryEntry> = new Map()
  private indices: Map<string, Set<string>> = new Map()

  constructor(
    private storage: StorageAdapter,
    private tokenizer: Tokenizer,
    private defaultMaxTokens = 4000,
  ) {}

  async initialize(): Promise<void> {
    const entries = await this.storage.query(() => true)
    for (const entry of entries) {
      this.entries.set(entry.id, entry)
      this.updateIndices(entry)
    }
  }

  async create(
    type: MemoryType,
    content: string,
    metadata: Partial<MemoryMetadata> = {},
  ): Promise<MemoryEntry> {
    const now = Date.now()
    const entry: MemoryEntry = {
      id: this.generateId(),
      type,
      content,
      metadata: {
        tags: metadata.tags || [],
        importance: metadata.importance ?? 5,
        source: metadata.source,
        filePath: metadata.filePath,
        lineRange: metadata.lineRange,
      },
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    }

    this.entries.set(entry.id, entry)
    this.updateIndices(entry)
    await this.storage.save(entry)

    return entry
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id)
    if (entry) {
      entry.accessCount++
      entry.lastAccessedAt = Date.now()
      await this.storage.save(entry)
    }
    return entry || null
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult> {
    let results = Array.from(this.entries.values())

    if (query.types && query.types.length > 0) {
      results = results.filter(e => query.types!.includes(e.type))
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(e => query.tags!.some(t => e.metadata.tags.includes(t)))
    }

    if (query.source) {
      results = results.filter(e => e.metadata.source === query.source)
    }

    if (query.filePath) {
      results = results.filter(e => e.metadata.filePath === query.filePath)
    }

    if (query.timeRange) {
      results = results.filter(
        e => e.createdAt >= query.timeRange!.start && e.createdAt <= query.timeRange!.end,
      )
    }

    if (query.minImportance !== undefined) {
      results = results.filter(e => e.metadata.importance >= query.minImportance!)
    }

    results.sort((a, b) => {
      const scoreA = this.calculateRelevanceScore(a)
      const scoreB = this.calculateRelevanceScore(b)
      return scoreB - scoreA
    })

    const total = results.length
    const offset = query.offset || 0
    const limit = query.limit || 20
    const paginated = results.slice(offset, offset + limit)

    return {
      entries: paginated,
      total,
      hasMore: offset + limit < total,
    }
  }

  async buildContextWindow(
    currentQuery?: string,
    maxTokens?: number,
  ): Promise<ContextWindow> {
    const limit = maxTokens || this.defaultMaxTokens
    const entries: MemoryEntry[] = []
    let currentTokens = 0

    const candidates = Array.from(this.entries.values())
    candidates.sort((a, b) => {
      const scoreA = this.calculateContextScore(a, currentQuery)
      const scoreB = this.calculateContextScore(b, currentQuery)
      return scoreB - scoreA
    })

    for (const entry of candidates) {
      const tokens = this.tokenizer.countTokens(entry.content)
      if (currentTokens + tokens > limit) break

      entries.push(entry)
      currentTokens += tokens
    }

    return {
      maxTokens: limit,
      currentTokens,
      entries,
    }
  }

  async update(id: string, updates: Partial<Pick<MemoryEntry, "content" | "metadata">>): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id)
    if (!entry) return null

    if (updates.content !== undefined) {
      entry.content = updates.content
    }

    if (updates.metadata !== undefined) {
      entry.metadata = { ...entry.metadata, ...updates.metadata }
    }

    entry.updatedAt = Date.now()
    await this.storage.save(entry)

    return entry
  }

  async delete(id: string): Promise<boolean> {
    const entry = this.entries.get(id)
    if (!entry) return false

    this.entries.delete(id)
    this.removeFromIndices(entry)
    await this.storage.delete(id)

    return true
  }

  async compress(): Promise<void> {
    const entries = Array.from(this.entries.values())
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000

    for (const entry of entries) {
      const age = now - entry.createdAt
      const isStale = age > 7 * oneDay && entry.accessCount < 3
      const isLowImportance = entry.metadata.importance < 3

      if (isStale && isLowImportance) {
        await this.delete(entry.id)
      }
    }
  }

  getStats(): MemoryStats {
    const entries = Array.from(this.entries.values())
    const entriesByType: Record<string, number> = {}

    for (const entry of entries) {
      entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1
    }

    const importances = entries.map(e => e.metadata.importance)
    const averageImportance = importances.length > 0
      ? importances.reduce((a, b) => a + b, 0) / importances.length
      : 0

    return {
      totalEntries: entries.length,
      entriesByType: entriesByType as Record<MemoryType, number>,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.createdAt)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.createdAt)) : 0,
      averageImportance,
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private updateIndices(entry: MemoryEntry): void {
    const indexKeys = [entry.type, ...entry.metadata.tags]
    for (const key of indexKeys) {
      if (!this.indices.has(key)) {
        this.indices.set(key, new Set())
      }
      this.indices.get(key)!.add(entry.id)
    }
  }

  private removeFromIndices(entry: MemoryEntry): void {
    const indexKeys = [entry.type, ...entry.metadata.tags]
    for (const key of indexKeys) {
      this.indices.get(key)?.delete(entry.id)
    }
  }

  private calculateRelevanceScore(entry: MemoryEntry): number {
    const recency = Math.exp(-(Date.now() - entry.lastAccessedAt) / (24 * 60 * 60 * 1000))
    const frequency = Math.log(entry.accessCount + 1)
    const importance = entry.metadata.importance / 10

    return recency * 0.3 + frequency * 0.2 + importance * 0.5
  }

  private calculateContextScore(entry: MemoryEntry, query?: string): number {
    let score = this.calculateRelevanceScore(entry)

    if (query && entry.content.toLowerCase().includes(query.toLowerCase())) {
      score += 0.3
    }

    if (entry.type === "conversation") {
      score += 0.2
    }

    return score
  }
}
