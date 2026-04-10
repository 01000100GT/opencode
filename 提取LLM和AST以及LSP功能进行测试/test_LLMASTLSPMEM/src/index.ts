/**
 * LLM-AST-LSP-MEM 主应用入口
 * 六边形架构的 orchestration 层
 */

import { ASTService, type ParseResult } from "./domain/ast"
import { LSPService, type LSPResponse, type LSPOperation } from "./domain/lsp"
import { MemoryService, type MemoryEntry, type MemoryQuery, type MemorySearchResult } from "./domain/memory"
import { LLMService, type CompletionResponse, type Message, type ToolDefinition } from "./domain/llm"
import {
  MockASTParser,
  MockLSPClient,
  MockLLMProvider,
  InMemoryStorage,
  SimpleTokenizer,
} from "./adapters"
import { loadConfig, type AppConfig } from "./config"
import type { LoggerPort } from "./ports"
import { ConsoleLogger } from "./adapters/logger"

// 简单的内存上下文提供者
class MemoryContextProvider {
  private messages: Message[] = []

  async getMessages(): Promise<Message[]> {
    return [...this.messages]
  }

  async addMessage(message: Message): Promise<void> {
    this.messages.push(message)
  }

  async clear(): Promise<void> {
    this.messages = []
  }
}

// 简单的文件系统适配器
class SimpleFileSystem {
  private files: Map<string, string> = new Map()

  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async read(path: string): Promise<string> {
    return this.files.get(path) || ""
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async isDir(path: string): Promise<boolean> {
    return false
  }

  normalize(path: string): string {
    return path.replace(/\\/g, "/")
  }

  dirname(path: string): string {
    const lastSlash = path.lastIndexOf("/")
    return lastSlash > 0 ? path.substring(0, lastSlash) : "/"
  }

  resolve(base: string, target: string): string {
    if (target.startsWith("/")) return target
    return base + "/" + target
  }

  toUri(path: string): string {
    return "file://" + this.normalize(path)
  }

  fromUri(uri: string): string {
    return uri.replace(/^file:\/\//, "")
  }
}

export class Application {
  public ast!: ASTService
  public lsp!: LSPService
  public memory!: MemoryService
  public llm!: LLMService

  private config: AppConfig
  private logger: LoggerPort
  private fs: SimpleFileSystem
  private contextProvider: MemoryContextProvider

  constructor(config?: Partial<AppConfig>, logger?: LoggerPort) {
    this.config = loadConfig(config)
    this.logger = logger || new ConsoleLogger()
    this.fs = new SimpleFileSystem()
    this.contextProvider = new MemoryContextProvider()
  }

  async initialize(): Promise<void> {
    this.logger.info("Initializing Application...")

    // 初始化 AST 服务
    const astParser = new MockASTParser()
    this.ast = new ASTService(astParser, this.fs)
    this.logger.info("AST Service initialized")

    // 初始化 LSP 服务
    this.lsp = new LSPService(this.fs, this.config.lsp.rootUri)
    const mockLspClient = new MockLSPClient()
    await this.lsp.registerClient("typescript", mockLspClient)
    this.logger.info("LSP Service initialized")

    // 初始化记忆服务
    const storage = new InMemoryStorage()
    const tokenizer = new SimpleTokenizer()
    this.memory = new MemoryService(storage, tokenizer, this.config.memory.maxTokens)
    await this.memory.initialize()
    this.logger.info("Memory Service initialized")

    // 初始化 LLM 服务
    const llmProvider = new MockLLMProvider()
    this.llm = new LLMService(llmProvider, this.contextProvider, this.config.llm)
    this.logger.info("LLM Service initialized")

    this.logger.info("Application initialized successfully")
  }

  // AST 功能
  async analyzeCommand(command: string, cwd: string = "/workspace"): Promise<ParseResult> {
    this.logger.info("Analyzing command", { command, cwd })
    const result = await this.ast.analyze(command, cwd, this.config.ast.enablePowerShell)

    // 保存到记忆
    await this.memory.create("ast_analysis", JSON.stringify(result), {
      source: "bash_analysis",
      importance: 7,
      tags: ["ast", "security"],
    })

    return result
  }

  // LSP 功能
  async getDiagnostics(): Promise<Record<string, unknown[]>> {
    this.logger.info("Getting LSP diagnostics")
    return await this.lsp.diagnostics()
  }

  async executeLSPOperation<T>(
    operation: LSPOperation,
    filePath: string,
    line: number,
    character: number
  ): Promise<LSPResponse<T>> {
    this.logger.info("Executing LSP operation", { operation, filePath, line, character })
    const result = await this.lsp.execute<T>(operation, filePath, line, character)

    // 保存到记忆
    await this.memory.create("lsp_diagnostic", JSON.stringify({ operation, filePath, result }), {
      source: "lsp_operation",
      filePath,
      importance: 6,
      tags: ["lsp", operation],
    })

    return result
  }

  // 记忆功能
  async remember(
    type: "conversation" | "code_context" | "file_operation",
    content: string,
    metadata?: { filePath?: string; importance?: number; tags?: string[] }
  ): Promise<MemoryEntry> {
    this.logger.info("Creating memory", { type })
    return await this.memory.create(type, content, {
      filePath: metadata?.filePath,
      importance: metadata?.importance || 5,
      tags: metadata?.tags || [],
    })
  }

  async recall(query: MemoryQuery): Promise<MemorySearchResult> {
    this.logger.info("Searching memory", { query })
    return await this.memory.search(query)
  }

  async getContextWindow(query?: string): Promise<{ entries: MemoryEntry[]; tokens: number }> {
    const window = await this.memory.buildContextWindow(query)
    return {
      entries: window.entries,
      tokens: window.currentTokens,
    }
  }

  // LLM 功能
  async chat(message: string, systemPrompt?: string): Promise<CompletionResponse> {
    this.logger.info("Chatting with LLM", { message: message.substring(0, 50) })

    // 获取上下文窗口
    const context = await this.getContextWindow(message)
    const contextContent = context.entries.map((e) => `[${e.type}]: ${e.content}`).join("\n")

    const enhancedPrompt = contextContent
      ? `Context:\n${contextContent}\n\nUser: ${message}`
      : message

    const response = await this.llm.chat(enhancedPrompt, systemPrompt)

    // 保存对话到记忆
    await this.memory.create("conversation", message, {
      importance: 8,
      tags: ["user_message"],
    })

    await this.memory.create("conversation", response.content, {
      importance: 8,
      tags: ["assistant_response"],
    })

    return response
  }

  registerTool(definition: ToolDefinition, handler: { name: string; execute: (args: Record<string, unknown>) => Promise<unknown> }): void {
    this.llm.registerTool(definition, handler)
    this.logger.info("Tool registered", { toolName: definition.name })
  }

  // 工具方法
  getStats(): { memory: unknown; llm: unknown } {
    return {
      memory: this.memory.getStats(),
      llm: {
        registeredTools: this.llm.getRegisteredTools().map((t) => t.name),
      },
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down Application...")
    await this.lsp.shutdown()
    this.logger.info("Application shutdown complete")
  }
}

// 导出所有模块
export * from "./domain/ast"
export * from "./domain/lsp"
export * from "./domain/memory"
export * from "./domain/llm"
export * from "./adapters"
export * from "./config"
export * from "./ports"
