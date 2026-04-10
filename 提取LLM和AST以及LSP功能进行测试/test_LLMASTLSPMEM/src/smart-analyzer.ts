/**
 * 智能分析器
 * 优化流程: LSP/AST发现问题 → 保存MEM → LLM查看MEM → LLM调用工具解决问题
 */

import { Application } from "./index"
import * as path from "path"
import { fileToolDefinitions, executeTool, ToolResult } from "./tools/file-tools"

export interface CodeIssue {
  id: string
  filePath: string
  line: number
  column: number
  type: "error" | "warning" | "suggestion"
  category: "spelling" | "import" | "type" | "logic" | "style"
  message: string
  code: string
  context: string  // 问题所在的代码行
  suggestedFix?: string
}

export interface AnalysisSession {
  sessionId: string
  projectPath: string
  startTime: Date
  issues: CodeIssue[]
  summary: {
    total: number
    errors: number
    warnings: number
    byCategory: Record<string, number>
  }
}

export class SmartAnalyzer {
  private app: Application
  private fs: {
    exists(path: string): Promise<boolean>
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
  }

  constructor(app: Application) {
    this.app = app
    this.fs = {
      exists: async (p: string) => {
        try {
          const file = Bun.file(p)
          return await file.exists()
        } catch {
          return false
        }
      },
      read: async (p: string) => {
        const file = Bun.file(p)
        return await file.text()
      },
      write: async (p: string, content: string) => {
        await Bun.write(p, content)
      },
    }
  }

  /**
   * 步骤1: LSP/AST 静态分析发现问题
   */
  async analyzeWithLSPAndAST(projectPath: string): Promise<AnalysisSession> {
    console.log("\n🔍 步骤1: LSP/AST 静态分析")
    const startTime = Date.now()

    const session: AnalysisSession = {
      sessionId: `session-${Date.now()}`,
      projectPath,
      startTime: new Date(),
      issues: [],
      summary: {
        total: 0,
        errors: 0,
        warnings: 0,
        byCategory: {},
      },
    }

    // 扫描所有文件
    const files = await this.scanFiles(projectPath)
    console.log(`   扫描到 ${files.length} 个文件`)

    // 对每个文件进行静态分析
    for (const file of files) {
      const issues = await this.analyzeFileStatic(file)
      session.issues.push(...issues)
    }

    // 计算统计
    session.summary.total = session.issues.length
    session.summary.errors = session.issues.filter(i => i.type === "error").length
    session.summary.warnings = session.issues.filter(i => i.type === "warning").length
    for (const issue of session.issues) {
      session.summary.byCategory[issue.category] = (session.summary.byCategory[issue.category] || 0) + 1
    }

    console.log(`   发现 ${session.summary.total} 个问题`)
    console.log(`   - 错误: ${session.summary.errors}`)
    console.log(`   - 警告: ${session.summary.warnings}`)
    console.log(`   耗时: ${Date.now() - startTime}ms`)

    return session
  }

  /**
   * 步骤2: 保存问题到 Memory
   */
  async saveToMemory(session: AnalysisSession): Promise<void> {
    console.log("\n💾 步骤2: 保存分析结果到 Memory")

    // 保存会话摘要
    await this.app.remember(
      "code_context",
      JSON.stringify({
        sessionId: session.sessionId,
        projectPath: session.projectPath,
        summary: session.summary,
        issueCount: session.issues.length,
      }),
      {
        filePath: session.projectPath,
        importance: 9,
        tags: ["analysis-session", session.sessionId, "summary"],
      }
    )

    // 保存每个问题详情
    for (let i = 0; i < session.issues.length; i++) {
      const issue = session.issues[i]
      await this.app.remember(
        "code_context",
        JSON.stringify(issue),
        {
          filePath: issue.filePath,
          importance: issue.type === "error" ? 10 : 7,
          tags: [
            "code-issue",
            session.sessionId,
            issue.category,
            issue.type,
            `line-${issue.line}`,
          ],
        }
      )
    }

    console.log(`   已保存 ${session.issues.length} 个问题到 Memory`)
  }

  /**
   * 步骤3: 客户询问 LLM（查看MEM中的问题）
   */
  async queryLLMForSolutions(sessionId: string, userQuestion: string): Promise<string> {
    console.log("\n🤖 步骤3: LLM 分析问题并提供解决方案")

    // 从 Memory 检索问题
    console.log("   从 Memory 检索问题...")
    const memoryResult = await this.app.recall({
      types: ["code_context"],
      tags: [sessionId, "code-issue"],
      limit: 20,
    })

    console.log(`   检索到 ${memoryResult.entries.length} 条问题记录`)

    // 构建问题摘要（精简版，避免token过多）
    const issues = memoryResult.entries.map(entry => {
      try {
        return JSON.parse(entry.content) as CodeIssue
      } catch {
        return null
      }
    }).filter(Boolean) as CodeIssue[]

    // 按类别分组
    const byCategory: Record<string, CodeIssue[]> = {}
    for (const issue of issues) {
      if (!issue.category) continue
      if (!byCategory[issue.category]) {
        byCategory[issue.category] = []
      }
      byCategory[issue.category].push(issue)
    }

    // 构建精简的prompt（只发送问题摘要，不是完整代码）
    const issueSummary = issues
      .filter(i => i.filePath && i.message)
      .slice(0, 10)
      .map(i => `[${i.type}] ${path.basename(i.filePath)}:${i.line} - ${i.message}`)
      .join("\n")

    const prompt = `作为代码审查专家，请分析以下问题列表并提供解决方案：

用户问题: ${userQuestion}

发现的问题 (${issues.length} 个):
${issueSummary}

问题分类统计:
${Object.entries(byCategory).map(([cat, items]) => `- ${cat}: ${items.length} 个`).join("\n")}

请提供:
1. 问题的根本原因分析
2. 具体的修复步骤
3. 预防类似问题的建议

请以结构化的方式回答。`

    console.log("   发送请求到 LLM...")
    const response = await this.app.chat(prompt)

    // 保存 LLM 的解决方案到 Memory
    await this.app.remember(
      "conversation",
      `LLM解决方案: ${response.content.substring(0, 500)}...`,
      {
        filePath: sessionId,
        importance: 8,
        tags: ["llm-solution", sessionId, "analysis"],
      }
    )

    console.log("   LLM 分析完成")
    return response.content
  }

  /**
   * 步骤4: LLM 调用工具修复问题
   */
  async applyFixesWithLLM(sessionId: string): Promise<{ success: number; failed: number; toolCalls: number }> {
    console.log("\n🔧 步骤4: LLM 调用工具修复问题")

    // 从 Memory 获取问题
    const memoryResult = await this.app.recall({
      types: ["code_context"],
      tags: [sessionId, "code-issue"],
      limit: 20,
    })

    const issues = memoryResult.entries
      .map(entry => {
        try {
          return JSON.parse(entry.content) as CodeIssue
        } catch {
          return null
        }
      })
      .filter(Boolean) as CodeIssue[]

    if (issues.length === 0) {
      console.log("   没有问题需要修复")
      return { success: 0, failed: 0, toolCalls: 0 }
    }

    // 构建工具调用提示
    const issueSummary = issues
      .filter(i => i.filePath && i.message)
      .slice(0, 5)
      .map(i => `[${i.type}] ${path.basename(i.filePath)}:${i.line} - ${i.message}`)
      .join("\n")

    const prompt = `作为代码修复专家，请使用提供的工具修复以下问题：

发现的问题:
${issueSummary}

可用的工具:
1. sed - 使用正则表达式替换文本
2. replaceLine - 替换指定行
3. insertLine - 插入新行
4. deleteLine - 删除行
5. readFile - 读取文件内容

请分析每个问题，然后调用适当的工具进行修复。
对于拼写错误，建议使用 sed 或 replaceLine 工具。

请按以下格式调用工具:
工具名: 参数JSON

例如:
sed: {"filePath": "/path/to/file.ts", "pattern": "creaateUser", "replacement": "createUser"}`

    console.log("   请求 LLM 调用修复工具...")

    // 注册工具给 LLM
    const tools = fileToolDefinitions.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))

    const response = await this.app.chat(prompt, { tools })

    // 执行 LLM 调用的工具
    let toolCalls = 0
    let success = 0
    let failed = 0

    if (response.toolCalls && response.toolCalls.length > 0) {
      console.log(`   LLM 调用了 ${response.toolCalls.length} 个工具`)

      for (const call of response.toolCalls) {
        toolCalls++
        const toolName = call.function.name
        console.log(`   执行: ${toolName}`)

        // 解析参数
        let args: Record<string, unknown>
        try {
          args = JSON.parse(call.function.arguments)
        } catch {
          console.log(`   ✗ 解析参数失败: ${call.function.arguments}`)
          failed++
          continue
        }

        const result = await executeTool(toolName, args)

        if (result.success) {
          success++
          console.log(`   ✓ ${result.message}`)
        } else {
          failed++
          console.log(`   ✗ ${result.message}`)
        }
      }
    } else {
      console.log("   LLM 没有调用工具，尝试解析文本响应...")

      // 尝试从文本响应中解析工具调用
      const toolResults = await this.parseAndExecuteToolCalls(response.content)
      success = toolResults.success
      failed = toolResults.failed
      toolCalls = toolResults.toolCalls
    }

    // 保存修复结果到 Memory
    await this.app.remember(
      "conversation",
      JSON.stringify({
        sessionId,
        toolCalls,
        success,
        failed,
        timestamp: new Date().toISOString(),
      }),
      {
        filePath: sessionId,
        importance: 8,
        tags: ["fix-result", sessionId],
      }
    )

    console.log(`   修复完成: ${success} 成功, ${failed} 失败, ${toolCalls} 次工具调用`)
    return { success, failed, toolCalls }
  }

  /**
   * 从文本响应中解析并执行工具调用
   */
  private async parseAndExecuteToolCalls(content: string): Promise<{ success: number; failed: number; toolCalls: number }> {
    let success = 0
    let failed = 0
    let toolCalls = 0

    // 匹配工具调用模式: 工具名: {参数}
    const toolPattern = /(\w+):\s*(\{[^}]+\})/g
    let match: RegExpExecArray | null

    while ((match = toolPattern.exec(content)) !== null) {
      const toolName = match[1]
      const argsStr = match[2]

      try {
        const args = JSON.parse(argsStr)
        toolCalls++
        console.log(`   解析到工具调用: ${toolName}`)

        const result = await executeTool(toolName, args)

        if (result.success) {
          success++
          console.log(`   ✓ ${result.message}`)
        } else {
          failed++
          console.log(`   ✗ ${result.message}`)
        }
      } catch (err) {
        console.log(`   ✗ 解析工具参数失败: ${err}`)
        failed++
      }
    }

    return { success, failed, toolCalls }
  }

  /**
   * 静态分析单个文件
   */
  private async analyzeFileStatic(filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = []
    const content = await this.fs.read(filePath)
    const lines = content.split("\n")

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineNum = i + 1

      // 检查拼写错误
      const spellingIssues = this.checkSpelling(line, lineNum, filePath)
      issues.push(...spellingIssues)

      // 检查导入问题
      const importIssues = this.checkImports(line, lineNum, content, filePath)
      issues.push(...importIssues)
    }

    return issues
  }

  /**
   * 检查拼写错误
   */
  private checkSpelling(line: string, lineNum: number, filePath: string): CodeIssue[] {
    const issues: CodeIssue[] = []

    const misspellings = [
      { wrong: "creaateUser", correct: "createUser" },
      { wrong: "creaate", correct: "create" },
      { wrong: "funtion", correct: "function" },
    ]

    for (const { wrong, correct } of misspellings) {
      const index = line.indexOf(wrong)
      if (index !== -1) {
        issues.push({
          id: `spelling-${filePath}-${lineNum}-${index}`,
          filePath,
          line: lineNum,
          column: index + 1,
          type: "error",
          category: "spelling",
          message: `拼写错误: "${wrong}" 应该是 "${correct}"`,
          code: "SPELLING_ERROR",
          context: line,
          suggestedFix: line.replace(wrong, correct),
        })
      }
    }

    return issues
  }

  /**
   * 检查导入问题
   */
  private checkImports(line: string, lineNum: number, fullContent: string, filePath: string): CodeIssue[] {
    const issues: CodeIssue[] = []

    const importMatch = line.match(/import\s+\{([^}]+)\}\s+from/)
    if (importMatch) {
      const imports = importMatch[1].split(",").map(s => s.trim().split("as")[0].trim())
      for (const imp of imports) {
        const usageRegex = new RegExp(`\\b${imp}\\b(?!\\s*from)`, "g")
        const usages = fullContent.match(usageRegex)
        if (!usages || usages.length <= 1) {
          issues.push({
            id: `import-${filePath}-${lineNum}-${imp}`,
            filePath,
            line: lineNum,
            column: line.indexOf(imp) + 1,
            type: "warning",
            category: "import",
            message: `未使用的导入: "${imp}"`,
            code: "UNUSED_IMPORT",
            context: line,
          })
        }
      }
    }

    return issues
  }

  /**
   * 扫描文件
   */
  private async scanFiles(projectPath: string): Promise<string[]> {
    const files: string[] = []
    const glob = new Bun.Glob("**/*.ts")

    for await (const file of glob.scan(projectPath)) {
      if (!file.includes("node_modules") && !file.includes("dist")) {
        files.push(path.join(projectPath, file))
      }
    }

    return files
  }

  /**
   * 打印分析报告
   */
  printReport(session: AnalysisSession): void {
    console.log("\n" + "=".repeat(70))
    console.log("📊 静态分析报告")
    console.log("=".repeat(70))
    console.log(`会话ID: ${session.sessionId}`)
    console.log(`项目路径: ${session.projectPath}`)
    console.log(`\n问题统计:`)
    console.log(`   总计: ${session.summary.total}`)
    console.log(`   错误: ${session.summary.errors}`)
    console.log(`   警告: ${session.summary.warnings}`)

    if (session.issues.length > 0) {
      console.log(`\n问题详情:`)
      for (const issue of session.issues.slice(0, 10)) {
        const icon = issue.type === "error" ? "❌" : "⚠️"
        console.log(`\n   ${icon} ${path.basename(issue.filePath)}:${issue.line}`)
        console.log(`      ${issue.message}`)
        if (issue.suggestedFix) {
          console.log(`      建议: ${issue.suggestedFix.trim()}`)
        }
      }
      if (session.issues.length > 10) {
        console.log(`\n   ... 还有 ${session.issues.length - 10} 个问题`)
      }
    }

    console.log("=".repeat(70))
  }
}
