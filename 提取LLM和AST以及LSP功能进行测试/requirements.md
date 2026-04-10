OpenCode 中 LSP 和 AST 是**两套完全独立的机制**，服务于不同目的，并非直接融合使用。以下是完整梳理：

---

## AST（tree-sitter）的两个独立用途

### 1. Bash 命令安全分析（核心用途）

`packages/opencode/src/tool/bash.ts` 在执行任何 bash 命令**之前**，先用 `web-tree-sitter` 将命令字符串解析为 AST，再遍历 AST 提取所有子命令和文件路径参数，用于向用户请求精确的权限。

流程：
```
LLM 调用 bash tool
  → parse(command) — tree-sitter 解析为 AST
  → collect(root)  — 遍历 AST 提取命令节点和路径参数
  → ask(ctx, scan) — 根据扫描结果请求权限
  → run(...)       — 实际执行命令
``` [1](#2-0) [2](#2-1) [3](#2-2) 

关键细节：
- `commands(node)` 用 `descendantsOfType("command")` 提取所有命令节点（包括嵌套子命令如 `echo $(cat file)`）
- `parts(node)` 从 AST 节点提取命令名和参数，区分 `command_name`、`word`、`string` 等节点类型
- 支持 bash 和 PowerShell 两种语法（分别加载 `tree-sitter-bash.wasm` 和 `tree-sitter-powershell.wasm`） [4](#2-3) 

### 2. TUI 语法高亮（纯显示用途）

`packages/opencode/parsers-config.ts` 配置了 20+ 种语言的 tree-sitter WASM 解析器，供 `@opentui` TUI 渲染器做终端界面的语法高亮。这与 LLM 交互完全无关。 [5](#2-4) 

---

## LSP 的两个独立用途

### 1. 编辑后自动诊断反馈（核心用途）

每次 LLM 调用 `write`、`edit`、`apply_patch` 工具修改文件后，系统自动：
1. 调用 `LSP.touchFile(file, true)` — 通知 LSP server 文件已变更，并等待诊断结果（最多 3 秒，带 150ms debounce）
2. 调用 `LSP.diagnostics()` — 收集所有 LSP server 的诊断信息
3. 将 severity=1（error 级别）的诊断以 `<diagnostics>` XML 标签格式**追加到工具输出**，直接反馈给 LLM [6](#2-5) [7](#2-6) [8](#2-7) 

`write.ts` 还会额外报告**其他文件**的 LSP 错误（最多 5 个文件），因为修改一个文件可能导致其他文件出现类型错误。

### 2. LLM 主动调用的代码智能工具

`LspTool`（`packages/opencode/src/tool/lsp.ts`）将 LSP 操作直接暴露给 LLM，支持 9 种操作：

| 操作 | LSP 请求 |
|---|---|
| `goToDefinition` | `textDocument/definition` |
| `findReferences` | `textDocument/references` |
| `hover` | `textDocument/hover` |
| `documentSymbol` | `textDocument/documentSymbol` |
| `workspaceSymbol` | `workspace/symbol` |
| `goToImplementation` | `textDocument/implementation` |
| `prepareCallHierarchy` | `textDocument/prepareCallHierarchy` |
| `incomingCalls` / `outgoingCalls` | call hierarchy | [9](#2-8) 

---

## 整体架构图

```
LLM
 ├── bash tool
 │     └── [执行前] tree-sitter AST 解析
 │           → 提取命令/路径 → 请求权限
 │
 ├── write / edit / apply_patch tools
 │     └── [执行后] LSP.touchFile + LSP.diagnostics
 │           → 诊断错误追加到工具输出 → LLM 自动修复
 │
 └── lsp tool
       └── LLM 主动查询定义/引用/符号等

TUI 渲染器
 └── tree-sitter WASM parsers (parsers-config.ts)
       → 语法高亮（与 LLM 无关）
```

**关键结论**：LSP 和 AST 在 OpenCode 中**没有直接交互**。AST 用于 bash 命令的安全分析，LSP 用于代码编辑后的错误反馈和代码智能查询。两者都服务于 LLM，但通过完全不同的路径。 [10](#2-9)

### Citations

**File:** packages/opencode/src/tool/bash.ts (L89-123)
```typescript
function parts(node: Node) {
  const out: Part[] = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child) continue
    if (child.type === "command_elements") {
      for (let j = 0; j < child.childCount; j++) {
        const item = child.child(j)
        if (!item || item.type === "command_argument_sep" || item.type === "redirection") continue
        out.push({ type: item.type, text: item.text })
      }
      continue
    }
    if (
      child.type !== "command_name" &&
      child.type !== "command_name_expr" &&
      child.type !== "word" &&
      child.type !== "string" &&
      child.type !== "raw_string" &&
      child.type !== "concatenation"
    ) {
      continue
    }
    out.push({ type: child.type, text: child.text })
  }
  return out
}

function source(node: Node) {
  return (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim()
}

function commands(node: Node) {
  return node.descendantsOfType("command").filter((child): child is Node => Boolean(child))
}
```

**File:** packages/opencode/src/tool/bash.ts (L241-270)
```typescript
async function collect(root: Node, cwd: string, ps: boolean, shell: string): Promise<Scan> {
  const scan: Scan = {
    dirs: new Set<string>(),
    patterns: new Set<string>(),
    always: new Set<string>(),
  }

  for (const node of commands(root)) {
    const command = parts(node)
    const tokens = command.map((item) => item.text)
    const cmd = ps ? tokens[0]?.toLowerCase() : tokens[0]

    if (cmd && FILES.has(cmd)) {
      for (const arg of pathArgs(command, ps)) {
        const resolved = await argPath(arg, cwd, ps, shell)
        log.info("resolved path", { arg, resolved })
        if (!resolved || Instance.containsPath(resolved)) continue
        const dir = (await Filesystem.isDir(resolved)) ? resolved : path.dirname(resolved)
        scan.dirs.add(dir)
      }
    }

    if (tokens.length && (!cmd || !CWD.has(cmd))) {
      scan.patterns.add(source(node))
      scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
    }
  }

  return scan
}
```

**File:** packages/opencode/src/tool/bash.ts (L277-281)
```typescript
async function parse(command: string, ps: boolean) {
  const tree = await parser().then((p) => (ps ? p.ps : p.bash).parse(command))
  if (!tree) throw new Error("Failed to parse command")
  return tree.rootNode
}
```

**File:** packages/opencode/src/tool/bash.ts (L427-452)
```typescript
const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const { default: psWasm } = await import("tree-sitter-powershell/tree-sitter-powershell.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const psPath = resolveWasm(psWasm)
  const [bashLanguage, psLanguage] = await Promise.all([Language.load(bashPath), Language.load(psPath)])
  const bash = new Parser()
  bash.setLanguage(bashLanguage)
  const ps = new Parser()
  ps.setLanguage(psLanguage)
  return { bash, ps }
})
```

**File:** packages/opencode/parsers-config.ts (L1-22)
```typescript
export default {
  // NOTE: FOR markdown, javascript and typescript, we use the opentui built-in parsers
  // Warn: when taking queries from the nvim-treesitter repo, make sure to include the query dependencies as well
  //       marked with for example `; inherits: ecma` at the top of the file. Just put the dependencies before the actual query.
  //       ALSO: Some queries use breaking changes in the nvim-treesitter repo, that are not compatible with the (web-)tree-sitter parser.
  parsers: [
    {
      filetype: "python",
      wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
      queries: {
        highlights: [
          // NOTE: This nvim-treesitter query is currently broken, because the parser is not compatible with the query apparently.
          //       it is using "except" nodes that the parser is complaining about, but it has been in the query for 3+ years.
          //       Unclear.
          // "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/python/highlights.scm",
          "https://github.com/tree-sitter/tree-sitter-python/raw/refs/heads/master/queries/highlights.scm",
        ],
        locals: [
          "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/python/locals.scm",
        ],
      },
    },
```

**File:** packages/opencode/src/tool/edit.ts (L144-154)
```typescript
    await LSP.touchFile(filePath, true)
    const diagnostics = await LSP.diagnostics()
    const normalizedFilePath = Filesystem.normalizePath(filePath)
    const issues = diagnostics[normalizedFilePath] ?? []
    const errors = issues.filter((item) => item.severity === 1)
    if (errors.length > 0) {
      const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
      const suffix =
        errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
      output += `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filePath}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
    }
```

**File:** packages/opencode/src/tool/write.ts (L54-72)
```typescript
    let output = "Wrote file successfully."
    await LSP.touchFile(filepath, true)
    const diagnostics = await LSP.diagnostics()
    const normalizedFilepath = Filesystem.normalizePath(filepath)
    let projectDiagnosticsCount = 0
    for (const [file, issues] of Object.entries(diagnostics)) {
      const errors = issues.filter((item) => item.severity === 1)
      if (errors.length === 0) continue
      const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
      const suffix =
        errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
      if (file === normalizedFilepath) {
        output += `\n\nLSP errors detected in this file, please fix:\n<diagnostics file="${filepath}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
        continue
      }
      if (projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
      projectDiagnosticsCount++
      output += `\n\nLSP errors detected in other files:\n<diagnostics file="${file}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
    }
```

**File:** packages/opencode/src/tool/apply_patch.ts (L235-267)
```typescript
      const target = change.movePath ?? change.filePath
      await LSP.touchFile(target, true)
    }
    const diagnostics = await LSP.diagnostics()

    // Generate output summary
    const summaryLines = fileChanges.map((change) => {
      if (change.type === "add") {
        return `A ${path.relative(Instance.worktree, change.filePath).replaceAll("\\", "/")}`
      }
      if (change.type === "delete") {
        return `D ${path.relative(Instance.worktree, change.filePath).replaceAll("\\", "/")}`
      }
      const target = change.movePath ?? change.filePath
      return `M ${path.relative(Instance.worktree, target).replaceAll("\\", "/")}`
    })
    let output = `Success. Updated the following files:\n${summaryLines.join("\n")}`

    // Report LSP errors for changed files
    const MAX_DIAGNOSTICS_PER_FILE = 20
    for (const change of fileChanges) {
      if (change.type === "delete") continue
      const target = change.movePath ?? change.filePath
      const normalized = Filesystem.normalizePath(target)
      const issues = diagnostics[normalized] ?? []
      const errors = issues.filter((item) => item.severity === 1)
      if (errors.length > 0) {
        const limited = errors.slice(0, MAX_DIAGNOSTICS_PER_FILE)
        const suffix =
          errors.length > MAX_DIAGNOSTICS_PER_FILE ? `\n... and ${errors.length - MAX_DIAGNOSTICS_PER_FILE} more` : ""
        output += `\n\nLSP errors detected in ${path.relative(Instance.worktree, target).replaceAll("\\", "/")}, please fix:\n<diagnostics file="${target}">\n${limited.map(LSP.Diagnostic.pretty).join("\n")}${suffix}\n</diagnostics>`
      }
    }
```

**File:** packages/opencode/src/tool/lsp.ts (L11-96)
```typescript
const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const

export const LspTool = Tool.define("lsp", {
  description: DESCRIPTION,
  parameters: z.object({
    operation: z.enum(operations).describe("The LSP operation to perform"),
    filePath: z.string().describe("The absolute or relative path to the file"),
    line: z.number().int().min(1).describe("The line number (1-based, as shown in editors)"),
    character: z.number().int().min(1).describe("The character offset (1-based, as shown in editors)"),
  }),
  execute: async (args, ctx) => {
    const file = path.isAbsolute(args.filePath) ? args.filePath : path.join(Instance.directory, args.filePath)
    await assertExternalDirectory(ctx, file)

    await ctx.ask({
      permission: "lsp",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })
    const uri = pathToFileURL(file).href
    const position = {
      file,
      line: args.line - 1,
      character: args.character - 1,
    }

    const relPath = path.relative(Instance.worktree, file)
    const title = `${args.operation} ${relPath}:${args.line}:${args.character}`

    const exists = await Filesystem.exists(file)
    if (!exists) {
      throw new Error(`File not found: ${file}`)
    }

    const available = await LSP.hasClients(file)
    if (!available) {
      throw new Error("No LSP server available for this file type.")
    }

    await LSP.touchFile(file, true)

    const result: unknown[] = await (async () => {
      switch (args.operation) {
        case "goToDefinition":
          return LSP.definition(position)
        case "findReferences":
          return LSP.references(position)
        case "hover":
          return LSP.hover(position)
        case "documentSymbol":
          return LSP.documentSymbol(uri)
        case "workspaceSymbol":
          return LSP.workspaceSymbol("")
        case "goToImplementation":
          return LSP.implementation(position)
        case "prepareCallHierarchy":
          return LSP.prepareCallHierarchy(position)
        case "incomingCalls":
          return LSP.incomingCalls(position)
        case "outgoingCalls":
          return LSP.outgoingCalls(position)
      }
    })()

    const output = (() => {
      if (result.length === 0) return `No results found for ${args.operation}`
      return JSON.stringify(result, null, 2)
    })()

    return {
      title,
      metadata: { result },
      output,
    }
  },
```

**File:** packages/opencode/src/lsp/client.ts (L33-63)
```typescript
  export const Event = {
    Diagnostics: BusEvent.define(
      "lsp.client.diagnostics",
      z.object({
        serverID: z.string(),
        path: z.string(),
      }),
    ),
  }

  export async function create(input: { serverID: string; server: LSPServer.Handle; root: string }) {
    const l = log.clone().tag("serverID", input.serverID)
    l.info("starting client")

    const connection = createMessageConnection(
      new StreamMessageReader(input.server.process.stdout as any),
      new StreamMessageWriter(input.server.process.stdin as any),
    )

    const diagnostics = new Map<string, Diagnostic[]>()
    connection.onNotification("textDocument/publishDiagnostics", (params) => {
      const filePath = Filesystem.normalizePath(fileURLToPath(params.uri))
      l.info("textDocument/publishDiagnostics", {
        path: filePath,
        count: params.diagnostics.length,
      })
      const exists = diagnostics.has(filePath)
      diagnostics.set(filePath, params.diagnostics)
      if (!exists && input.serverID === "typescript") return
      Bus.publish(Event.Diagnostics, { path: filePath, serverID: input.serverID })
    })
```
