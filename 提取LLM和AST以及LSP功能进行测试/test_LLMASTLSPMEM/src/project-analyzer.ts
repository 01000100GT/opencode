/**
 * 项目分析器
 * 使用 LLM + AST + LSP + Memory 分析外部项目
 */

import { Application } from "./index"
import * as path from "path"

export interface FileIssue {
  filePath: string
  line: number
  column: number
  type: "error" | "warning" | "suggestion"
  message: string
  code?: string
}

export interface AnalysisResult {
  projectPath: string
  files: string[]
  issues: FileIssue[]
  summary: {
    errors: number
    warnings: number
    suggestions: number
  }
}

export interface FixSuggestion {
  filePath: string
  line: number
  original: string
  replacement: string
  reason: string
}

export class ProjectAnalyzer {
  private app: Application
  private fs: {
    exists(path: string): Promise<boolean>
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
  }

  constructor(app: Application) {
    this.app = app
    // 使用真实的文件系统
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
   * 扫描项目文件
   */
  async scanProject(projectPath: string): Promise<string[]> {
    console.log(`\n🔍 扫描项目: ${projectPath}`)

    const files: string[] = []
    const glob = new Bun.Glob("**/*.ts")

    for await (const file of glob.scan(projectPath)) {
      if (!file.includes("node_modules") && !file.includes("dist")) {
        files.push(path.join(projectPath, file))
      }
    }

    console.log(`   找到 ${files.length} 个 TypeScript 文件`)
    return files
  }

  /**
   * 分析单个文件
   */
  async analyzeFile(filePath: string): Promise<FileIssue[]> {
    const issues: FileIssue[] = []
    const content = await this.fs.read(filePath)
    const lines = content.split("\n")

    // 使用 AST 分析文件
    const astResult = await this.app.analyzeCommand(content, path.dirname(filePath))

    // 检查常见的代码问题
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineNum = i + 1

      // 检查拼写错误（常见的函数名拼写错误）
      const spellingIssues = this.checkSpellingErrors(line, lineNum, filePath)
      issues.push(...spellingIssues)

      // 检查未使用的导入
      const importIssues = this.checkUnusedImports(line, lineNum, content, filePath)
      issues.push(...importIssues)

      // 检查潜在的空值问题
      const nullIssues = this.checkNullSafety(line, lineNum, filePath)
      issues.push(...nullIssues)
    }

    // 使用 LLM 进行深度分析
    const llmIssues = await this.llmAnalyzeFile(filePath, content, lines)
    issues.push(...llmIssues)

    return issues
  }

  /**
   * 检查拼写错误
   */
  private checkSpellingErrors(line: string, lineNum: number, filePath: string): FileIssue[] {
    const issues: FileIssue[] = []

    // 常见的拼写错误模式
    const spellingPatterns = [
      { wrong: "creaate", correct: "create", context: "函数调用" },
      { wrong: "funtion", correct: "function", context: "关键字" },
      { wrong: "asyncronous", correct: "asynchronous", context: "类型" },
      { wrong: "promisse", correct: "promise", context: "类型" },
    ]

    for (const pattern of spellingPatterns) {
      const regex = new RegExp(`\\b${pattern.wrong}\\b`, "i")
      const match = line.match(regex)
      if (match) {
        const column = line.indexOf(match[0]) + 1
        issues.push({
          filePath,
          line: lineNum,
          column,
          type: "error",
          message: `拼写错误: "${match[0]}" 应该是 "${pattern.correct}" (${pattern.context})`,
          code: "SPELLING_ERROR",
        })
      }
    }

    return issues
  }

  /**
   * 检查未使用的导入
   */
  private checkUnusedImports(line: string, lineNum: number, fullContent: string, filePath: string): FileIssue[] {
    const issues: FileIssue[] = []

    // 匹配导入语句
    const importMatch = line.match(/import\s+\{([^}]+)\}\s+from/)
    if (importMatch) {
      const imports = importMatch[1].split(",").map(s => s.trim())
      for (const imp of imports) {
        const name = imp.split("as")[0].trim()
        // 检查是否在文件其他地方使用
        const usageRegex = new RegExp(`\\b${name}\\b(?!\\s*from)`, "g")
        const usages = fullContent.match(usageRegex)
        // 只出现一次（在导入语句中）
        if (!usages || usages.length <= 1) {
          issues.push({
            filePath,
            line: lineNum,
            column: line.indexOf(name) + 1,
            type: "warning",
            message: `未使用的导入: "${name}"`,
            code: "UNUSED_IMPORT",
          })
        }
      }
    }

    return issues
  }

  /**
   * 检查空值安全
   */
  private checkNullSafety(line: string, lineNum: number, filePath: string): FileIssue[] {
    const issues: FileIssue[] = []

    // 检查可能的空值访问
    if (line.includes("[0]") && !line.includes("?")) {
      issues.push({
        filePath,
        line: lineNum,
        column: line.indexOf("[0]") + 1,
        type: "suggestion",
        message: "建议使用可选链操作符 (?.) 来避免空值访问错误",
        code: "NULL_SAFETY",
      })
    }

    return issues
  }

  /**
   * 使用 LLM 分析文件
   */
  private async llmAnalyzeFile(
    filePath: string,
    content: string,
    lines: string[]
  ): Promise<FileIssue[]> {
    const issues: FileIssue[] = []

    const prompt = `请分析以下 TypeScript 代码，找出潜在的错误、问题或改进建议：

文件路径: ${filePath}

代码内容:
\`\`\`typescript
${content.substring(0, 2000)}
\`\`\`

请重点关注:
1. 拼写错误（特别是函数名、变量名）
2. 类型错误
3. 未定义的变量或函数
4. 逻辑错误
5. 代码风格问题

请以 JSON 格式返回发现的问题:
[
  {
    "line": 行号,
    "column": 列号,
    "type": "error|warning|suggestion",
    "message": "问题描述",
    "code": "问题代码"
  }
]

如果没有发现问题，返回空数组 []。`

    try {
      const response = await this.app.chat(prompt)
      const jsonMatch = response.content.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const llmIssues = JSON.parse(jsonMatch[0]) as FileIssue[]
        for (const issue of llmIssues) {
          issues.push({
            ...issue,
            filePath,
          })
        }
      }
    } catch (err) {
      console.error("LLM 分析失败:", err)
    }

    return issues
  }

  /**
   * 生成修复建议
   */
  async generateFixes(analysis: AnalysisResult): Promise<FixSuggestion[]> {
    const fixes: FixSuggestion[] = []

    for (const issue of analysis.issues) {
      const content = await this.fs.read(issue.filePath)
      const lines = content.split("\n")
      const line = lines[issue.line - 1]

      // 修复1: 拼写错误 (多种模式匹配)
      if (issue.type === "error" && this.isSpellingError(issue)) {
        const fix = this.createSpellingFix(issue, line)
        if (fix) fixes.push(fix)
      }

      // 修复2: 未使用导入 - 删除整行
      if (issue.code === "UNUSED_IMPORT" || issue.message.includes("未使用")) {
        // 暂不自动删除导入，避免误删
        console.log(`   ⚠️  跳过自动修复: ${issue.message} (建议手动检查)`)
      }
    }

    return fixes
  }

  /**
   * 判断是否为拼写错误
   */
  private isSpellingError(issue: FileIssue): boolean {
    const spellingKeywords = ["拼写", "spelling", "应该是", "should be", "未定义", "undefined"]
    return spellingKeywords.some(kw => issue.message.toLowerCase().includes(kw.toLowerCase()))
  }

  /**
   * 创建拼写修复
   */
  private createSpellingFix(issue: FileIssue, line: string): FixSuggestion | null {
    // 模式1: "xxx" 应该是 "yyy"
    let match = issue.message.match(/["']([^"']+)["']\s*应该是\s*["']([^"']+)["']/)
    if (match) {
      const wrong = match[1]
      const correct = match[2]
      return {
        filePath: issue.filePath,
        line: issue.line,
        original: line,
        replacement: line.replace(wrong, correct),
        reason: issue.message,
      }
    }

    // 模式2: 'xxx' should be 'yyy'
    match = issue.message.match(/["']([^"']+)["']\s+should\s+be\s+["']([^"']+)["']/i)
    if (match) {
      const wrong = match[1]
      const correct = match[2]
      return {
        filePath: issue.filePath,
        line: issue.line,
        original: line,
        replacement: line.replace(wrong, correct),
        reason: issue.message,
      }
    }

    // 模式3: 函数名 'xxx' 未定义，导入的函数名为 'yyy'
    match = issue.message.match(/函数名?\s*["']?([^"']+)["']?\s*未定义.*导入.*["']([^"']+)["']/)
    if (match) {
      const wrong = match[1]
      const correct = match[2]
      return {
        filePath: issue.filePath,
        line: issue.line,
        original: line,
        replacement: line.replace(wrong, correct),
        reason: issue.message,
      }
    }

    // 模式4: 直接在消息中查找可能的拼写错误
    // 如果消息包含 "creaateUser" 和 "createUser"
    const commonMisspellings = [
      { wrong: "creaateUser", correct: "createUser" },
      { wrong: "creaate", correct: "create" },
      { wrong: "funtion", correct: "function" },
      { wrong: "asyncronous", correct: "asynchronous" },
      { wrong: "promisse", correct: "promise" },
    ]

    for (const { wrong, correct } of commonMisspellings) {
      if (line.includes(wrong)) {
        return {
          filePath: issue.filePath,
          line: issue.line,
          original: line,
          replacement: line.replace(new RegExp(wrong, "g"), correct),
          reason: `拼写错误: "${wrong}" 应该是 "${correct}"`,
        }
      }
    }

    return null
  }

  /**
   * 应用修复
   */
  async applyFixes(fixes: FixSuggestion[]): Promise<void> {
    console.log(`\n🔧 应用 ${fixes.length} 个修复...`)

    // 按文件分组
    const fixesByFile = new Map<string, FixSuggestion[]>()
    for (const fix of fixes) {
      const existing = fixesByFile.get(fix.filePath) || []
      existing.push(fix)
      fixesByFile.set(fix.filePath, existing)
    }

    // 逐个文件应用修复
    for (const [filePath, fileFixes] of fixesByFile) {
      let content = await this.fs.read(filePath)
      const lines = content.split("\n")

      // 按行号倒序排序，避免行号变化
      fileFixes.sort((a, b) => b.line - a.line)

      for (const fix of fileFixes) {
        lines[fix.line - 1] = fix.replacement
        console.log(`   ✓ ${filePath}:${fix.line} - ${fix.reason}`)
      }

      await this.fs.write(filePath, lines.join("\n"))
    }

    console.log("   修复完成!")
  }

  /**
   * 分析整个项目
   */
  async analyzeProject(projectPath: string): Promise<AnalysisResult> {
    // 扫描文件
    const files = await this.scanProject(projectPath)

    // 分析每个文件
    const allIssues: FileIssue[] = []
    for (const file of files) {
      const issues = await this.analyzeFile(file)
      allIssues.push(...issues)
    }

    // 保存分析结果到记忆
    await this.app.remember(
      "code_context",
      `项目分析: ${projectPath} - 发现 ${allIssues.length} 个问题`,
      {
        filePath: projectPath,
        importance: 8,
        tags: ["project-analysis", "issues", "auto-fix"],
      }
    )

    return {
      projectPath,
      files,
      issues: allIssues,
      summary: {
        errors: allIssues.filter(i => i.type === "error").length,
        warnings: allIssues.filter(i => i.type === "warning").length,
        suggestions: allIssues.filter(i => i.type === "suggestion").length,
      },
    }
  }

  /**
   * 打印分析结果
   */
  printAnalysis(result: AnalysisResult): void {
    console.log("\n" + "=".repeat(70))
    console.log("📊 项目分析报告")
    console.log("=".repeat(70))
    console.log(`项目路径: ${result.projectPath}`)
    console.log(`文件数量: ${result.files.length}`)
    console.log("\n问题统计:")
    console.log(`   ❌ 错误: ${result.summary.errors}`)
    console.log(`   ⚠️  警告: ${result.summary.warnings}`)
    console.log(`   💡 建议: ${result.summary.suggestions}`)

    if (result.issues.length > 0) {
      console.log("\n详细问题:")
      for (const issue of result.issues) {
        const icon = issue.type === "error" ? "❌" : issue.type === "warning" ? "⚠️" : "💡"
        console.log(`\n   ${icon} ${path.basename(issue.filePath)}:${issue.line}:${issue.column}`)
        console.log(`      ${issue.message}`)
        if (issue.code) {
          console.log(`      [${issue.code}]`)
        }
      }
    }

    console.log("\n" + "=".repeat(70))
  }
}
