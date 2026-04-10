/**
 * 智能代码分析器
 * 集成 LLM + LSP + AST + Memory 进行全面的代码分析
 */

import { Application } from "./index"
import type { MemoryEntry } from "./domain/memory"

export interface FunctionAnalysis {
  functionName: string
  filePath: string
  line: number
  signature: string
  description?: string
}

export interface CallChain {
  caller: string
  callee: string
  filePath: string
  line: number
  type: "direct" | "indirect" | "callback"
}

export interface ImpactAnalysis {
  directCallers: string[]
  indirectCallers: string[]
  callees: string[]
  dataDependencies: string[]
  filesAffected: string[]
}

export interface CodeAnalysisResult {
  target: FunctionAnalysis
  callChains: CallChain[]
  impact: ImpactAnalysis
  relatedCode: MemoryEntry[]
  suggestions: string[]
  risks: string[]
}

export class CodeAnalyzer {
  private app: Application

  constructor(app: Application) {
    this.app = app
  }

  /**
   * 分析指定函数的完整调用链和影响范围
   */
  async analyzeFunction(
    filePath: string,
    functionName: string,
    line: number
  ): Promise<CodeAnalysisResult> {
    console.log(`\n🔍 开始分析函数: ${functionName} (第 ${line} 行)`)

    // 步骤1: 使用 LSP 获取函数定义和文档
    const functionInfo = await this.getFunctionInfo(filePath, functionName, line)

    // 步骤2: 使用 LSP 查找所有引用（调用者）
    const references = await this.findReferences(filePath, line)

    // 步骤3: 使用 LSP 获取调用层次
    const callHierarchy = await this.getCallHierarchy(filePath, line)

    // 步骤4: 使用 LSP 获取文档符号（了解函数内部结构）
    const documentSymbols = await this.getDocumentSymbols(filePath)

    // 步骤5: 保存分析到记忆
    await this.saveAnalysisToMemory(functionInfo, references, callHierarchy)

    // 步骤6: 查询历史相关分析
    const relatedCode = await this.findRelatedAnalysis(functionName)

    // 步骤7: 使用 LLM 生成修改建议
    const { suggestions, risks } = await this.generateSuggestions(
      functionInfo,
      references,
      callHierarchy
    )

    // 构建完整的分析结果
    const result: CodeAnalysisResult = {
      target: functionInfo,
      callChains: this.buildCallChains(callHierarchy, references),
      impact: this.buildImpactAnalysis(references, callHierarchy),
      relatedCode,
      suggestions,
      risks,
    }

    // 保存完整分析结果
    await this.app.remember("code_context", JSON.stringify(result), {
      filePath,
      importance: 9,
      tags: ["analysis", functionName, "impact-analysis"],
    })

    return result
  }

  /**
   * 使用 LSP 获取函数信息
   */
  private async getFunctionInfo(
    filePath: string,
    functionName: string,
    line: number
  ): Promise<FunctionAnalysis> {
    console.log(`  📍 LSP: 获取函数定义信息...`)

    // 获取 hover 信息（文档）
    const hoverResult = await this.app.executeLSPOperation(
      "hover",
      filePath,
      line,
      1
    )

    // 获取文档符号
    const symbolsResult = await this.app.executeLSPOperation(
      "documentSymbol",
      filePath,
      1,
      1
    )

    let signature = ""
    let description = ""

    if (hoverResult.success && hoverResult.data) {
      const hover = hoverResult.data as { contents: string }
      if (typeof hover.contents === "string") {
        description = hover.contents
      } else if (hover.contents && typeof hover.contents === "object") {
        description = (hover.contents as { value: string }).value || ""
      }
    }

    // 从文档符号中找到函数签名
    if (symbolsResult.success && symbolsResult.data) {
      const symbols = symbolsResult.data as Array<{
        name: string
        detail?: string
        range: { start: { line: number } }
      }>
      const funcSymbol = symbols.find(
        s => s.name === functionName && s.range.start.line === line - 1
      )
      if (funcSymbol) {
        signature = funcSymbol.detail || `${functionName}(...)`
      }
    }

    return {
      functionName,
      filePath,
      line,
      signature: signature || `${functionName}(...)`,
      description,
    }
  }

  /**
   * 使用 LSP 查找所有引用
   */
  private async findReferences(filePath: string, line: number): Promise<
    Array<{
      uri: string
      range: { start: { line: number; character: number } }
    }>
  > {
    console.log(`  📍 LSP: 查找所有引用...`)

    const result = await this.app.executeLSPOperation(
      "findReferences",
      filePath,
      line,
      1
    )

    if (result.success && result.data) {
      return result.data as Array<{
        uri: string
        range: { start: { line: number; character: number } }
      }>
    }

    return []
  }

  /**
   * 使用 LSP 获取调用层次
   */
  private async getCallHierarchy(
    filePath: string,
    line: number
  ): Promise<{
    incoming: Array<{
      from: { name: string; uri: string }
      fromRanges: Array<{ start: { line: number } }>
    }>
    outgoing: Array<{
      to: { name: string; uri: string }
      fromRanges: Array<{ start: { line: number } }>
    }>
  }> {
    console.log(`  📍 LSP: 获取调用层次...`)

    const incomingResult = await this.app.executeLSPOperation(
      "incomingCalls",
      filePath,
      line,
      1
    )

    const outgoingResult = await this.app.executeLSPOperation(
      "outgoingCalls",
      filePath,
      line,
      1
    )

    return {
      incoming: (incomingResult.data as Array<{
        from: { name: string; uri: string }
        fromRanges: Array<{ start: { line: number } }>
      }>) || [],
      outgoing: (outgoingResult.data as Array<{
        to: { name: string; uri: string }
        fromRanges: Array<{ start: { line: number } }>
      }>) || [],
    }
  }

  /**
   * 获取文档符号
   */
  private async getDocumentSymbols(
    filePath: string
  ): Promise<
    Array<{
      name: string
      kind: number
      detail?: string
      range: { start: { line: number } }
    }>
  > {
    const result = await this.app.executeLSPOperation(
      "documentSymbol",
      filePath,
      1,
      1
    )

    if (result.success && result.data) {
      return result.data as Array<{
        name: string
        kind: number
        detail?: string
        range: { start: { line: number } }
      }>
    }

    return []
  }

  /**
   * 构建调用链
   */
  private buildCallChains(
    callHierarchy: {
      incoming: Array<{
        from: { name: string; uri: string }
        fromRanges: Array<{ start: { line: number } }>
      }>
      outgoing: Array<{
        to: { name: string; uri: string }
        fromRanges: Array<{ start: { line: number } }>
      }>
    },
    references: Array<{
      uri: string
      range: { start: { line: number; character: number } }
    }>
  ): CallChain[] {
    const chains: CallChain[] = []

    // 添加入站调用（调用者）
    for (const call of callHierarchy.incoming) {
      for (const range of call.fromRanges) {
        chains.push({
          caller: call.from.name,
          callee: "target",
          filePath: call.from.uri.replace("file://", ""),
          line: range.start.line + 1,
          type: "direct",
        })
      }
    }

    // 添加出站调用（被调用者）
    for (const call of callHierarchy.outgoing) {
      for (const range of call.fromRanges) {
        chains.push({
          caller: "target",
          callee: call.to.name,
          filePath: call.to.uri.replace("file://", ""),
          line: range.start.line + 1,
          type: "direct",
        })
      }
    }

    return chains
  }

  /**
   * 构建影响分析
   */
  private buildImpactAnalysis(
    references: Array<{ uri: string }>,
    callHierarchy: {
      incoming: Array<{ from: { name: string; uri: string } }>
      outgoing: Array<{ to: { name: string; uri: string } }>
    }
  ): ImpactAnalysis {
    const directCallers = callHierarchy.incoming.map(c => c.from.name)
    const callees = callHierarchy.outgoing.map(c => c.to.name)
    const filesAffected = new Set<string>()

    for (const ref of references) {
      filesAffected.add(ref.uri.replace("file://", ""))
    }

    for (const call of callHierarchy.incoming) {
      filesAffected.add(call.from.uri.replace("file://", ""))
    }

    return {
      directCallers: [...new Set(directCallers)],
      indirectCallers: [], // 可以通过递归查找获得
      callees: [...new Set(callees)],
      dataDependencies: [],
      filesAffected: [...filesAffected],
    }
  }

  /**
   * 保存分析到记忆
   */
  private async saveAnalysisToMemory(
    functionInfo: FunctionAnalysis,
    references: Array<{ uri: string }>,
    callHierarchy: {
      incoming: Array<{ from: { name: string } }>
      outgoing: Array<{ to: { name: string } }>
    }
  ): Promise<void> {
    await this.app.remember(
      "code_context",
      `Function ${functionInfo.functionName} analysis: ${references.length} references, ${callHierarchy.incoming.length} callers, ${callHierarchy.outgoing.length} callees`,
      {
        filePath: functionInfo.filePath,
        importance: 8,
        tags: [
          "lsp-analysis",
          functionInfo.functionName,
          "references",
          "call-hierarchy",
        ],
      }
    )
  }

  /**
   * 查找历史相关分析
   */
  private async findRelatedAnalysis(
    functionName: string
  ): Promise<MemoryEntry[]> {
    const result = await this.app.recall({
      types: ["code_context"],
      tags: [functionName, "analysis"],
      limit: 10,
    })

    return result.entries
  }

  /**
   * 使用 LLM 生成修改建议
   */
  private async generateSuggestions(
    functionInfo: FunctionAnalysis,
    references: Array<{ uri: string }>,
    callHierarchy: {
      incoming: Array<{ from: { name: string } }>
      outgoing: Array<{ to: { name: string } }>
    }
  ): Promise<{ suggestions: string[]; risks: string[] }> {
    console.log(`  🤖 LLM: 生成修改建议...`)

    const prompt = `分析以下函数的修改影响：

函数: ${functionInfo.functionName}
签名: ${functionInfo.signature}
描述: ${functionInfo.description || "无"}

调用统计:
- 被 ${callHierarchy.incoming.length} 个函数直接调用
- 调用了 ${callHierarchy.outgoing.length} 个函数
- 在 ${references.length} 个地方被引用

调用者: ${callHierarchy.incoming.map(c => c.from.name).join(", ") || "无"}
被调用者: ${callHierarchy.outgoing.map(c => c.to.name).join(", ") || "无"}

请提供:
1. 修改此函数时的注意事项（3-5条）
2. 潜在的风险点（2-3条）
3. 建议的测试策略

请以 JSON 格式返回:
{
  "suggestions": ["建议1", "建议2", ...],
  "risks": ["风险1", "风险2", ...]
}`

    try {
      const response = await this.app.chat(prompt)

      // 尝试从响应中解析 JSON
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          suggestions: parsed.suggestions || [],
          risks: parsed.risks || [],
        }
      }
    } catch (err) {
      console.error("LLM 分析失败:", err)
    }

    // 返回默认建议
    return {
      suggestions: [
        `函数 ${functionInfo.functionName} 被 ${callHierarchy.incoming.length} 个调用者使用，修改时需要保持向后兼容`,
        `建议添加单元测试覆盖所有 ${references.length} 个引用点`,
        "修改后运行集成测试验证调用链",
      ],
      risks: [
        "可能破坏调用者的依赖",
        "需要同步更新相关文档",
      ],
    }
  }

  /**
   * 打印分析结果
   */
  printAnalysis(result: CodeAnalysisResult): void {
    console.log("\n" + "=".repeat(60))
    console.log("📊 代码分析报告")
    console.log("=".repeat(60))

    console.log(`\n🎯 目标函数: ${result.target.functionName}`)
    console.log(`   文件: ${result.target.filePath}:${result.target.line}`)
    console.log(`   签名: ${result.target.signature}`)
    if (result.target.description) {
      console.log(`   文档: ${result.target.description.substring(0, 100)}...`)
    }

    console.log("\n📞 调用链:")
    for (const chain of result.callChains) {
      const arrow = chain.caller === "target" ? "→" : "←"
      const name = chain.caller === "target" ? chain.callee : chain.caller
      console.log(`   ${chain.caller} ${arrow} ${name} (${chain.filePath}:${chain.line})`)
    }

    console.log("\n💥 影响范围:")
    console.log(`   直接调用者: ${result.impact.directCallers.length} 个`)
    result.impact.directCallers.forEach(c => console.log(`     - ${c}`))
    console.log(`   被调用函数: ${result.impact.callees.length} 个`)
    result.impact.callees.forEach(c => console.log(`     - ${c}`))
    console.log(`   影响文件: ${result.impact.filesAffected.length} 个`)
    result.impact.filesAffected.forEach(f => console.log(`     - ${f}`))

    console.log("\n💡 修改建议:")
    result.suggestions.forEach((s, i) => console.log(`   ${i + 1}. ${s}`))

    console.log("\n⚠️  潜在风险:")
    result.risks.forEach((r, i) => console.log(`   ${i + 1}. ${r}`))

    console.log("\n📚 历史相关分析:")
    console.log(`   找到 ${result.relatedCode.length} 条相关记录`)

    console.log("\n" + "=".repeat(60))
  }
}
