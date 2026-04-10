/**
 * Mock AST Parser适配器
 * 用于测试，模拟Tree-sitter解析
 */

import type { ASTParser } from "../domain/ast"

interface MockASTNode {
  type: string
  text: string
  childCount: number
  parent?: MockASTNode
  children: MockASTNode[]
  child(index: number): MockASTNode | null
  descendantsOfType(type: string): MockASTNode[]
}

export class MockASTParser implements ASTParser {
  async parse(command: string): Promise<MockASTNode> {
    // 简单的命令解析模拟
    const tokens = command.trim().split(/\s+/)
    const cmdName = tokens[0] || ""
    const args = tokens.slice(1)

    const root: MockASTNode = {
      type: "program",
      text: command,
      childCount: 1,
      children: [],
      child(index: number): MockASTNode | null {
        return this.children[index] || null
      },
      descendantsOfType(type: string): MockASTNode[] {
        const results: MockASTNode[] = []
        const traverse = (node: MockASTNode) => {
          if (node.type === type) results.push(node)
          node.children.forEach(traverse)
        }
        traverse(this)
        return results
      },
    }

    const commandNode: MockASTNode = {
      type: "command",
      text: command,
      childCount: 1 + args.length,
      parent: root,
      children: [],
      child(index: number): MockASTNode | null {
        return this.children[index] || null
      },
      descendantsOfType(type: string): MockASTNode[] {
        return []
      },
    }

    const commandNameNode: MockASTNode = {
      type: "command_name",
      text: cmdName,
      childCount: 0,
      parent: commandNode,
      children: [],
      child(): MockASTNode | null { return null },
      descendantsOfType(): MockASTNode[] { return [] },
    }

    commandNode.children.push(commandNameNode)

    for (const arg of args) {
      const argNode: MockASTNode = {
        type: "word",
        text: arg,
        childCount: 0,
        parent: commandNode,
        children: [],
        child(): MockASTNode | null { return null },
        descendantsOfType(): MockASTNode[] { return [] },
      }
      commandNode.children.push(argNode)
    }

    root.children.push(commandNode)
    return root
  }
}
