/**
 * AST领域模块导出
 * 遵循接口隔离原则：只暴露必要的接口
 */

export * from "./types"
export { ASTService, type ASTParser, type FileSystem } from "./ast-service"
