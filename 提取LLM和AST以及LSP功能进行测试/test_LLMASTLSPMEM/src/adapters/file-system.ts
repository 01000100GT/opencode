/**
 * 文件系统适配器
 * 实现FileSystemPort接口
 */

import type { FileSystemPort } from "../ports"
import * as path from "path"

export class NodeFileSystem implements FileSystemPort {
  async exists(filePath: string): Promise<boolean> {
    try {
      await Bun.file(filePath).exists()
      return true
    } catch {
      return false
    }
  }

  async read(filePath: string): Promise<string> {
    return await Bun.file(filePath).text()
  }

  async write(filePath: string, content: string): Promise<void> {
    await Bun.write(filePath, content)
  }

  async isDir(filePath: string): Promise<boolean> {
    try {
      const stat = await Bun.file(filePath).stat()
      return stat?.isDirectory() || false
    } catch {
      return false
    }
  }

  normalize(filePath: string): string {
    return path.normalize(filePath)
  }

  dirname(filePath: string): string {
    return path.dirname(filePath)
  }

  resolve(base: string, target: string): string {
    return path.resolve(base, target)
  }

  toUri(filePath: string): string {
    return "file://" + this.normalize(filePath)
  }

  fromUri(uri: string): string {
    return uri.replace(/^file:\/\//, "")
  }
}
