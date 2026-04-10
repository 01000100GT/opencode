/**
 * 记忆存储适配器
 * 实现StorageAdapter接口
 */

import type { StorageAdapter, MemoryEntry } from "../domain/memory"

export class InMemoryStorage implements StorageAdapter {
  private data: Map<string, MemoryEntry> = new Map()

  async save(entry: MemoryEntry): Promise<void> {
    this.data.set(entry.id, { ...entry })
  }

  async load(id: string): Promise<MemoryEntry | null> {
    const entry = this.data.get(id)
    return entry ? { ...entry } : null
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id)
  }

  async query(filter: (entry: MemoryEntry) => boolean): Promise<MemoryEntry[]> {
    return Array.from(this.data.values()).filter(filter).map(e => ({ ...e }))
  }

  async clear(): Promise<void> {
    this.data.clear()
  }
}

export class FileStorage implements StorageAdapter {
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async save(entry: MemoryEntry): Promise<void> {
    const data = await this.loadAll()
    data[entry.id] = entry
    await this.writeAll(data)
  }

  async load(id: string): Promise<MemoryEntry | null> {
    const data = await this.loadAll()
    return data[id] || null
  }

  async delete(id: string): Promise<void> {
    const data = await this.loadAll()
    delete data[id]
    await this.writeAll(data)
  }

  async query(filter: (entry: MemoryEntry) => boolean): Promise<MemoryEntry[]> {
    const data = await this.loadAll()
    return Object.values(data).filter(filter)
  }

  async clear(): Promise<void> {
    await this.writeAll({})
  }

  private async loadAll(): Promise<Record<string, MemoryEntry>> {
    try {
      const content = await Bun.file(this.filePath).text()
      return JSON.parse(content)
    } catch {
      return {}
    }
  }

  private async writeAll(data: Record<string, MemoryEntry>): Promise<void> {
    await Bun.write(this.filePath, JSON.stringify(data, null, 2))
  }
}
