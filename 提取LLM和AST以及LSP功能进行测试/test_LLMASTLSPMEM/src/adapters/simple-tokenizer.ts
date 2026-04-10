/**
 * 简单分词器适配器
 * 实现Tokenizer接口
 */

import type { Tokenizer } from "../domain/memory"

export class SimpleTokenizer implements Tokenizer {
  countTokens(text: string): number {
    // 简单的分词估算：按空格和标点分割
    // 实际项目中可以使用更精确的算法（如tiktoken）
    const tokens = text
      .replace(/[.,!?;:"'(){}[\]]/g, " $& ")
      .split(/\s+/)
      .filter(t => t.length > 0)
    return tokens.length
  }
}

export class CharTokenizer implements Tokenizer {
  countTokens(text: string): number {
    // 按字符数估算（中文场景更适用）
    return Math.ceil(text.length / 4)
  }
}
