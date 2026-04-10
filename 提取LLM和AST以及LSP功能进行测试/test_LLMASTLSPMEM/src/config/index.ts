/**
 * 配置模块
 */

import type { LLMConfig } from "../domain/llm"

export interface AppConfig {
  llm: LLMConfig
  memory: {
    maxTokens: number
    storagePath?: string
  }
  lsp: {
    rootUri: string
    timeout: number
  }
  ast: {
    enablePowerShell: boolean
  }
}

export const defaultConfig: AppConfig = {
  llm: {
    model: "mock",
    temperature: 0.7,
    maxTokens: 2000,
    timeout: 30000,
  },
  memory: {
    maxTokens: 4000,
  },
  lsp: {
    rootUri: "file:///workspace",
    timeout: 3000,
  },
  ast: {
    enablePowerShell: false,
  },
}

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    ...defaultConfig,
    ...overrides,
    llm: { ...defaultConfig.llm, ...overrides?.llm },
    memory: { ...defaultConfig.memory, ...overrides?.memory },
    lsp: { ...defaultConfig.lsp, ...overrides?.lsp },
    ast: { ...defaultConfig.ast, ...overrides?.ast },
  }
}
