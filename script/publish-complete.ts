#!/usr/bin/env bun

import { $ } from "bun"

await $`gh release edit ${process.env.OPENCODE_RELEASE_TAG} --draft=false`

await $`bun install`

await import(`../packages/opencode/script/publish-registries.ts`)
