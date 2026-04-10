/**
 * AST领域服务
 * 核心业务逻辑：Bash/PowerShell命令解析与安全分析
 * 遵循依赖倒置原则：依赖抽象而非具体实现
 */

import type { Part, Scan, CommandAnalysis, ParseResult } from "./types"

export interface ASTParser {
  parse(command: string, isPowerShell: boolean): Promise<unknown>
}

export interface FileSystem {
  isDir(path: string): Promise<boolean>
  normalize(path: string): string
  dirname(path: string): string
  resolve(base: string, target: string): string
}

const FILES = new Set([
  "cat", "cp", "mv", "rm", "touch", "mkdir", "rmdir", "ls", "head", "tail",
  "less", "more", "nano", "vim", "code", "open", "chmod", "chown",
])

const CWD = new Set(["cd", "pwd", "echo", "export", "unset", "alias", "unalias"])

export class ASTService {
  constructor(
    private parser: ASTParser,
    private fs: FileSystem,
  ) {}

  async analyze(command: string, cwd: string, isPowerShell: boolean): Promise<ParseResult> {
    const root = await this.parser.parse(command, isPowerShell)
    const scan = await this.collect(root as ASTNode, cwd, isPowerShell)
    const commands = this.extractCommands(root as ASTNode, isPowerShell)

    return { commands, scan }
  }

  private extractCommands(node: ASTNode, isPowerShell: boolean): CommandAnalysis[] {
    const cmds: CommandAnalysis[] = []

    for (const cmdNode of this.commands(node)) {
      const parts = this.parts(cmdNode)
      const tokens = parts.map(p => p.text)
      const cmd = isPowerShell ? tokens[0]?.toLowerCase() : tokens[0]

      if (cmd) {
        cmds.push({
          command: cmd,
          args: tokens.slice(1),
          paths: this.extractPaths(parts, isPowerShell),
          isFileOperation: FILES.has(cmd),
        })
      }
    }

    return cmds
  }

  private async collect(root: ASTNode, cwd: string, ps: boolean): Promise<Scan> {
    const scan: Scan = {
      dirs: new Set<string>(),
      patterns: new Set<string>(),
      always: new Set<string>(),
    }

    for (const node of this.commands(root)) {
      const command = this.parts(node)
      const tokens = command.map(item => item.text)
      const cmd = ps ? tokens[0]?.toLowerCase() : tokens[0]

      if (cmd && FILES.has(cmd)) {
        for (const arg of this.pathArgs(command, ps)) {
          const resolved = await this.argPath(arg, cwd, ps)
          if (resolved) {
            const dir = await this.fs.isDir(resolved) ? resolved : this.fs.dirname(resolved)
            scan.dirs.add(dir)
          }
        }
      }

      if (tokens.length && (!cmd || !CWD.has(cmd))) {
        scan.patterns.add(this.source(node))
        scan.always.add(this.prefix(tokens).join(" ") + " *")
      }
    }

    return scan
  }

  private commands(node: ASTNode): ASTNode[] {
    return node.descendantsOfType("command").filter((child): child is ASTNode => Boolean(child))
  }

  private parts(node: ASTNode): Part[] {
    const out: Part[] = []

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (!child) continue

      if (child.type === "command_elements") {
        for (let j = 0; j < child.childCount; j++) {
          const item = child.child(j)
          if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue
          out.push({ type: item.type, text: item.text })
        }
        continue
      }

      if (
        child.type !== "command_name" &&
        child.type !== "command_name_expr" &&
        child.type !== "word" &&
        child.type !== "string" &&
        child.type !== "raw_string" &&
        child.type !== "concatenation"
      ) {
        continue
      }

      out.push({ type: child.type, text: child.text })
    }

    return out
  }

  private source(node: ASTNode): string {
    return (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim()
  }

  private pathArgs(parts: Part[], ps: boolean): string[] {
    const out: string[] = []
    let skipNext = false

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]

      if (skipNext) {
        skipNext = false
        continue
      }

      if (part.type === "word" && part.text.startsWith("-")) {
        if (part.text === "-" || part.text === "--") continue
        if (ps && (part.text === "-Path" || part.text === "-LiteralPath")) {
          skipNext = true
          continue
        }
        continue
      }

      if (part.type === "word" || part.type === "string" || part.type === "raw_string") {
        out.push(part.text)
      }
    }

    return out
  }

  private async argPath(arg: string, cwd: string, ps: boolean): Promise<string | null> {
    const cleaned = arg.replace(/^["']|["']$/g, "")
    if (cleaned.startsWith("/") || cleaned.startsWith("~") || /^[a-zA-Z]:/.test(cleaned)) {
      const home = typeof process !== "undefined" ? process.env.HOME : ""
      return this.fs.normalize(cleaned.replace(/^~/, home || ""))
    }
    return this.fs.resolve(cwd, cleaned)
  }

  private extractPaths(parts: Part[], ps: boolean): string[] {
    return this.pathArgs(parts, ps)
  }

  private prefix(tokens: string[]): string[] {
    const out: string[] = []
    for (const token of tokens) {
      if (token.startsWith("-")) continue
      out.push(token)
      if (out.length >= 2) break
    }
    return out
  }
}

interface ASTNode {
  type: string
  text: string
  childCount: number
  parent?: ASTNode
  child(index: number): ASTNode | null
  descendantsOfType(type: string): ASTNode[]
}
