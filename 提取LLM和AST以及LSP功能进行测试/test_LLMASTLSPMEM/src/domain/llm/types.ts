/**
 * LLM领域类型定义
 * 定义大语言模型交互的核心数据结构
 */

export interface Message {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  name?: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface CompletionRequest {
  messages: Message[]
  tools?: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface CompletionResponse {
  content: string
  toolCalls?: ToolCall[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface StreamChunk {
  content?: string
  toolCall?: Partial<ToolCall>
  isComplete: boolean
}

export interface LLMConfig {
  model: string
  apiKey?: string
  baseUrl?: string
  temperature: number
  maxTokens: number
  timeout: number
}
