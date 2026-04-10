/**
 * 日志适配器
 * 实现LoggerPort接口
 */

import type { LoggerPort } from "../ports"

export class ConsoleLogger implements LoggerPort {
  private prefix: string

  constructor(prefix = "[LLMASTLSPMEM]") {
    this.prefix = prefix
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(this.format("DEBUG", message, meta))
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(this.format("INFO", message, meta))
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(this.format("WARN", message, meta))
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(this.format("ERROR", message, meta))
  }

  private format(level: string, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString()
    const metaStr = meta ? " " + JSON.stringify(meta) : ""
    return `${timestamp} ${this.prefix} [${level}] ${message}${metaStr}`
  }
}

export class SilentLogger implements LoggerPort {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}
