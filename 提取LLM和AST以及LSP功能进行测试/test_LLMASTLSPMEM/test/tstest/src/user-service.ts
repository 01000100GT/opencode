/**
 * 用户服务模块
 * 包含复杂的用户管理逻辑
 */

import type { User, UserRole, ValidationResult, Order } from "./types"
import { validateEmail, validateUserName, generateId, deepClone } from "./utils"

// 模拟数据库
const users: Map<string, User> = new Map()

export async function createUser(
  name: string,
  email: string,
  role: UserRole = "user"
): Promise<User> {
  // 验证输入
  const nameValidation = validateUserName(name)
  if (!nameValidation.valid) {
    throw new Error(`Invalid name: ${nameValidation.errors.map(e => e.message).join(", ")}`)
  }

  const emailValidation = validateEmail(email)
  if (!emailValidation.valid) {
    throw new Error(`Invalid email: ${emailValidation.errors.map(e => e.message).join(", ")}`)
  }

  // 检查邮箱是否已存在
  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    throw new Error("User with this email already exists")
  }

  const user: User = {
    id: generateId(),
    name,
    email,
    role,
    metadata: {
      createdAt: new Date(),
      lastLoginAt: new Date(),
      preferences: {
        theme: "light",
        notifications: true,
        language: "en",
      },
    },
  }

  users.set(user.id, user)
  return deepClone(user)
}

export async function updateUser(
  userId: string,
  updates: Partial<Pick<User, "name" | "email" | "role">>
): Promise<User> {
  const user = await getUserById(userId)
  if (!user) {
    throw new Error("User not found")
  }

  if (updates.name) {
    const validation = validateUserName(updates.name)
    if (!validation.valid) {
      throw new Error(`Invalid name: ${validation.errors.map(e => e.message).join(", ")}`)
    }
  }

  if (updates.email && updates.email !== user.email) {
    const validation = validateEmail(updates.email)
    if (!validation.valid) {
      throw new Error(`Invalid email: ${validation.errors.map(e => e.message).join(", ")}`)
    }

    const existingUser = await findUserByEmail(updates.email)
    if (existingUser && existingUser.id !== userId) {
      throw new Error("Email already in use by another user")
    }
  }

  const updatedUser = {
    ...user,
    ...updates,
    metadata: {
      ...user.metadata,
      lastLoginAt: new Date(),
    },
  }

  users.set(userId, updatedUser)
  return deepClone(updatedUser)
}

export async function getUserById(userId: string): Promise<User | null> {
  const user = users.get(userId)
  return user ? deepClone(user) : null
}

export async function findUserByEmail(email: string): Promise<User | null> {
  for (const user of users.values()) {
    if (user.email === email) {
      return deepClone(user)
    }
  }
  return null
}

export async function deleteUser(userId: string): Promise<boolean> {
  const user = await getUserById(userId)
  if (!user) {
    return false
  }

  // 检查用户是否有未完成的订单
  const hasActiveOrders = await checkUserActiveOrders(userId)
  if (hasActiveOrders) {
    throw new Error("Cannot delete user with active orders")
  }

  return users.delete(userId)
}

export async function listUsers(role?: UserRole): Promise<User[]> {
  const allUsers = Array.from(users.values())
  if (role) {
    return allUsers.filter(u => u.role === role).map(deepClone)
  }
  return allUsers.map(deepClone)
}

// 这个函数会被 order-service.ts 调用
export async function checkUserActiveOrders(userId: string): Promise<boolean> {
  // 这里会导入 order-service 来检查
  // 为了避免循环依赖，实际实现会在 order-service 中
  const { getUserOrders } = await import("./order-service")
  const orders = await getUserOrders(userId)
  return orders.some(o => o.status !== "delivered" && o.status !== "cancelled")
}

export async function updateUserPreferences(
  userId: string,
  preferences: Partial<User["metadata"]["preferences"]>
): Promise<User> {
  const user = await getUserById(userId)
  if (!user) {
    throw new Error("User not found")
  }

  const updatedUser = {
    ...user,
    metadata: {
      ...user.metadata,
      preferences: {
        ...user.metadata.preferences,
        ...preferences,
      },
    },
  }

  users.set(userId, updatedUser)
  return deepClone(updatedUser)
}
