/**
 * 工具函数模块
 */

import type { ValidationResult, ValidationError } from "./types"

export function validateEmail(email: string): ValidationResult {
  const errors: ValidationError[] = []

  if (!email) {
    errors.push({ field: "email", message: "Email is required", code: "REQUIRED" })
  } else if (!email.includes("@")) {
    errors.push({ field: "email", message: "Invalid email format", code: "INVALID_FORMAT" })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ field: "email", message: "Email format is incorrect", code: "INVALID_FORMAT" })
  }

  return { valid: errors.length === 0, errors }
}

export function validateUserName(name: string): ValidationResult {
  const errors: ValidationError[] = []

  if (!name) {
    errors.push({ field: "name", message: "Name is required", code: "REQUIRED" })
  } else if (name.length < 2) {
    errors.push({ field: "name", message: "Name must be at least 2 characters", code: "TOO_SHORT" })
  } else if (name.length > 50) {
    errors.push({ field: "name", message: "Name must be less than 50 characters", code: "TOO_LONG" })
  }

  return { valid: errors.length === 0, errors }
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount)
}

export function calculateDiscount(amount: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error("Discount percent must be between 0 and 100")
  }
  return amount * (1 - discountPercent / 100)
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export function mergeObjects<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  return { ...target, ...source }
}
