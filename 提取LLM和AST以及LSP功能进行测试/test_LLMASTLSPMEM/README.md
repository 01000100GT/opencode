# LLM-AST-LSP-MEM 框架

基于六边形架构（Hexagonal Architecture）和 SOLID 原则的模块化设计，提取了 OpenCode 中的 LLM、AST、LSP 和记忆框架功能。

## 架构设计

### 六边形架构（端口与适配器模式）

```
┌─────────────────────────────────────────────────────────────┐
│                        应用核心层                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   AST 领域   │  │   LSP 领域   │  │  Memory 领域 │      │
│  │  - 命令解析  │  │  - 代码智能  │  │  - 记忆管理  │      │
│  │  - 安全分析  │  │  - 诊断反馈  │  │  - 上下文窗口│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐                                          │
│  │   LLM 领域   │                                          │
│  │  - 对话管理  │                                          │
│  │  - 工具调用  │                                          │
│  └──────────────┘                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                     端口层                   │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
    │  │FileSystem│ │  Logger  │ │  Config  │    │
    │  └──────────┘ └──────────┘ └──────────┘    │
    └──────────────────────┬──────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │               适配器层             │
         │  ┌──────────┐ ┌──────────┐       │
         │  │MockAST   │ │MockLSP   │       │
         │  │Parser    │ │Client    │       │
         │  ├──────────┤ ├──────────┤       │
         │  │MockLLM   │ │InMemory  │       │
         │  │Provider  │ │Storage   │       │
         │  └──────────┘ └──────────┘       │
         └───────────────────────────────────┘
```

## 模块职责

### 1. AST 领域 (`src/domain/ast/`)
- **职责**: Bash/PowerShell 命令解析与安全分析
- **核心类**: `ASTService`
- **功能**:
  - 解析命令字符串为 AST
  - 提取命令、参数和文件路径
  - 识别文件操作命令（cat, rm, mv 等）
  - 安全扫描和权限分析

### 2. LSP 领域 (`src/domain/lsp/`)
- **职责**: 语言服务器协议交互
- **核心类**: `LSPService`
- **功能**:
  - 代码定义跳转 (`goToDefinition`)
  - 引用查找 (`findReferences`)
  - 悬停提示 (`hover`)
  - 文档符号 (`documentSymbol`)
  - 工作区符号 (`workspaceSymbol`)
  - 调用层次 (`callHierarchy`)
  - 诊断信息收集

### 3. Memory 领域 (`src/domain/memory/`)
- **职责**: 记忆存储与上下文管理
- **核心类**: `MemoryService`
- **功能**:
  - 多类型记忆存储（对话、代码上下文、文件操作等）
  - 智能检索（按类型、标签、时间、重要性）
  - 上下文窗口构建
  - 记忆压缩与清理
  - 相关性评分

### 4. LLM 领域 (`src/domain/llm/`)
- **职责**: 大语言模型交互编排
- **核心类**: `LLMService`
- **功能**:
  - 对话管理
  - 工具注册与调用
  - 流式响应
  - 上下文增强

## SOLID 原则应用

### 单一职责原则 (SRP)
- 每个领域模块只负责一个核心功能
- `ASTService` 只处理命令解析
- `LSPService` 只处理语言服务器交互
- `MemoryService` 只处理记忆管理

### 开闭原则 (OCP)
- 通过接口和抽象支持扩展
- 可以添加新的 `ASTParser` 实现而不修改 `ASTService`
- 可以添加新的 `LSPClient` 实现而不修改 `LSPService`

### 里氏替换原则 (LSP)
- `MockASTParser` 可以替换为真实的 Tree-sitter 解析器
- `MockLSPClient` 可以替换为真实的 LSP 客户端
- `InMemoryStorage` 可以替换为 `FileStorage`

### 接口隔离原则 (ISP)
- `FileSystem` 接口只包含文件操作相关方法
- `LoggerPort` 接口只包含日志相关方法
- 客户端不依赖不需要的方法

### 依赖倒置原则 (DIP)
- 领域层依赖抽象接口（端口）
- 具体实现（适配器）在应用层注入
- 领域层不依赖具体技术实现

## 项目结构

```
test_LLMASTLSPMEM/
├── src/
│   ├── domain/           # 领域层（核心业务逻辑）
│   │   ├── ast/          # AST 领域
│   │   ├── lsp/          # LSP 领域
│   │   ├── memory/       # 记忆领域
│   │   └── llm/          # LLM 领域
│   ├── ports/            # 端口层（抽象接口）
│   ├── adapters/         # 适配器层（具体实现）
│   ├── config/           # 配置模块
│   ├── tests/            # 测试
│   └── index.ts          # 主应用入口
├── package.json
├── tsconfig.json
└── README.md
```

## 使用方法

### 安装依赖
```bash
bun install
```

### 运行测试
```bash
bun run test
```

### 类型检查
```bash
bun run typecheck
```

### 开发模式
```bash
bun run dev
```

## 代码示例

### 初始化应用
```typescript
import { Application } from "./src/index"

const app = new Application()
await app.initialize()
```

### AST 命令分析
```typescript
const result = await app.analyzeCommand("cat file.txt", "/workspace")
console.log(result.commands)
// [{ command: "cat", args: ["file.txt"], isFileOperation: true }]
```

### LSP 操作
```typescript
const result = await app.executeLSPOperation(
  "goToDefinition",
  "/workspace/test.ts",
  10,
  5
)
```

### 记忆管理
```typescript
// 创建记忆
await app.remember("code_context", "function foo() {}", {
  filePath: "/src/test.ts",
  importance: 8,
  tags: ["function", "test"]
})

// 搜索记忆
const results = await app.recall({
  types: ["code_context"],
  tags: ["function"]
})

// 获取上下文窗口
const context = await app.getContextWindow("当前查询")
```

### LLM 对话
```typescript
// 注册工具
app.registerTool(
  {
    name: "get_time",
    description: "获取当前时间",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "get_time",
    execute: async () => ({ time: new Date().toISOString() })
  }
)

// 对话
const response = await app.chat("你好，现在几点了？")
console.log(response.content)
```

## 扩展指南

### 添加真实的 AST 解析器
```typescript
import Parser from "web-tree-sitter"

class TreeSitterParser implements ASTParser {
  async parse(command: string, isPowerShell: boolean): Promise<ASTNode> {
    // 使用真实的 tree-sitter 解析
  }
}

// 在初始化时注入
const app = new Application()
app.ast = new ASTService(new TreeSitterParser(), fileSystem)
```

### 添加真实的 LSP 客户端
```typescript
class TypeScriptLSPClient implements LSPClient {
  // 实现 LSP 协议通信
}

await app.lsp.registerClient("typescript", new TypeScriptLSPClient())
```

### 添加持久化存储
```typescript
const fileStorage = new FileStorage("./memory.json")
const tokenizer = new SimpleTokenizer()
app.memory = new MemoryService(fileStorage, tokenizer, 4000)
```

## 专家团队的设计决策

### 1. 软件架构大师
- 采用六边形架构确保核心业务逻辑独立于外部依赖
- 领域层位于架构中心，通过端口与外部交互
- 适配器层封装所有技术细节

### 2. SOLID 原则权威
- 严格遵循 SOLID 五个原则
- 每个类只有一个变化原因
- 依赖抽象而非具体实现

### 3. 技术栈战略家
- 使用 TypeScript 提供类型安全
- Bun 运行时提供高性能
- 模块化设计支持渐进式增强

### 4. 数据驱动框架架构师
- 记忆系统支持多维度检索
- 上下文窗口自动构建
- 相关性评分算法

### 5. MVP 开发专家
- 提供 Mock 实现支持快速原型
- 清晰的接口定义便于替换
- 完整的测试覆盖

### 6. 可扩展性专家
- 插件式工具注册机制
- 多语言 LSP 客户端支持
- 可插拔存储后端

### 7. 产品迭代大师
- 清晰的模块边界支持独立迭代
- 完善的日志和监控
- 易于测试和调试

## License

MIT
