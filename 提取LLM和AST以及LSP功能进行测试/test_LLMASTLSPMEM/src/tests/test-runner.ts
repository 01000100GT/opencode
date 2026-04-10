/**
 * 测试运行器
 * 验证所有模块的功能
 */

import { Application } from "../index"
import type { MemoryStats } from "../domain/memory"

async function runTests() {
  console.log("=" .repeat(60))
  console.log("LLM-AST-LSP-MEM 集成测试")
  console.log("=" .repeat(60))

  const app = new Application()
  await app.initialize()

  // 测试 1: AST 命令分析
  console.log("\n📦 测试 1: AST 命令分析")
  console.log("-".repeat(40))

  const testCommands = [
    "cat file.txt",
    "ls -la /home/user",
    "echo hello world",
    "rm -rf dangerous",
  ]

  for (const cmd of testCommands) {
    console.log(`\n命令: ${cmd}`)
    const result = await app.analyzeCommand(cmd, "/workspace")
    console.log(`  解析到 ${result.commands.length} 个命令:`)
    for (const c of result.commands) {
      console.log(`    - ${c.command} (文件操作: ${c.isFileOperation})`)
      console.log(`      参数: ${c.args.join(", ") || "无"}`)
    }
  }

  // 测试 2: 记忆功能
  console.log("\n\n📦 测试 2: 记忆功能")
  console.log("-".repeat(40))

  // 创建记忆
  await app.remember("conversation", "用户询问关于AST的实现细节", {
    importance: 8,
    tags: ["ast", "question"],
  })

  await app.remember("code_context", "function analyze() { return ast.parse(); }", {
    filePath: "/src/ast.ts",
    importance: 7,
    tags: ["code", "ast"],
  })

  await app.remember("file_operation", "读取了 requirements.md 文件", {
    importance: 5,
    tags: ["file", "read"],
  })

  console.log("✓ 创建了 3 条记忆")

  // 搜索记忆
  const searchResult = await app.recall({
    types: ["conversation", "code_context"],
    limit: 10,
  })
  console.log(`\n✓ 搜索到 ${searchResult.total} 条记忆:`)
  for (const entry of searchResult.entries) {
    console.log(`  [${entry.type}] ${entry.content.substring(0, 50)}...`)
  }

  // 获取上下文窗口
  const context = await app.getContextWindow("AST")
  console.log(`\n✓ 上下文窗口: ${context.tokens} tokens, ${context.entries.length} 条记忆`)

  // 测试 3: LSP 功能
  console.log("\n\n📦 测试 3: LSP 功能")
  console.log("-".repeat(40))

  // 模拟文件操作
  const testFile = "/workspace/test.ts"
  await app.executeLSPOperation("documentSymbol", testFile, 1, 1)
  console.log("✓ Document Symbol 查询成功")

  const hoverResult = await app.executeLSPOperation("hover", testFile, 5, 10)
  console.log(`✓ Hover 查询成功: ${hoverResult.success}`)

  const defResult = await app.executeLSPOperation("goToDefinition", testFile, 10, 5)
  console.log(`✓ Go to Definition 查询成功: ${defResult.success}`)

  // 获取诊断信息
  const diagnostics = await app.getDiagnostics()
  console.log(`✓ 获取到 ${Object.keys(diagnostics).length} 个文件的诊断信息`)

  // 测试 4: LLM 功能
  console.log("\n\n📦 测试 4: LLM 功能")
  console.log("-".repeat(40))

  // 注册测试工具
  app.registerTool(
    {
      name: "get_current_time",
      description: "获取当前时间",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_current_time",
      execute: async () => {
        return { time: new Date().toISOString() }
      },
    }
  )

  console.log("✓ 注册了测试工具: get_current_time")

  // 对话测试
  const response1 = await app.chat("你好，请介绍一下AST的作用")
  console.log(`\n用户: 你好，请介绍一下AST的作用`)
  console.log(`助手: ${response1.content.substring(0, 100)}...`)

  const response2 = await app.chat("LSP如何与编辑器集成？")
  console.log(`\n用户: LSP如何与编辑器集成？`)
  console.log(`助手: ${response2.content.substring(0, 100)}...`)

  // 测试 5: 统计信息
  console.log("\n\n📦 测试 5: 统计信息")
  console.log("-".repeat(40))

  const stats = app.getStats()
  const memoryStats = stats.memory as MemoryStats
  console.log("记忆统计:")
  console.log(`  总条目数: ${memoryStats.totalEntries}`)
  console.log(`  按类型分布:`, memoryStats.entriesByType)
  console.log(`  平均重要性: ${memoryStats.averageImportance.toFixed(2)}`)

  console.log("\nLLM统计:")
  const llmStats = stats.llm as { registeredTools: string[] }
  console.log(`  注册工具: ${llmStats.registeredTools.join(", ") || "无"}`)

  // 结束测试
  console.log("\n" + "=".repeat(60))
  console.log("✅ 所有测试通过!")
  console.log("=".repeat(60))

  await app.shutdown()
}

// 运行测试
runTests().catch((err) => {
  console.error("❌ 测试失败:", err)
})
