/**
 * 订单服务模块
 * 包含复杂的订单管理逻辑
 */

import type { Order, OrderItem, OrderStatus, User } from "./types"
import { generateId, deepClone, calculateDiscount, formatCurrency } from "./utils"
import { getUserById, updateUserPreferences } from "./user-service"

// 模拟订单数据库
const orders: Map<string, Order> = new Map()

export async function createOrder(
  userId: string,
  items: OrderItem[]
): Promise<Order> {
  // 验证用户存在
  const user = await getUserById(userId)
  if (!user) {
    throw new Error("User not found")
  }

  // 验证订单项
  if (!items || items.length === 0) {
    throw new Error("Order must have at least one item")
  }

  for (const item of items) {
    if (item.quantity <= 0) {
      throw new Error("Item quantity must be greater than 0")
    }
    if (item.price < 0) {
      throw new Error("Item price cannot be negative")
    }
  }

  // 计算总金额
  const totalAmount = calculateOrderTotal(items)

  const order: Order = {
    id: generateId(),
    userId,
    items: deepClone(items),
    status: "pending",
    totalAmount,
    createdAt: new Date(),
  }

  orders.set(order.id, order)

  // 发送订单创建通知
  await sendOrderNotification(order, "created")

  return deepClone(order)
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<Order> {
  const order = await getOrderById(orderId)
  if (!order) {
    throw new Error("Order not found")
  }

  // 验证状态转换
  if (!isValidStatusTransition(order.status, newStatus)) {
    throw new Error(
      `Invalid status transition from ${order.status} to ${newStatus}`
    )
  }

  const updatedOrder: Order = {
    ...order,
    status: newStatus,
  }

  orders.set(orderId, updatedOrder)

  // 如果订单完成，更新用户统计
  if (newStatus === "delivered") {
    await updateUserOrderStats(updatedOrder.userId)
  }

  // 发送状态变更通知
  await sendOrderNotification(updatedOrder, "status_updated")

  return deepClone(updatedOrder)
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const order = orders.get(orderId)
  return order ? deepClone(order) : null
}

export async function getUserOrders(userId: string): Promise<Order[]> {
  const userOrders: Order[] = []
  for (const order of orders.values()) {
    if (order.userId === userId) {
      userOrders.push(deepClone(order))
    }
  }
  return userOrders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function cancelOrder(orderId: string): Promise<Order> {
  const order = await getOrderById(orderId)
  if (!order) {
    throw new Error("Order not found")
  }

  if (order.status === "delivered" || order.status === "cancelled") {
    throw new Error(`Cannot cancel order with status: ${order.status}`)
  }

  return updateOrderStatus(orderId, "cancelled")
}

export async function applyDiscount(
  orderId: string,
  discountPercent: number
): Promise<Order> {
  const order = await getOrderById(orderId)
  if (!order) {
    throw new Error("Order not found")
  }

  if (order.status !== "pending") {
    throw new Error("Can only apply discount to pending orders")
  }

  const discountedAmount = calculateDiscount(order.totalAmount, discountPercent)

  const updatedOrder: Order = {
    ...order,
    totalAmount: discountedAmount,
  }

  orders.set(orderId, updatedOrder)
  return deepClone(updatedOrder)
}

export async function getOrderStatistics(userId?: string): Promise<{
  totalOrders: number
  totalAmount: number
  averageOrderValue: number
  statusBreakdown: Record<OrderStatus, number>
}> {
  let relevantOrders = Array.from(orders.values())

  if (userId) {
    relevantOrders = relevantOrders.filter(o => o.userId === userId)
  }

  const totalOrders = relevantOrders.length
  const totalAmount = relevantOrders.reduce((sum, o) => sum + o.totalAmount, 0)
  const averageOrderValue = totalOrders > 0 ? totalAmount / totalOrders : 0

  const statusBreakdown: Record<OrderStatus, number> = {
    pending: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  }

  for (const order of relevantOrders) {
    statusBreakdown[order.status]++
  }

  return {
    totalOrders,
    totalAmount,
    averageOrderValue,
    statusBreakdown,
  }
}

// 内部辅助函数
function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

function isValidStatusTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus
): boolean {
  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["processing", "cancelled"],
    processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
  }

  return validTransitions[currentStatus].includes(newStatus)
}

async function sendOrderNotification(
  order: Order,
  event: "created" | "status_updated"
): Promise<void> {
  // 模拟发送通知
  console.log(`[Notification] Order ${order.id} ${event}. Status: ${order.status}`)

  // 如果订单金额较大，发送额外通知
  if (order.totalAmount > 1000) {
    console.log(`[High Value Alert] Order ${order.id} total: ${formatCurrency(order.totalAmount)}`)
  }
}

async function updateUserOrderStats(userId: string): Promise<void> {
  const stats = await getOrderStatistics(userId)

  // 根据订单统计更新用户偏好
  if (stats.totalOrders > 10) {
    await updateUserPreferences(userId, {
      notifications: true,
    })
  }
}
