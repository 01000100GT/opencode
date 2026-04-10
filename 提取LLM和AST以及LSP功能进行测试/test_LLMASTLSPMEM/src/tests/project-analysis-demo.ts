/**
 * 项目分析演示
 * 主项目 (test_LLMASTLSPMEM) 分析并修复子项目 (test/tstest)
 */

import { Application } from "../index"
import { ProjectAnalyzer } from "../project-analyzer"
import * as path from "path"

/**
 * 格式化时间戳
 */
function getTimestamp(): string {
  const now = new Date()
  return now.toISOString()
}

/**
 * 计算耗时
 */
function formatDuration(startTime: number): string {
  const duration = Date.now() - startTime
  return `${duration}ms`
}

/**
 * 打印带时间戳的日志
 */
function log(level: "INFO" | "WARN" | "ERROR" | "STEP", message: string, data?: unknown): void {
  const timestamp = getTimestamp()
  const prefix = `[${timestamp}] [${level}]`
  if (data) {
    console.log(`${prefix} ${message}`, data)
  } else {
    console.log(`${prefix} ${message}`)
  }
}

async function runDemo() {
  const demoStartTime = Date.now()

  console.log("=".repeat(70))
  console.log("🔬 项目分析演示")
  console.log("功能: 主项目分析并修复子项目中的错误")
  console.log("=".repeat(70))
  log("INFO", "演示开始")

  // 初始化主项目
  log("STEP", "步骤0: 初始化主项目应用")
  const initStartTime = Date.now()
  const app = new Application()
  await app.initialize()
  log("INFO", `主项目初始化完成，耗时: ${formatDuration(initStartTime)}`)

  // 创建项目分析器
  log("INFO", "创建项目分析器实例")
  const analyzer = new ProjectAnalyzer(app)

  // 目标子项目路径
  const targetProject = path.resolve(process.cwd(), "test/tstest")

  console.log(`\n📁 目标子项目: ${targetProject}`)
  console.log("\n场景: 子项目中有一个拼写错误 'creaateUser' 应该是 'createUser'")
  console.log("       主项目将自动检测并修复这个错误\n")

  // 步骤1: 分析项目
  log("STEP", "步骤1: 开始分析子项目")
  const analysisStartTime = Date.now()
  log("INFO", `开始扫描项目目录: ${targetProject}`)

  const analysis = await analyzer.analyzeProject(targetProject)

  log("INFO", `项目分析完成，耗时: ${formatDuration(analysisStartTime)}`)
  log("INFO", `扫描文件数量: ${analysis.files.length}`)
  log("INFO", `发现问题统计`, {
    errors: analysis.summary.errors,
    warnings: analysis.summary.warnings,
    suggestions: analysis.summary.suggestions,
    total: analysis.issues.length
  })

  // 步骤2: 打印分析结果
  log("STEP", "步骤2: 打印详细分析结果")
  const printStartTime = Date.now()
  analyzer.printAnalysis(analysis)
  log("INFO", `分析结果打印完成，耗时: ${formatDuration(printStartTime)}`)

  // 步骤3: 生成修复建议
  log("STEP", "步骤3: 生成修复建议")
  const fixGenStartTime = Date.now()

  log("INFO", "开始分析每个问题并生成修复方案")
  const fixes = await analyzer.generateFixes(analysis)

  log("INFO", `修复建议生成完成，耗时: ${formatDuration(fixGenStartTime)}`)
  log("INFO", `可自动修复的问题数量: ${fixes.length}`)

  if (fixes.length > 0) {
    console.log(`\n找到 ${fixes.length} 个可自动修复的问题:`)
    for (let i = 0; i < fixes.length; i++) {
      const fix = fixes[i]
      log("INFO", `修复项 ${i + 1}/${fixes.length}`, {
        file: path.basename(fix.filePath),
        line: fix.line,
        reason: fix.reason
      })
      console.log(`\n   📍 ${path.basename(fix.filePath)}:${fix.line}`)
      console.log(`      原因: ${fix.reason}`)
      console.log(`      原代码: ${fix.original.trim()}`)
      console.log(`      修复后: ${fix.replacement.trim()}`)
    }

    // 步骤4: 应用修复
    log("STEP", "步骤4: 应用修复到文件")
    const applyStartTime = Date.now()

    log("INFO", "开始写入修复后的文件内容")
    await analyzer.applyFixes(fixes)

    log("INFO", `修复应用完成，耗时: ${formatDuration(applyStartTime)}`)
    log("INFO", `成功修复 ${fixes.length} 个问题`)

    // 步骤5: 验证修复
    log("STEP", "步骤5: 验证修复结果")
    const verifyStartTime = Date.now()

    log("INFO", "重新分析项目以验证修复效果")
    const verification = await analyzer.analyzeProject(targetProject)

    log("INFO", `验证分析完成，耗时: ${formatDuration(verifyStartTime)}`)
    log("INFO", `修复后问题统计`, {
      errors: verification.summary.errors,
      warnings: verification.summary.warnings,
      suggestions: verification.summary.suggestions
    })

    if (verification.summary.errors === 0) {
      log("INFO", "✅ 所有错误已修复!")
      console.log("\n✅ 所有错误已修复!")
    } else {
      log("WARN", `还有 ${verification.summary.errors} 个错误需要手动修复`)
      console.log(`\n⚠️  还有 ${verification.summary.errors} 个错误需要手动修复`)
      analyzer.printAnalysis(verification)
    }

    // 步骤6: 使用 LLM 生成代码审查报告
    log("STEP", "步骤6: 生成代码审查报告")
    const reportStartTime = Date.now()

    const reviewPrompt = `作为代码审查专家，请对以下项目分析结果进行总结：

项目: ${targetProject}
发现问题: ${analysis.summary.errors} 个错误, ${analysis.summary.warnings} 个警告
已修复: ${fixes.length} 个问题

请提供:
1. 代码质量评估
2. 主要问题类型分析
3. 预防类似问题的建议
4. 代码维护最佳实践

请以结构化的方式回答。`

    log("INFO", "发送请求到 LLM 生成审查报告")
    const review = await app.chat(reviewPrompt)

    log("INFO", `代码审查报告生成完成，耗时: ${formatDuration(reportStartTime)}`)
    console.log("\n📋 代码审查报告:")
    console.log(review.content)

  } else {
    log("INFO", "没有发现需要自动修复的问题")
    console.log("\n✅ 没有发现需要自动修复的问题")
  }

  // 保存分析历史
  log("INFO", "保存分析历史到记忆系统")
  const memoryStartTime = Date.now()

  await app.remember(
    "code_context",
    `项目分析完成: ${targetProject} - 修复了 ${fixes.length} 个问题`,
    {
      filePath: targetProject,
      importance: 9,
      tags: ["project-analysis", "completed", "auto-fix"],
    }
  )

  log("INFO", `分析历史保存完成，耗时: ${formatDuration(memoryStartTime)}`)

  // 演示完成
  log("INFO", `演示总耗时: ${formatDuration(demoStartTime)}`)
  console.log("\n" + "=".repeat(70))
  console.log("✨ 演示完成!")
  console.log("=".repeat(70))

  // 关闭应用
  log("INFO", "关闭主项目应用")
  const shutdownStartTime = Date.now()
  await app.shutdown()
  log("INFO", `应用关闭完成，耗时: ${formatDuration(shutdownStartTime)}`)
  log("INFO", "演示结束")
}

// 运行演示
runDemo().catch((err) => {
  log("ERROR", "演示执行失败", err)
  console.error(err)
  process.exit(1)
})
