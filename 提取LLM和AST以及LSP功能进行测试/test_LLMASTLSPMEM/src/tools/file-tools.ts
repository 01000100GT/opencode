/**
 * 文件编辑工具集
 * 供 LLM 调用进行代码修改
 */

import * as path from "path"

export interface ToolResult {
  success: boolean
  message: string
  output?: string
}

/**
 * sed 工具 - 替换文本
 */
export async function sed(filePath: string, pattern: string, replacement: string): Promise<ToolResult> {
  try {
    const file = Bun.file(filePath)
    if (!await file.exists()) {
      return { success: false, message: `文件不存在: ${filePath}` }
    }

    const content = await file.text()
    const regex = new RegExp(pattern, "g")
    const newContent = content.replace(regex, replacement)

    if (content === newContent) {
      return { success: false, message: "未找到匹配内容" }
    }

    await Bun.write(filePath, newContent)

    const matchCount = (content.match(regex) || []).length
    return {
      success: true,
      message: `成功替换 ${matchCount} 处`,
      output: `替换: "${pattern}" → "${replacement}"`,
    }
  } catch (err) {
    return { success: false, message: `sed 失败: ${err}` }
  }
}

/**
 * replaceLine 工具 - 替换指定行
 */
export async function replaceLine(filePath: string, lineNum: number, newContent: string): Promise<ToolResult> {
  try {
    const file = Bun.file(filePath)
    if (!await file.exists()) {
      return { success: false, message: `文件不存在: ${filePath}` }
    }

    const content = await file.text()
    const lines = content.split("\n")

    if (lineNum < 1 || lineNum > lines.length) {
      return { success: false, message: `行号 ${lineNum} 超出范围 (1-${lines.length})` }
    }

    const oldLine = lines[lineNum - 1]
    lines[lineNum - 1] = newContent

    await Bun.write(filePath, lines.join("\n"))

    return {
      success: true,
      message: `成功替换第 ${lineNum} 行`,
      output: `旧: ${oldLine}\n新: ${newContent}`,
    }
  } catch (err) {
    return { success: false, message: `replaceLine 失败: ${err}` }
  }
}

/**
 * insertLine 工具 - 在指定行后插入
 */
export async function insertLine(filePath: string, lineNum: number, content: string): Promise<ToolResult> {
  try {
    const file = Bun.file(filePath)
    if (!await file.exists()) {
      return { success: false, message: `文件不存在: ${filePath}` }
    }

    const fileContent = await file.text()
    const lines = fileContent.split("\n")

    if (lineNum < 0 || lineNum > lines.length) {
      return { success: false, message: `行号 ${lineNum} 超出范围` }
    }

    lines.splice(lineNum, 0, content)
    await Bun.write(filePath, lines.join("\n"))

    return {
      success: true,
      message: `成功在第 ${lineNum} 行后插入`,
      output: content,
    }
  } catch (err) {
    return { success: false, message: `insertLine 失败: ${err}` }
  }
}

/**
 * deleteLine 工具 - 删除指定行
 */
export async function deleteLine(filePath: string, lineNum: number): Promise<ToolResult> {
  try {
    const file = Bun.file(filePath)
    if (!await file.exists()) {
      return { success: false, message: `文件不存在: ${filePath}` }
    }

    const content = await file.text()
    const lines = content.split("\n")

    if (lineNum < 1 || lineNum > lines.length) {
      return { success: false, message: `行号 ${lineNum} 超出范围` }
    }

    const deletedLine = lines[lineNum - 1]
    lines.splice(lineNum - 1, 1)
    await Bun.write(filePath, lines.join("\n"))

    return {
      success: true,
      message: `成功删除第 ${lineNum} 行`,
      output: deletedLine,
    }
  } catch (err) {
    return { success: false, message: `deleteLine 失败: ${err}` }
  }
}

/**
 * readFile 工具 - 读取文件内容
 */
export async function readFile(filePath: string, startLine?: number, endLine?: number): Promise<ToolResult> {
  try {
    const file = Bun.file(filePath)
    if (!await file.exists()) {
      return { success: false, message: `文件不存在: ${filePath}` }
    }

    const content = await file.text()
    const lines = content.split("\n")

    let output: string
    if (startLine && endLine) {
      output = lines.slice(startLine - 1, endLine).join("\n")
    } else if (startLine) {
      output = lines.slice(startLine - 1).join("\n")
    } else {
      output = content
    }

    return {
      success: true,
      message: `成功读取文件`,
      output,
    }
  } catch (err) {
    return { success: false, message: `readFile 失败: ${err}` }
  }
}

import type { ToolDefinition } from "../domain/llm"

/**
 * 工具定义（供 LLM 使用）
 */
export const fileToolDefinitions: ToolDefinition[] = [
  {
    name: "sed",
    description: "使用正则表达式替换文件中的文本",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "要修改的文件路径",
        },
        pattern: {
          type: "string",
          description: "正则表达式模式",
        },
        replacement: {
          type: "string",
          description: "替换内容",
        },
      },
      required: ["filePath", "pattern", "replacement"],
    },
  },
  {
    name: "replaceLine",
    description: "替换文件中的指定行",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "要修改的文件路径",
        },
        lineNum: {
          type: "number",
          description: "行号（从1开始）",
        },
        newContent: {
          type: "string",
          description: "新内容",
        },
      },
      required: ["filePath", "lineNum", "newContent"],
    },
  },
  {
    name: "insertLine",
    description: "在指定行后插入新行",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "要修改的文件路径",
        },
        lineNum: {
          type: "number",
          description: "插入位置行号",
        },
        content: {
          type: "string",
          description: "要插入的内容",
        },
      },
      required: ["filePath", "lineNum", "content"],
    },
  },
  {
    name: "deleteLine",
    description: "删除指定行",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "要修改的文件路径",
        },
        lineNum: {
          type: "number",
          description: "要删除的行号",
        },
      },
      required: ["filePath", "lineNum"],
    },
  },
  {
    name: "readFile",
    description: "读取文件内容",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "文件路径",
        },
        startLine: {
          type: "number",
          description: "开始行号（可选）",
        },
        endLine: {
          type: "number",
          description: "结束行号（可选）",
        },
      },
      required: ["filePath"],
    },
  },
]

/**
 * 执行工具调用
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "sed":
      return sed(
        args.filePath as string,
        args.pattern as string,
        args.replacement as string
      )
    case "replaceLine":
      return replaceLine(
        args.filePath as string,
        args.lineNum as number,
        args.newContent as string
      )
    case "insertLine":
      return insertLine(
        args.filePath as string,
        args.lineNum as number,
        args.content as string
      )
    case "deleteLine":
      return deleteLine(args.filePath as string, args.lineNum as number)
    case "readFile":
      return readFile(
        args.filePath as string,
        args.startLine as number | undefined,
        args.endLine as number | undefined
      )
    default:
      return { success: false, message: `未知工具: ${name}` }
  }
}
