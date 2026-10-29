/**
 * 生成 /状态 页面：把 content 里所有笔记按维护状态分组列出来。
 *
 * 数据来源就是每篇笔记 frontmatter 的 status（和 plugins/note-polish 用同一套词表）。
 * 产物写进 content/状态.md —— 每次构建覆盖，别手改；但也别 gitignore，
 * 否则 Quartz 扫内容时会跳过它，页面就发不出去。
 * 首页和各目录的 index.md 是导航页，不计入。
 *
 *   node tools/build-status.mjs
 */

import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"

import { normalizeStatus } from "./lib/status.mjs"

const CONTENT = "content"
const OUT = path.join(CONTENT, "状态.md")
const SKIP_DIRS = new Set(["assets", "private", "templates", ".obsidian", ".trash", "node_modules"])

const GROUPS = [
  { key: "stable", label: "已稳定", desc: "内容成形，可以放心读和引用" },
  { key: "growing", label: "生长中", desc: "整理过一轮，结构还会变" },
  { key: "seed", label: "种子", desc: "零散记录，先别当结论" },
  { key: "stale", label: "待复核", desc: "当时成立，现在未必" },
  { key: "unknown", label: "未评估", desc: "还没标状态" },
]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith(".md")) out.push(full)
  }
  return out
}

function readNote(file) {
  const raw = fs.readFileSync(file, "utf8")
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  let fm = {}
  if (match) {
    try {
      fm = YAML.parse(match[1]) ?? {}
    } catch {
      fm = {}
    }
  }
  const body = match ? raw.slice(match[0].length) : raw
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const slug = path
    .relative(CONTENT, file)
    .replace(/\\/g, "/")
    .replace(/\.md$/, "")
    .replace(/(^|\/)index$/, "")
  return {
    file,
    slug,
    title: (fm.title ?? h1 ?? path.basename(file, ".md")).toString().trim(),
    status: normalizeStatus(fm.status ?? fm.maturity ?? fm.stage ?? fm["状态"]),
    modified: fm.modified ?? fm.updated ?? fm.date ?? null,
    draft: fm.draft === true,
  }
}

const notes = walk(CONTENT)
  .filter((f) => path.resolve(f) !== path.resolve(OUT))
  .filter((f) => path.basename(f, ".md").toLowerCase() !== "index") // 首页 / 目录页是导航，不算笔记
  .map(readNote)
  .filter((n) => !n.draft)

const groups = new Map(GROUPS.map((g) => [g.key, []]))
for (const note of notes) groups.get(note.status ?? "unknown").push(note)
for (const list of groups.values()) {
  list.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"))
}

const link = (note) =>
  `- [${note.title}](${encodeURI(note.slug === "" ? "/" : `/${note.slug}`)})${
    note.modified ? `：更新于 ${String(note.modified).slice(0, 10)}` : ""
  }`

const lines = []
lines.push("---")
lines.push("title: 笔记状态总览")
lines.push("description: 这个站点里每篇笔记的维护状态：哪些已经稳定、哪些还在长、哪些只是种子")
lines.push("status: stable")
lines.push("tags:")
lines.push("  - 说明")
lines.push("---")
lines.push("")
lines.push("每篇笔记开头都有一个状态徽标，表示我把它整理到什么程度了。看到「种子」就别当结论看，看到「已稳定」可以放心引用。")
lines.push("")
lines.push("| 状态 | 含义 | 篇数 |")
lines.push("| --- | --- | --- |")
for (const g of GROUPS) {
  lines.push(`| ${g.label} | ${g.desc} | ${groups.get(g.key).length} |`)
}
lines.push("")

for (const g of GROUPS) {
  const list = groups.get(g.key)
  if (list.length === 0) continue
  lines.push(`## ${g.label}（${list.length}）`)
  lines.push("")
  lines.push(g.desc + "。")
  lines.push("")
  for (const note of list) lines.push(link(note))
  lines.push("")
}

const body = lines.join("\n")
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : ""
if (prev !== body) {
  fs.writeFileSync(OUT, body, "utf8")
  const total = notes.length
  const counts = GROUPS.map((g) => `${g.label} ${groups.get(g.key).length}`).join(" / ")
  console.log(`状态页已更新：${total} 篇（${counts}）`)
} else {
  console.log("状态页无变化")
}
