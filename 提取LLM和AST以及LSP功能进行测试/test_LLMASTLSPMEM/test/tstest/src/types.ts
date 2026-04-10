/**
 * 类型定义文件
 */

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  metadata: UserMetadata
}

export type UserRole = "admin" | "user" | "guest"

export interface UserMetadata {
  createdAt: Date
  lastLoginAt: Date
  preferences: UserPreferences
}

export interface UserPreferences {
  theme: "light" | "dark"
  notifications: boolean
  language: string
}

export interface Order {
  id: string
  userId: string
  items: OrderItem[]
  status: OrderStatus
  totalAmount: number
  createdAt: Date
}

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled"

export interface OrderItem {
  productId: string
  quantity: number
  price: number
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}
