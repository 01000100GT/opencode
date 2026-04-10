/**
 * AST领域类型定义
 * 遵循单一职责原则：只定义AST相关的数据结构
 */

export interface Part {
  type: string
  text: string
}

export interface Scan {
  dirs: Set<string>
  patterns: Set<string>
  always: Set<string>
}

export interface CommandAnalysis {
  command: string
  args: string[]
  paths: string[]
  isFileOperation: boolean
}

export interface SecurityCheck {
  allowed: boolean
  reason?: string
  requiredPermissions: string[]
}

export interface ParseResult {
  commands: CommandAnalysis[]
  scan: Scan
}
