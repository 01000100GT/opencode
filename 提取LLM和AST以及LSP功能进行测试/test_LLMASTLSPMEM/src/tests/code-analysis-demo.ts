/**
 * 代码分析演示
 * 展示如何使用 LLM + AST + LSP + Memory 进行调试前的调用链分析
 */

import { Application } from "../index"
import { CodeAnalyzer } from "../code-analyzer"
import * as path from "path"

async function runDemo() {
  console.log("=".repeat(70))
  console.log("🔬 智能代码分析演示")
  console.log("功能: 修改前通过 LLM/AST/LSP/MEM 查找功能调用链条")
  console.log("=".repeat(70))

  // 初始化应用
  const app = new Application()
  await app.initialize()

  // 创建代码分析器
  const analyzer = new CodeAnalyzer(app)

  // 目标文件路径
  const targetFile = path.resolve(
    process.cwd(),
    "test/tstest/src/helloworld.ts"
  )

  console.log(`\n📁 目标文件: ${targetFile}`)
  console.log("\n场景: 客户想要修改 'processUserRegistrationWithFirstOrder' 函数")
  console.log("       在修改前，需要了解它的完整调用链和影响范围\n")

  // 分析目标函数
  const analysis = await analyzer.analyzeFunction(
    targetFile,
    "processUserRegistrationWithFirstOrder",
    23 // 函数定义所在的行号
  )

  // 打印分析结果
  analyzer.printAnalysis(analysis)

  // 模拟用户的修改意图
  console.log("\n📝 模拟修改意图:")
  console.log("   用户想要修改 'processUserRegistrationWithFirstOrder' 函数，")
  console.log("   添加一个新的参数 'referralCode' 用于推荐码功能。")

  // 使用 LLM 进行深度分析
  console.log("\n🤖 请求 LLM 进行深度影响分析...")

  const deepAnalysisPrompt = `基于以下代码分析结果，请深入分析修改影响：

目标函数: processUserRegistrationWithFirstOrder
当前签名: ${analysis.target.signature}

调用链信息:
- 直接调用者: ${analysis.impact.directCallers.join(", ") || "无（顶层函数）"}
- 被调用函数: ${analysis.impact.callees.join(", ")}
- 影响文件: ${analysis.impact.filesAffected.length} 个

用户想要添加一个可选参数 'referralCode?: string' 用于推荐码功能。

请详细分析:
1. 这个修改的向后兼容性如何？
2. 需要修改哪些文件？
3. 测试覆盖策略是什么？
4. 部署时的注意事项？

请以结构化的方式回答。`

  const llmResponse = await app.chat(deepAnalysisPrompt)
  console.log("\n📊 LLM 深度分析结果:")
  console.log(llmResponse.content)

  // 保存分析到记忆
  await app.remember(
    "code_context",
    `修改分析: processUserRegistrationWithFirstOrder - 添加 referralCode 参数`,
    {
      filePath: targetFile,
      importance: 10,
      tags: [
        "modification-plan",
        "processUserRegistrationWithFirstOrder",
        "referral-code",
      ],
    }
  )

  // 查询历史相关修改
  console.log("\n📚 查询历史相关修改记录...")
  const history = await app.recall({
    types: ["code_context"],
    tags: ["modification-plan"],
    limit: 5,
  })

  console.log(`   找到 ${history.entries.length} 条历史修改计划`)
  history.entries.forEach((entry, i) => {
    console.log(`   ${i + 1}. ${entry.content.substring(0, 60)}...`)
  })

  // 生成修改任务清单
  console.log("\n✅ 修改前检查清单:")
  const checklist = [
    "☐ 已分析所有调用者",
    "☐ 已识别所有被调用函数",
    "☐ 已评估向后兼容性",
    "☐ 已准备单元测试",
    "☐ 已准备集成测试",
    "☐ 已更新文档",
    "☐ 已创建回滚计划",
  ]
  checklist.forEach(item => console.log(`   ${item}`))

  console.log("\n" + "=".repeat(70))
  console.log("✨ 演示完成!")
  console.log("=".repeat(70))

  // 关闭应用
  await app.shutdown()
}

// 运行演示
runDemo().catch(console.error)
