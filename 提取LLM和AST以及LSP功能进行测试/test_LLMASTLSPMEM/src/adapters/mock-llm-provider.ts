/**
 * Mock LLM Provider适配器
 * 用于测试，模拟LLM响应
 */

import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  Message,
} from "../domain/llm"

export class MockLLMProvider implements LLMProvider {
  private responses: Map<string, string> = new Map()
  private delay = 100

  setResponse(prompt: string, response: string): void {
    this.responses.set(prompt, response)
  }

  setDelay(ms: number): void {
    this.delay = ms
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    await this.sleep(this.delay)

    const lastMessage = request.messages[request.messages.length - 1]
    const prompt = lastMessage?.content || ""
    const response = this.responses.get(prompt) || this.generateDefaultResponse(prompt)

    return {
      content: response,
      usage: {
        promptTokens: this.countTokens(request.messages),
        completionTokens: response.split(/\s+/).length,
        totalTokens: this.countTokens(request.messages) + response.split(/\s+/).length,
      },
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    const lastMessage = request.messages[request.messages.length - 1]
    const prompt = lastMessage?.content || ""
    const response = this.responses.get(prompt) || this.generateDefaultResponse(prompt)

    const words = response.split(/\s+/)

    for (let i = 0; i < words.length; i++) {
      await this.sleep(this.delay / words.length)

      yield {
        content: words[i] + (i < words.length - 1 ? " " : ""),
        isComplete: i === words.length - 1,
      }
    }
  }

  countTokens(messages: Message[]): number {
    return messages.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0)
  }

  private generateDefaultResponse(prompt: string): string {
    return `I received your message: "${prompt.substring(0, 50)}...". This is a mock response for testing purposes.`
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
