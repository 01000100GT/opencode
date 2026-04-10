/**
 * 测试文件 - 验证项目可以正常运行
 */

import {
  processUserRegistrationWithFirstOrder,
  processOrderCompletion,
  batchCancelOrders,
  getUserCompleteProfile,
  cleanupInactiveUsers,
} from "./helloworld"

async function runTests() {
  console.log("=".repeat(60))
  console.log("🧪 测试 tstest 项目")
  console.log("=".repeat(60))

  try {
    // 测试1: 用户注册和首单创建
    console.log("\n📦 测试1: 用户注册和首单创建")
    const result1 = await processUserRegistrationWithFirstOrder(
      "张三",
      "zhangsan@example.com",
      [
        { productId: "prod-001", quantity: 2, price: 99.99 },
        { productId: "prod-002", quantity: 1, price: 199.99 },
      ]
    )
    console.log("✅ 用户创建成功:", result1.user.id)
    console.log("✅ 订单创建成功:", result1.order.id)
    console.log("   订单金额:", result1.order.totalAmount)
    console.log("   订单状态:", result1.order.status)

    // 测试2: 获取用户完整档案
    console.log("\n📦 测试2: 获取用户完整档案")
    const profile = await getUserCompleteProfile(result1.user.id)
    console.log("✅ 用户信息:", profile.user.name)
    console.log("✅ 订单数量:", profile.statistics.totalOrders)
    console.log("✅ 总消费:", profile.statistics.totalSpent)

    // 测试3: 批量取消订单（空数组测试）
    console.log("\n📦 测试3: 批量取消订单")
    const cancelResult = await batchCancelOrders([])
    console.log("✅ 批量取消完成:", cancelResult.cancelled.length, "个成功")

    // 测试4: 清理无效用户
    console.log("\n📦 测试4: 清理无效用户")
    const cleanupResult = await cleanupInactiveUsers()
    console.log("✅ 清理完成:", cleanupResult.deleted.length, "个删除")
    console.log("✅ 跳过:", cleanupResult.skipped.length, "个")

    console.log("\n" + "=".repeat(60))
    console.log("✅ 所有测试通过!")
    console.log("=".repeat(60))
  } catch (err) {
    console.error("\n❌ 测试失败:", err)
    process.exit(1)
  }
}

runTests()
