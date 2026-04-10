/**
 * 主入口文件 - 包含复杂的业务逻辑
 * 用于演示修改前的调用链分析
 */

import type { User, Order, OrderItem } from "./types"
import { getUserById, deleteUser, listUsers } from "./user-service"
import {
  createOrder,
  updateOrderStatus,
  getOrderById,
  getUserOrders,
  cancelOrder,
  applyDiscount,
  getOrderStatistics,
} from "./order-service"
import { validateEmail, formatCurrency } from "./utils"

/**
 * 核心功能：处理用户注册和首单创建
 * 这个函数有复杂的调用链，是我们要分析的目标
 */
export async function processUserRegistrationWithFirstOrder(
  userName: string,
  userEmail: string,
  orderItems: OrderItem[]
): Promise<{ user: User; order: Order }> {
  console.log(`[Process] Starting registration for ${userEmail}`)

  // 步骤1：验证邮箱格式
  const emailValidation = validateEmail(userEmail)
  if (!emailValidation.valid) {
    throw new Error(`Email validation failed: ${emailValidation.errors[0].message}`)
  }

  // 步骤2：创建用户
  const user = await createUser(userName, userEmail, "user")
  console.log(`[Process] User created: ${user.id}`)

  // 步骤3：创建首单
  const order = await createOrder(user.id, orderItems)
  console.log(`[Process] First order created: ${order.id}`)

  // 步骤4：应用新用户折扣（10%）
  const discountedOrder = await applyDiscount(order.id, 10)
  console.log(`[Process] Discount applied. New total: ${formatCurrency(discountedOrder.totalAmount)}`)

  // 步骤5：更新订单状态为处理中
  const processingOrder = await updateOrderStatus(order.id, "processing")
  console.log(`[Process] Order status updated to: ${processingOrder.status}`)

  return { user, order: processingOrder }
}

/**
 * 核心功能：处理订单完成流程
 * 涉及多个服务的复杂交互
 */
export async function processOrderCompletion(orderId: string): Promise<Order> {
  console.log(`[Process] Completing order: ${orderId}`)

  // 步骤1：获取订单
  const order = await getOrderById(orderId)
  if (!order) {
    throw new Error(`Order not found: ${orderId}`)
  }

  // 步骤2：验证订单状态
  if (order.status !== "shipped") {
    throw new Error(`Cannot complete order with status: ${order.status}`)
  }

  // 步骤3：获取用户信息
  const user = await getUserById(order.userId)
  if (!user) {
    throw new Error(`User not found: ${order.userId}`)
  }

  // 步骤4：更新订单状态为已送达
  const completedOrder = await updateOrderStatus(orderId, "delivered")
  console.log(`[Process] Order ${orderId} marked as delivered`)

  // 步骤5：获取用户订单统计
  const stats = await getOrderStatistics(user.id)
  console.log(`[Process] User ${user.id} has ${stats.totalOrders} orders`)

  return completedOrder
}

/**
 * 核心功能：批量处理订单取消
 */
export async function batchCancelOrders(orderIds: string[]): Promise<{
  cancelled: string[]
  failed: { orderId: string; reason: string }[]
}> {
  const result = {
    cancelled: [] as string[],
    failed: [] as { orderId: string; reason: string }[],
  }

  for (const orderId of orderIds) {
    try {
      await cancelOrder(orderId)
      result.cancelled.push(orderId)
      console.log(`[Batch] Cancelled order: ${orderId}`)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      result.failed.push({ orderId, reason })
      console.error(`[Batch] Failed to cancel order ${orderId}: ${reason}`)
    }
  }

  return result
}

/**
 * 核心功能：获取用户完整档案
 * 聚合用户信息和订单历史
 */
export async function getUserCompleteProfile(userId: string): Promise<{
  user: User
  orders: Order[]
  statistics: {
    totalOrders: number
    totalSpent: number
    averageOrderValue: number
  }
}> {
  // 获取用户信息
  const user = await getUserById(userId)
  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  // 获取用户订单
  const orders = await getUserOrders(userId)

  // 获取订单统计
  const stats = await getOrderStatistics(userId)

  return {
    user,
    orders,
    statistics: {
      totalOrders: stats.totalOrders,
      totalSpent: stats.totalAmount,
      averageOrderValue: stats.averageOrderValue,
    },
  }
}

/**
 * 核心功能：清理无效用户
 * 删除没有订单且注册超过30天的用户
 */
export async function cleanupInactiveUsers(): Promise<{
  deleted: string[]
  skipped: string[]
}> {
  const result = {
    deleted: [] as string[],
    skipped: [] as string[],
  }

  const allUsers = await listUsers()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  for (const user of allUsers) {
    const orders = await getUserOrders(user.id)

    if (orders.length === 0 && user.metadata.createdAt < thirtyDaysAgo) {
      try {
        await deleteUser(user.id)
        result.deleted.push(user.id)
        console.log(`[Cleanup] Deleted inactive user: ${user.id}`)
      } catch (err) {
        result.skipped.push(user.id)
        console.error(`[Cleanup] Failed to delete user ${user.id}`)
      }
    } else {
      result.skipped.push(user.id)
    }
  }

  return result
}

// 导出所有功能
export * from "./types"
export * from "./utils"
export * from "./user-service"
export * from "./order-service"
