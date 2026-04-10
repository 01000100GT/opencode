/**
 * LLM领域服务
 * 核心业务逻辑：大语言模型交互编排
 */

import type {
  Message,
  ToolDefinition,
  ToolCall,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  LLMConfig,
} from "./types"

export interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>
  stream(request: CompletionRequest): AsyncGenerator<StreamChunk>
  countTokens(messages: Message[]): number
}

export interface ToolHandler {
  name: string
  execute(args: Record<string, unknown>): Promise<unknown>
}

export interface ContextProvider {
  getMessages(): Promise<Message[]>
  addMessage(message: Message): Promise<void>
  clear(): Promise<void>
}

export class LLMService {
  private tools: Map<string, ToolDefinition> = new Map()
  private handlers: Map<string, ToolHandler> = new Map()

  constructor(
    private provider: LLMProvider,
    private context: ContextProvider,
    private config: LLMConfig,
  ) {}

  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, definition)
    this.handlers.set(definition.name, handler)
  }

  unregisterTool(name: string): void {
    this.tools.delete(name)
    this.handlers.delete(name)
  }

  async chat(userMessage: string, systemPrompt?: string): Promise<CompletionResponse> {
    const messages = await this.context.getMessages()

    if (systemPrompt) {
      messages.unshift({
        role: "system",
        content: systemPrompt,
      })
    }

    messages.push({
      role: "user",
      content: userMessage,
    })

    const request: CompletionRequest = {
      messages,
      tools: Array.from(this.tools.values()),
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    }

    const response = await this.provider.complete(request)

    await this.context.addMessage({
      role: "user",
      content: userMessage,
    })

    await this.context.addMessage({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    })

    if (response.toolCalls && response.toolCalls.length > 0) {
      await this.executeToolCalls(response.toolCalls)
    }

    return response
  }

  async *streamChat(userMessage: string, systemPrompt?: string): AsyncGenerator<StreamChunk> {
    const messages = await this.context.getMessages()

    if (systemPrompt) {
      messages.unshift({
        role: "system",
        content: systemPrompt,
      })
    }

    messages.push({
      role: "user",
      content: userMessage,
    })

    const request: CompletionRequest = {
      messages,
      tools: Array.from(this.tools.values()),
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      stream: true,
    }

    let fullContent = ""
    const toolCalls: ToolCall[] = []

    for await (const chunk of this.provider.stream(request)) {
      if (chunk.content) {
        fullContent += chunk.content
      }

      if (chunk.toolCall) {
        this.accumulateToolCall(toolCalls, chunk.toolCall)
      }

      yield chunk

      if (chunk.isComplete) {
        break
      }
    }

    await this.context.addMessage({
      role: "user",
      content: userMessage,
    })

    await this.context.addMessage({
      role: "assistant",
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    })

    if (toolCalls.length > 0) {
      await this.executeToolCalls(toolCalls)
    }
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const handler = this.handlers.get(toolName)
    if (!handler) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    const result = await handler.execute(args)

    await this.context.addMessage({
      role: "tool",
      content: JSON.stringify(result),
      toolCallId: `call_${Date.now()}`,
      name: toolName,
    })

    return result
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<void> {
    for (const call of toolCalls) {
      const handler = this.handlers.get(call.function.name)
      if (!handler) continue

      try {
        const args = JSON.parse(call.function.arguments)
        const result = await handler.execute(args)

        await this.context.addMessage({
          role: "tool",
          content: JSON.stringify(result),
          toolCallId: call.id,
          name: call.function.name,
        })
      } catch (err) {
        await this.context.addMessage({
          role: "tool",
          content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          toolCallId: call.id,
          name: call.function.name,
        })
      }
    }
  }

  private accumulateToolCall(toolCalls: ToolCall[], partial: Partial<ToolCall>): void {
    if (!partial.id) return

    const existing = toolCalls.find(tc => tc.id === partial.id)
    if (existing) {
      if (partial.function?.arguments) {
        existing.function.arguments += partial.function.arguments
      }
    } else {
      toolCalls.push({
        id: partial.id,
        type: "function",
        function: {
          name: partial.function?.name || "",
          arguments: partial.function?.arguments || "",
        },
      })
    }
  }

  getRegisteredTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  async clearContext(): Promise<void> {
    await this.context.clear()
  }
}
