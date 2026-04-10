/**
 * 智能分析演示 - 优化流程
 * 1. LSP/AST 静态分析发现问题
 * 2. 保存问题到 Memory
 * 3. LLM 查看 Memory 中的问题摘要
 * 4. LLM 提供解决方案
 * 5. 应用自动修复
 */

import { Application } from "../index"
import { SmartAnalyzer } from "../smart-analyzer"
import * as path from "path"

async function runDemo() {
  console.log("=".repeat(70))
  console.log("🔬 智能分析演示 - 优化流程")
  console.log("=".repeat(70))
  console.log("\n新流程:")
  console.log("  1️⃣  LSP/AST 静态分析 → 发现问题")
  console.log("  2️⃣  保存问题到 Memory")
  console.log("  3️⃣  LLM 查看 Memory 中的问题摘要")
  console.log("  4️⃣  LLM 提供解决方案")
  console.log("  5️⃣  应用自动修复\n")

  // 初始化
  const app = new Application()
  await app.initialize()

  const analyzer = new SmartAnalyzer(app)
  const targetProject = path.resolve(process.cwd(), "test/tstest")

  // ========== 步骤1: LSP/AST 静态分析 ==========
  console.log("\n" + "━".repeat(70))
  console.log("📍 步骤1: LSP/AST 静态分析")
  console.log("━".repeat(70))

  const session = await analyzer.analyzeWithLSPAndAST(targetProject)
  analyzer.printReport(session)

  // ========== 步骤2: 保存到 Memory ==========
  console.log("\n" + "━".repeat(70))
  console.log("📍 步骤2: 保存分析结果到 Memory")
  console.log("━".repeat(70))

  await analyzer.saveToMemory(session)

  // ========== 步骤3 & 4: LLM 查看问题并提供解决方案 ==========
  console.log("\n" + "━".repeat(70))
  console.log("📍 步骤3 & 4: LLM 分析问题并提供解决方案")
  console.log("━".repeat(70))

  const userQuestion = "请分析这些问题并提供修复建议"
  const solution = await analyzer.queryLLMForSolutions(session.sessionId, userQuestion)

  console.log("\n📋 LLM 解决方案:")
  console.log(solution)

  // ========== 步骤5: LLM 调用工具修复 ==========
  console.log("\n" + "━".repeat(70))
  console.log("📍 步骤5: LLM 调用工具修复")
  console.log("━".repeat(70))

  const fixResult = await analyzer.applyFixesWithLLM(session.sessionId)

  // ========== 完成 ==========
  console.log("\n" + "=".repeat(70))
  console.log("✨ 演示完成!")
  console.log("=".repeat(70))
  console.log(`\n总结:`)
  console.log(`  - 发现问题: ${session.summary.total} 个`)
  console.log(`  - LLM 工具调用: ${fixResult.toolCalls} 次`)
  console.log(`  - 修复结果: ${fixResult.success} 成功, ${fixResult.failed} 失败`)
  console.log(`  - 会话ID: ${session.sessionId}`)

  await app.shutdown()
}

runDemo().catch(console.error)
