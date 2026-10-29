/**
 * 笔记维护状态：一份词表，给构建脚本共用。
 *
 * 站点上显示的徽标由 quartz 插件 plugins/note-polish 渲染，它有自己的一份
 * ALIASES（插件被软链进 .quartz/plugins，不能再往外 import），改词表时两边都要改。
 */

import fs from "node:fs"

export const STATUS_ALIASES = {
  seed: "seed",
  sprout: "seed",
  stub: "seed",
  draft: "seed",
  种子: "seed",
  草稿: "seed",
  零散: "seed",

  growing: "growing",
  budding: "growing",
  growth: "growing",
  wip: "growing",
  生长: "growing",
  生长中: "growing",
  成长: "growing",
  整理中: "growing",

  stable: "stable",
  evergreen: "stable",
  mature: "stable",
  done: "stable",
  稳定: "stable",
  已稳定: "stable",
  定稿: "stable",
  完成: "stable",

  stale: "stale",
  outdated: "stale",
  deprecated: "stale",
  过时: "stale",
  待复核: "stale",
  需更新: "stale",
}

/** 把 frontmatter 里写的各种写法归一到 seed / growing / stable / stale，认不出就 null */
export function normalizeStatus(raw) {
  if (raw === undefined || raw === null) return null
  const text = String(raw).trim()
  const key = text.toLowerCase()
  if (!key || key === "none" || key === "unknown") return null
  return STATUS_ALIASES[key] ?? STATUS_ALIASES[text] ?? null
}

export const STATUS_FIELDS = ["status", "maturity", "stage", "状态"]

/** 读一个已有 .md 的 frontmatter，取出手写的状态（自动重写的页面要用它续命） */
export function existingStatus(mdPath) {
  try {
    const raw = fs.readFileSync(mdPath, "utf-8")
    const fm = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/)
    if (!fm) return null
    const field = STATUS_FIELDS.join("|")
    const hit = fm[1].match(
      new RegExp(`^[ \\t]*(?:${field})[ \\t]*:[ \\t]*["']?([^"'\\n]+?)["']?[ \\t]*$`, "m"),
    )
    return hit ? hit[1].trim() : null
  } catch {
    return null
  }
}

/** 生成 frontmatter 时插一行；没有状态就什么都不输出 */
export function statusLine(status) {
  return status ? `status: ${status}\n` : ""
}
