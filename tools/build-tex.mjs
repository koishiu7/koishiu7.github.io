#!/usr/bin/env node
/**
 * build-tex.mjs —— LaTeX 笔记 → 可阅读、可检索的 Markdown 页面
 *
 * 你照旧在 Overleaf / 本地写 .tex，同步进 content/ 后：
 *   1. 原样发布 .tex（Quartz 会把非 .md 文件都当静态资源拷过去，可直接下载）
 *   2. 这里再生成一份同名 .md：章节变标题、自定义宏变引用块，正文变成能搜到的文字
 *
 * 目前识别：
 *   \section / \subsection / \subsubsection   →  ## / ### / ####
 *   \eng{...}  → 引用块「原文」
 *   \cn{...}   → 引用块「译文」
 *   \cmt{...}  → 引用块「注释」
 * 其余命令（\textbf、\emph、\%、---、``…'' 等）会转成对应的 Markdown/标点。
 *
 * 用法：
 *   node tools/build-tex.mjs          # 生成
 *   node tools/build-tex.mjs --dry    # 只看会做什么
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"

import { existingStatus, statusLine } from "./lib/status.mjs"

const DRY = process.argv.includes("--dry")
const CONTENT_DIR = path.resolve(process.env.QUARTZ_CONTENT || "content")
const SKIP_DIRS = new Set(["assets", ".obsidian", ".trash", ".git", "node_modules", "private"])

// 自定义宏 → 引用块前缀。想加你自己的宏，往这里补一行即可。
const MACRO_LABEL = {
  eng: "原文",
  cn: "译文",
  cmt: "注释",
}

const stats = { tex: 0, pages: 0, skipped: 0 }

// ---------------------------------------------------------------- 工具

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** 从 '{' 开始读一个带花括号的参数，正确跳过嵌套与转义 */
function readArg(src, i) {
  if (src[i] !== "{") return null
  let depth = 0
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (c === "\\") {
      j++
      continue
    }
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return { arg: src.slice(i + 1, j), end: j + 1 }
    }
  }
  return null
}

/** LaTeX 片段 → Markdown 片段（递归处理命令参数） */
function clean(s) {
  let out = ""
  let i = 0
  while (i < s.length) {
    const c = s[i]

    if (c === "\\") {
      const m = /^\\([a-zA-Z]+)\s*/.exec(s.slice(i))
      if (!m) {
        // 转义字符
        const next = s[i + 1]
        if (next === "\\") {
          out += "\n"
          i += 2
          // \\ 后面可能跟 \\ [6pt] 这样的间距参数，一并吃掉
          if (s[i] === "[") {
            const close = s.indexOf("]", i)
            i = close === -1 ? s.length : close + 1
          }
        } else if (next && "&%$#_{}".includes(next)) {
          out += next
          i += 2
        } else if (next === " ") {
          out += " "
          i += 2
        } else {
          out += next ?? ""
          i += 2
        }
        continue
      }

      const name = m[1]
      i += m[0].length
      let arg = null
      if (s[i] === "{") {
        const r = readArg(s, i)
        if (r) {
          arg = clean(r.arg)
          i = r.end
        }
      }

      switch (name) {
        case "textbf":
          out += `**${arg ?? ""}**`
          break
        case "emph":
        case "textit":
          out += `*${arg ?? ""}*`
          break
        case "underline":
        case "noindent":
        case "large":
        case "Large":
        case "small":
        case "centering":
          out += arg ?? ""
          break
        case "quad":
        case "qquad":
        case "newline":
        case "par":
        case "medskip":
        case "bigskip":
          out += " "
          break
        case "item":
          out += "\n- "
          break
        case "ldots":
          out += "…"
          break
        case "cite":
        case "citep":
        case "citet":
        case "ref":
        case "label":
        case "footnote":
        case "maketitle":
        case "tableofcontents":
        case "newpage":
        case "clearpage":
          break
        default:
          out += arg ?? ""
      }
      continue
    }

    if (c === "~") {
      out += " "
      i++
      continue
    }
    if (s.startsWith("---", i)) {
      out += "—"
      i += 3
      continue
    }
    if (s.startsWith("--", i)) {
      out += "–"
      i += 2
      continue
    }
    if (s.startsWith("``", i)) {
      out += "“"
      i += 2
      continue
    }
    if (s.startsWith("''", i)) {
      out += "”"
      i += 2
      continue
    }
    if (c === "%") {
      const nl = s.indexOf("\n", i)
      i = nl === -1 ? s.length : nl
      continue
    }
    if (c === "{" || c === "}") {
      i++
      continue
    }

    out += c
    i++
  }
  return out.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()
}

/** 把正文转成 Markdown */
function convert(body) {
  const blocks = []
  let i = 0
  const re = /\\(section|subsection|subsubsection|eng|cn|cmt)\s*\{/

  while (i < body.length) {
    const m = re.exec(body.slice(i))
    if (!m) break
    const braceAt = i + m.index + m[0].length - 1
    const r = readArg(body, braceAt)
    if (!r) break

    const kind = m[1]
    const text = clean(r.arg)

    if (kind === "section") blocks.push(`## ${text}`)
    else if (kind === "subsection") blocks.push(`### ${text}`)
    else if (kind === "subsubsection") blocks.push(`#### ${text}`)
    else {
      // 每一行都要带 >，否则换行之后的内容会掉出引用块
      const quoted = text.split("\n").join("\n> ")
      blocks.push(`> **${MACRO_LABEL[kind]}**　${quoted}`)
    }

    i = r.end
  }

  return blocks.join("\n\n")
}

function pageMarkdown(title, description, sourceUrl, body, status) {
  return `---
title: ${title}
description: ${description}
tags:
  - 笔记
  - LaTeX
${statusLine(status)}generated: true
---

<p class="tex-source"><a class="pdf-btn" href="${sourceUrl}" download data-router-ignore>下载 LaTeX 源码</a></p>

${body}
`
}

// ---------------------------------------------------------------- 主流程

function main() {
  console.log("\n────────────────────────────────────────────")
  console.log("  LaTeX 笔记处理")
  console.log(`  目录: ${CONTENT_DIR}`)
  if (DRY) console.log("  模式: 预览")
  console.log("────────────────────────────────────────────")

  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`✗ 找不到内容目录：${CONTENT_DIR}`)
    process.exit(1)
  }

  const files = walk(CONTENT_DIR).filter((f) => /\.tex$/i.test(f))
  if (files.length === 0) {
    console.log("  没有 .tex 笔记，跳过。\n")
    return
  }

  for (const file of files) {
    stats.tex++
    const base = path.basename(file, ".tex")
    const src = fs.readFileSync(file, "utf-8")

    // 标题：\title{...}
    const tIdx = src.indexOf("\\title")
    let title = base
    let description = "LaTeX 笔记"
    if (tIdx !== -1) {
      const brace = src.indexOf("{", tIdx)
      const r = brace !== -1 ? readArg(src, brace) : null
      if (r) {
        const cleaned = clean(r.arg)
        const [first, ...rest] = cleaned.split("\n").map((l) => l.trim()).filter(Boolean)
        title = (first ?? base).replace(/\*\*/g, "").trim() || base
        if (rest.length) description = rest.join(" · ").replace(/\*\*/g, "").trim()
      }
    }

    // 正文：\begin{document} 之后
    const dIdx = src.indexOf("\\begin{document}")
    const body = dIdx === -1 ? src : src.slice(dIdx + "\\begin{document}".length)
    const md = convert(body)

    if (!md.trim()) {
      stats.skipped++
      console.log(`  ⚠ ${base}.tex → 没识别到可转换内容，跳过`)
      continue
    }

    const mdPath = path.join(path.dirname(file), `${base}.md`)
    if (fs.existsSync(mdPath)) {
      const existing = fs.readFileSync(mdPath, "utf-8")
      if (!existing.includes("generated: true")) {
        console.log(`  · ${base}.tex → 已有手写笔记，跳过生成`)
        continue
      }
    }

    const relSource = path.relative(CONTENT_DIR, file).split(path.sep).join("/")
    if (!DRY) {
      fs.writeFileSync(
        mdPath,
        pageMarkdown(title, description, `/${relSource}`, md, existingStatus(mdPath)),
        "utf-8",
      )
    }
    stats.pages++
    console.log(`  · ${base}.tex → ${title}`)
  }

  console.log(
    `\n  ✓ 完成：TeX ${stats.tex} · 生成页面 ${stats.pages}` +
      (stats.skipped ? ` · 跳过 ${stats.skipped}` : ""),
  )
  console.log("")
}

main()
