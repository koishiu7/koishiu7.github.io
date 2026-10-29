#!/usr/bin/env node
/**
 * sync-vault.mjs —— Obsidian → Quartz 一键同步 + 图片自动归类
 *
 * 解决的核心问题：
 *   Obsidian 里粘贴的图片堆在仓库根目录（Pasted image 20261028xxxx.png），
 *   分不清属于哪篇笔记。本脚本在同步时把它们搬运并重命名为
 *   assets/<笔记名>/01.png，同时自动改写 .md 里的链接。
 *   Obsidian 里照旧随便粘，发布时才整理。
 *
 * 用法：
 *   node tools/sync-vault.mjs                    # 从默认/环境变量指定的 Vault 同步到 content/
 *   node tools/sync-vault.mjs "D:/path/to/vault"  # 指定源目录
 *   node tools/sync-vault.mjs --inplace          # 只整理 content/ 自身（CI 用）
 *   node tools/sync-vault.mjs --dry              # 只预览，不写文件
 *
 * 环境变量：
 *   OBSIDIAN_VAULT   源 Vault 路径
 *   QUARTZ_CONTENT   目标 content 目录（默认 ./content）
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const args = process.argv.slice(2)
const DRY = args.includes("--dry")
const INPLACE = args.includes("--inplace")

const CONTENT_DIR = path.resolve(
  process.env.QUARTZ_CONTENT || path.join(process.cwd(), "content"),
)
const DEFAULT_VAULT = "D:/MarshallWaters/d4/obsdian/Obsidian Vault"
const SRC_DIR = INPLACE
  ? CONTENT_DIR
  : path.resolve(
      args.find((a) => !a.startsWith("--")) ||
        process.env.OBSIDIAN_VAULT ||
        DEFAULT_VAULT,
    )

const SKIP_DIRS = new Set([
  ".obsidian",
  ".git",
  ".trash",
  ".quartz",
  "node_modules",
  ".github",
  "private",
  "templates",
])
const MD_RE = /\.md$/i
const ASSET_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif",
  ".pdf", ".mp4", ".webm", ".mp3", ".wav", ".m4a",
])

const stats = { md: 0, images: 0, fixed: 0, missing: 0, frontmatter: 0 }

// ---------------------------------------------------------------- 工具函数

/** 把笔记名变成安全的目录名 */
function slugify(name) {
  return (
    name
      .replace(/\.[^.]+$/, "") // 去扩展名
      .replace(/[\\/:*?"<>|#^[\]]/g, "-") // 非法字符
      .replace(/\s+/g, " ")
      .trim() || "untitled"
  )
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
    }
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

/** 扫描源目录所有资源文件，建立 basename → 绝对路径 索引 */
function buildAssetIndex(root) {
  const index = new Map()
  for (const file of walk(root)) {
    const ext = path.extname(file).toLowerCase()
    if (!ASSET_EXT.has(ext)) continue
    const base = path.basename(file).toLowerCase()
    if (!index.has(base)) index.set(base, file)
    // 同时索引「相对路径」写法，例如 png/xxx.png
    const rel = path.relative(root, file).split(path.sep).join("/").toLowerCase()
    index.set(rel, file)
  }
  return index
}

function ensureDir(p) {
  if (!DRY) fs.mkdirSync(p, { recursive: true })
}

/** 目标资源是否已存在且内容一致 */
function sameFile(a, b) {
  try {
    return fs.statSync(a).size === fs.statSync(b).size
  } catch {
    return false
  }
}

// ---------------------------------------------------------- 图片链接处理

/**
 * 处理单个 .md 的内容：
 *  - 找出所有图片引用（wikilink 与 markdown 两种写法，含 Obsidian 未闭合的破损写法）
 *  - 复制到 assets/<笔记名>/NN.ext
 *  - 把链接改写成 ![[assets/<笔记名>/NN.ext]]
 */
function processMarkdown(content, noteName, srcFile, assetIndex, assetDir) {
  const counters = new Map()
  let out = content

  // 0) 先做「预修复」：把 Obsidian 里常见未闭合的嵌入补齐 ]]，
  //    这样后面的编号才能严格按文中出现的先后顺序排列。
  out = out
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/!?\[\[([^[\]]+?)\s*$/)
      if (!m) return line
      stats.fixed++
      return `${line}]]`
    })
    .join("\n")

  const resolveTarget = (raw) => {
    const clean = raw.trim().replace(/^!?\[\[|\]\]$/g, "")
    // 支持 ![[a.png|300]] 里的尺寸参数
    const [target, ...rest] = clean.split("|")
    return { target: target.trim(), suffix: rest.length ? `|${rest.join("|")}` : "" }
  }

  const rewrite = (raw) => {
    const { target, suffix } = resolveTarget(raw)
    if (!target) return raw

    // 已经是整理过的 assets/ 路径 → 原样保留（保证幂等）
    const normalized = target.replace(/^\.?\//, "")
    if (normalized.startsWith("assets/")) return `![[${normalized}${suffix}]]`

    const ext = path.extname(target).toLowerCase()
    if (!ASSET_EXT.has(ext)) return raw // 不是图片嵌入（可能是 ![[笔记名]] 嵌入）

    const srcPath =
      assetIndex.get(target.toLowerCase()) ||
      assetIndex.get(path.basename(target).toLowerCase()) ||
      (fs.existsSync(path.join(path.dirname(srcFile), target))
        ? path.join(path.dirname(srcFile), target)
        : null)

    if (!srcPath) {
      stats.missing++
      console.warn(`   ⚠ 找不到图片：${target}（来自 ${noteName}）`)
      return raw
    }

    const n = (counters.get(ext) || 0) + 1
    counters.set(ext, n)
    const newName = `${String(n).padStart(2, "0")}${ext}`
    const relAssetPath = `assets/${noteName}/${newName}`
    const destAbs = path.join(assetDir, newName)

    ensureDir(path.dirname(destAbs))
    if (!fs.existsSync(destAbs) || !sameFile(srcPath, destAbs)) {
      if (!DRY) fs.copyFileSync(srcPath, destAbs)
      stats.images++
    }
    return `![[${relAssetPath}${suffix}]]`
  }

  // 1) 标准 wikilink 图片  ![[xxx.png]] / ![[xxx.png|300]]
  out = out.replace(/!\[\[([^[\]\n]+?)\]\]/g, (m, inner) => {
    const ext = path.extname(inner.split("|")[0].trim()).toLowerCase()
    if (!ASSET_EXT.has(ext)) return m
    return rewrite(m)
  })

  // 2) markdown 图片  ![alt](xxx.png)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, alt, url) => {
    const ext = path.extname(url.split("?")[0]).toLowerCase()
    if (!ASSET_EXT.has(ext)) return m
    if (/^https?:\/\//i.test(url)) return m // 外链不动
    const result = rewrite(`![[${decodeURIComponent(url)}]]`)
    return result === `![[${decodeURIComponent(url)}]]` ? m : result
  })

  // 3) 兜底：极少数多段破损链接补齐后仍有残留，这里再补一次 ]]
  out = out.replace(/\[\[([^[\]\n]+)$/gm, (m, inner) =>
    inner.trim() ? `[[${inner.trim()}]]` : m,
  )

  // 4) 顺手修补 [[ 未闭合的普通双链
  out = out.replace(/\[\[([^[\]\n]+)$/gm, (m, inner) => (inner.trim() ? `[[${inner.trim()}]]` : m))

  return out
}

/** 没有 frontmatter 时补一个 title，让站点标题稳定 */
function ensureFrontmatter(content, title) {
  if (/^---\r?\n/.test(content.trimStart())) return content
  stats.frontmatter++
  return `---\ntitle: ${title}\n---\n\n${content}`
}

// ---------------------------------------------------------------- 主流程

function main() {
  console.log("────────────────────────────────────────────")
  console.log("  Obsidian → Quartz 同步")
  console.log(`  源:   ${SRC_DIR}${INPLACE ? "  (原地整理)" : ""}`)
  console.log(`  目标: ${CONTENT_DIR}`)
  if (DRY) console.log("  模式: 预览（不写文件）")
  console.log("────────────────────────────────────────────")

  if (!fs.existsSync(SRC_DIR)) {
    console.error(`\n✗ 源目录不存在：${SRC_DIR}`)
    console.error("  用 OBSIDIAN_VAULT 环境变量或命令行参数指定你的 Vault 路径。")
    process.exit(1)
  }
  ensureDir(CONTENT_DIR)

  const assetIndex = buildAssetIndex(SRC_DIR)
  // 跳过 Obsidian 自动生成的空文件（未命名 / Untitled），它们没有内容却会污染索引
  const isJunk = (f) => /^(未命名|Untitled)/i.test(path.basename(f))
  const mdFiles = walk(SRC_DIR).filter((f) => MD_RE.test(f) && !isJunk(f))
  // .base / .canvas 直接搬运；论文类附件（docx/pdf/pptx…）也原样带过去，
  // 交给 build-papers.mjs 转换与生成预览页
  const EXTRA_RE = /\.(base|canvas|docx|doc|pdf|pptx|ppt|xlsx|zip)$/i
  const extraFiles = walk(SRC_DIR).filter((f) => EXTRA_RE.test(f) && !isJunk(f))

  for (const file of mdFiles) {
    const rel = path.relative(SRC_DIR, file)
    const destRel = rel
    const destAbs = path.join(CONTENT_DIR, destRel)
    const noteName = slugify(path.basename(file))
    const assetDir = path.join(CONTENT_DIR, "assets", noteName)

    let content = fs.readFileSync(file, "utf-8")
    content = processMarkdown(content, noteName, file, assetIndex, assetDir)
    content = ensureFrontmatter(content, path.basename(file).replace(/\.md$/i, ""))

    ensureDir(path.dirname(destAbs))
    if (!DRY) fs.writeFileSync(destAbs, content, "utf-8")
    stats.md++
  }

  for (const file of extraFiles) {
    const destAbs = path.join(CONTENT_DIR, path.relative(SRC_DIR, file))
    ensureDir(path.dirname(destAbs))
    if (!DRY) fs.copyFileSync(file, destAbs)
  }

  console.log(`\n✓ 完成`)
  console.log(`  笔记同步:   ${stats.md} 篇`)
  console.log(`  图片归类:   ${stats.images} 张 → assets/<笔记名>/`)
  console.log(`  修复链接:   ${stats.fixed} 处`)
  console.log(`  补全标题:   ${stats.frontmatter} 篇`)
  if (stats.missing) console.log(`  ⚠ 缺失图片: ${stats.missing} 处（已在上方列出）`)
  console.log("")
}

main()
