/**
 * OpenAI API Provider 适配器
 * 支持 OpenAI 兼容的 API 接口（包括本地部署的模型）
 */

import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Message,
  ToolCall,
  ToolDefinition,
} from "../domain/llm"

interface OpenAIChatCompletion {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string | null
      tool_calls?: {
        id: string
        type: string
        function: {
          name: string
          arguments: string
        }
      }[]
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    delta: {
      role?: string
      content?: string
      tool_calls?: {
        index: number
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }[]
    }
    finish_reason: string | null
  }[]
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string
  private baseUrl: string
  private model: string
  private temperature: number
  private maxTokens: number
  private timeout: number

  constructor(config: {
    apiKey: string
    baseUrl?: string
    model?: string
    temperature?: number
    maxTokens?: number
    timeout?: number
  }) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1"
    this.model = config.model || "gpt-4"
    this.temperature = config.temperature ?? 0.7
    this.maxTokens = config.maxTokens || 2000
    this.timeout = config.timeout || 30000
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const body = this.buildRequestBody(request)

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${error}`)
    }

    const data = await response.json() as OpenAIChatCompletion

    return {
      content: data.choices[0]?.message?.content || "",
      toolCalls: this.parseToolCalls(data.choices[0]?.message?.tool_calls),
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    const body = {
      ...this.buildRequestBody(request),
      stream: true,
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body")
    }

    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === "data: [DONE]") continue
          if (!trimmed.startsWith("data: ")) continue

          try {
            const json: OpenAIStreamChunk = JSON.parse(trimmed.slice(6))
            const delta = json.choices[0]?.delta

            if (delta?.content) {
              yield {
                content: delta.content,
                isComplete: false,
              }
            }

            if (delta?.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                yield {
                  toolCall: {
                    id: toolCall.id,
                    function: {
                      name: toolCall.function?.name || "",
                      arguments: toolCall.function?.arguments || "",
                    },
                  },
                  isComplete: false,
                }
              }
            }
          } catch {
            // 忽略解析错误的行
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { isComplete: true }
  }

  countTokens(messages: Message[]): number {
    // 简单的 token 估算（实际项目中可以使用 tiktoken）
    let count = 0
    for (const msg of messages) {
      count += msg.content.length / 4
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          count += tc.function.name.length / 4
          count += tc.function.arguments.length / 4
        }
      }
    }
    return Math.ceil(count)
  }

  private buildRequestBody(request: CompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages.map(m => this.formatMessage(m)),
      temperature: request.temperature ?? this.temperature,
      max_tokens: request.maxTokens ?? this.maxTokens,
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => this.formatTool(t))
    }

    return body
  }

  private formatMessage(msg: Message): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    }

    if (msg.name) {
      formatted.name = msg.name
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      formatted.tool_calls = msg.toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: tc.function,
      }))
    }

    if (msg.toolCallId) {
      formatted.tool_call_id = msg.toolCallId
    }

    return formatted
  }

  private formatTool(tool: ToolDefinition): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }
  }

  private parseToolCalls(toolCalls?: OpenAIChatCompletion["choices"][0]["message"]["tool_calls"]): ToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) return undefined

    return toolCalls.map(tc => ({
      id: tc.id,
      type: tc.type as "function",
      function: tc.function,
    }))
  }
}
