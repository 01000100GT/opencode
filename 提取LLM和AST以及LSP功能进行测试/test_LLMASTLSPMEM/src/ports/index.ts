/**
 * 端口层 - 定义与外部世界交互的抽象接口
 * 遵循依赖倒置原则：领域层依赖这些抽象
 */

// 文件系统端口
export interface FileSystemPort {
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  isDir(path: string): Promise<boolean>
  normalize(path: string): string
  dirname(path: string): string
  resolve(base: string, target: string): string
  toUri(path: string): string
  fromUri(uri: string): string
}

// 日志端口
export interface LoggerPort {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

// 配置端口
export interface ConfigPort {
  get<T>(key: string, defaultValue?: T): T
  set<T>(key: string, value: T): void
  load(path: string): Promise<void>
  save(path: string): Promise<void>
}
