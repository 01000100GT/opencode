/**
 * 配置模块
 * 支持从环境变量和 .env 文件读取配置
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

// 从环境变量读取配置
function loadFromEnv(): Partial<AppConfig> {
  const config: Partial<AppConfig> = {}

  // LLM 配置
  if (process.env.LLM_MODEL || process.env.LLM_API_KEY) {
    config.llm = {
      model: process.env.LLM_MODEL || "mock",
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "2000"),
      timeout: parseInt(process.env.LLM_TIMEOUT || "30000"),
    }
  }

  // Memory 配置
  if (process.env.MEMORY_MAX_TOKENS || process.env.MEMORY_STORAGE_PATH) {
    config.memory = {
      maxTokens: parseInt(process.env.MEMORY_MAX_TOKENS || "4000"),
      storagePath: process.env.MEMORY_STORAGE_PATH,
    }
  }

  // LSP 配置
  if (process.env.LSP_ROOT_URI || process.env.LSP_TIMEOUT) {
    config.lsp = {
      rootUri: process.env.LSP_ROOT_URI || "file:///workspace",
      timeout: parseInt(process.env.LSP_TIMEOUT || "3000"),
    }
  }

  // AST 配置
  if (process.env.AST_ENABLE_POWERSHELL) {
    config.ast = {
      enablePowerShell: process.env.AST_ENABLE_POWERSHELL === "true",
    }
  }

  return config
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
  // 1. 默认配置
  // 2. 环境变量配置
  const envConfig = loadFromEnv()
  // 3. 手动覆盖配置

  return {
    ...defaultConfig,
    ...envConfig,
    ...overrides,
    llm: { ...defaultConfig.llm, ...envConfig.llm, ...overrides?.llm },
    memory: { ...defaultConfig.memory, ...envConfig.memory, ...overrides?.memory },
    lsp: { ...defaultConfig.lsp, ...envConfig.lsp, ...overrides?.lsp },
    ast: { ...defaultConfig.ast, ...envConfig.ast, ...overrides?.ast },
  }
}
