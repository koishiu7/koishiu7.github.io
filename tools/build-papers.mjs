#!/usr/bin/env node
/**
 * build-papers.mjs —— 论文附件处理（docx → PDF 在线预览）
 *
 * 处理顺序（越靠前保真度越高）：
 *   1. 同目录已有同名 PDF  → 直接用它（你在 Word 里「导出为 PDF」放进来即可，最保真）
 *   2. Windows 上的 Microsoft Word（COM 自动化）
 *   3. OnlyOffice Desktop（若已安装）
 *   4. LibreOffice（兜底，GitHub Actions 上用它）
 *
 * 然后统一复制到 content/assets/papers/ 并生成预览页（内嵌阅读 + 下载）。
 *
 * 是否重新转换由 content/assets/papers/manifest.json 里记录的源文件哈希决定：
 *   docx 没改 → 跳过；改了 → 重转。所以在 CI 里也能准确判断，不依赖文件时间。
 *
 * 用法：
 *   node tools/build-papers.mjs              # 本地：有 Word 用 Word，否则 OnlyOffice / LibreOffice
 *   node tools/build-papers.mjs --no-convert # 云端主构建：只出预览页，转换交给 convert-papers workflow
 *   node tools/build-papers.mjs --dry        # 只看会做什么
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import os from "node:os"

import { existingStatus, statusLine } from "./lib/status.mjs"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"

const DRY = process.argv.includes("--dry")
// --no-convert：只处理已有 PDF 并生成预览页，不尝试转换 docx
// （主构建用这个，docx 转换交给独立的 convert-papers workflow）
const NO_CONVERT = process.argv.includes("--no-convert")
// --force：忽略清单，强制重新转换（想用 Word 覆盖云端产出的 PDF 时用）
const FORCE = process.argv.includes("--force")
const CONTENT_DIR = path.resolve(process.env.QUARTZ_CONTENT || "content")
const OUT_DIR = path.join(CONTENT_DIR, "assets", "papers")
// 记录「哪个 docx 的哪一版已经转成 PDF 了」。
// 只靠「PDF 在不在」判断会漏掉「docx 改了内容」这种情况，
// 只靠 mtime 判断在 CI 里又不成立（checkout 会把时间全部刷新）。
const MANIFEST = path.join(OUT_DIR, "manifest.json")
const SKIP_DIRS = new Set(["assets", ".obsidian", ".trash", ".git", "node_modules", "private"])

const stats = { pdf: 0, converted: 0, pages: 0, skipped: 0, failed: 0 }

// ---------------------------------------------------------------- 工具

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf-8"))
  } catch {
    return {}
  }
}

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

/** 与 Quartz 的 slugifyFilePath 对齐：小写、空格转连字符、保留中文 */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_.]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function psQuote(s) {
  return `'${s.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------- 转换器

/** 探测本机可用的转换器，按保真度排序 */
function findConverters() {
  const list = []

  if (process.platform === "win32") {
    const wordPaths = [
      "C:/Program Files/Microsoft Office/root/Office16/WINWORD.EXE",
      "C:/Program Files/Microsoft Office/Office16/WINWORD.EXE",
      "C:/Program Files/Microsoft Office/Office15/WINWORD.EXE",
      "C:/Program Files (x86)/Microsoft Office/Office15/WINWORD.EXE",
      "C:/Program Files (x86)/Microsoft Office/Office14/WINWORD.EXE",
    ]
    if (wordPaths.some((p) => fs.existsSync(p))) list.push("word")

    const ooPaths = [
      "C:/Program Files/ONLYOFFICE/DesktopEditors/DesktopEditors.exe",
      "C:/Program Files (x86)/ONLYOFFICE/DesktopEditors/DesktopEditors.exe",
    ]
    const oo = ooPaths.find((p) => fs.existsSync(p))
    if (oo) list.push("onlyoffice:" + oo)
  }

  const sofficeCandidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/LibreOffice/program/soffice.exe",
          "C:/Program Files (x86)/LibreOffice/program/soffice.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/LibreOffice.app/Contents/MacOS/soffice"]
        : ["/usr/bin/soffice", "/usr/local/bin/soffice"]

  const soffice = sofficeCandidates.find((p) => fs.existsSync(p))
  if (soffice) list.push("libreoffice:" + soffice)
  else if (process.platform !== "win32") {
    const probe = spawnSync("soffice", ["--version"], { encoding: "utf-8" })
    if (probe.status === 0) list.push("libreoffice:soffice")
  }

  return list
}

/** Word COM 导出 PDF */
function convertWithWord(src, dst) {
  const ps = `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open(${psQuote(src)}, $false, $true)
  try { $doc.ExportAsFixedFormat(${psQuote(dst)}, 17) }
  catch { $doc.SaveAs([ref]${psQuote(dst)}, [ref]17) }
  $doc.Close($false)
} finally {
  $word.Quit()
}
`
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { encoding: "utf-8", timeout: 180_000 },
  )
  return r.status === 0 && fs.existsSync(dst)
}

/** LibreOffice 转换 */
function convertWithLibreOffice(bin, src, dst) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qpdf-"))
  const r = spawnSync(
    bin,
    ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", tmp, src],
    { encoding: "utf-8", timeout: 240_000 },
  )
  const base = path.basename(src, path.extname(src))
  const produced = path.join(tmp, `${base}.pdf`)
  if (r.status !== 0 || !fs.existsSync(produced)) {
    fs.rmSync(tmp, { recursive: true, force: true })
    return false
  }
  fs.copyFileSync(produced, dst)
  fs.rmSync(tmp, { recursive: true, force: true })
  return true
}

/** OnlyOffice Desktop 转换（尽力而为，不同版本 CLI 差异较大） */
function convertWithOnlyOffice(bin, src, dst) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qoo-"))
  const r = spawnSync(bin, ["--convert-to", "pdf", "--outdir", tmp, src], {
    encoding: "utf-8",
    timeout: 240_000,
  })
  const base = path.basename(src, path.extname(src))
  const produced = path.join(tmp, `${base}.pdf`)
  if (r.status !== 0 || !fs.existsSync(produced)) {
    fs.rmSync(tmp, { recursive: true, force: true })
    return false
  }
  fs.copyFileSync(produced, dst)
  fs.rmSync(tmp, { recursive: true, force: true })
  return true
}

// ---------------------------------------------------------------- 预览页

function previewMarkdown(title, slug, status) {
  const url = `/assets/papers/${slug}.pdf`
  // 「全屏放大」用内联 onclick，而不是 <script>：
  // SPA 切换页面时插入的 <script> 不会执行，内联事件处理器却能正常工作。
  return `---
title: ${title}
description: 论文 · 在线预览与下载
tags:
  - 论文
${statusLine(status)}paperFile: ${url}
generated: true
---

<div class="pdf-viewer">
  <div class="pdf-toolbar">
    <button type="button" class="pdf-btn" onclick="try{var t=this.closest('.pdf-viewer').querySelector('.pdf-embed');(t.requestFullscreen||t.webkitRequestFullscreen).call(t)}catch(e){}">全屏放大</button>
    <a class="pdf-btn" href="${url}" target="_blank" rel="noopener" data-router-ignore>新标签页打开</a>
    <a class="pdf-btn" href="${url}" download data-router-ignore>下载 PDF</a>
  </div>

  <div class="pdf-embed">
    <iframe src="${url}" title="${title}" loading="lazy"></iframe>
  </div>
</div>
`
}

/** PDF 还没好时先占位，避免这条笔记在站点上凭空消失 */
function pendingMarkdown(title, status) {
  return `---
title: ${title}
description: 论文 · 云端转换中
tags:
  - 论文
${statusLine(status)}generated: true
---

<div class="pdf-pending">
  <p><strong>正在转换</strong></p>
  <p>这份 Word 文档正在云端转成 PDF，通常 1–3 分钟后自动完成，稍后刷新本页即可在线阅读。</p>
</div>
`
}

// ---------------------------------------------------------------- 主流程

function main() {
  console.log("\n────────────────────────────────────────────")
  console.log("  论文附件处理")
  console.log(`  目录: ${CONTENT_DIR}`)
  if (DRY) console.log("  模式: 预览")
  console.log("────────────────────────────────────────────")

  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`✗ 找不到内容目录：${CONTENT_DIR}`)
    process.exit(1)
  }

  const files = walk(CONTENT_DIR).filter((f) => /\.(docx|doc|pdf)$/i.test(f))
  if (files.length === 0) {
    console.log("  没有论文附件，跳过。\n")
    return
  }

  const converters = findConverters()
  const hasWord = converters.includes("word")
  const label = hasWord
    ? "Microsoft Word"
    : converters.find((c) => c.startsWith("onlyoffice"))
      ? "OnlyOffice"
      : converters.find((c) => c.startsWith("libreoffice"))
        ? "LibreOffice"
        : null

  console.log(`  转换器: ${label ?? "无（只发布已有 PDF）"}\n`)

  if (!DRY) fs.mkdirSync(OUT_DIR, { recursive: true })

  // 先登记所有已有 PDF，供 docx 复用
  const pdfBySlug = new Map()
  for (const f of files) {
    if (/\.pdf$/i.test(f)) {
      const base = path.basename(f, path.extname(f))
      pdfBySlug.set(toSlug(base), f)
    }
  }

  const manifest = readManifest()
  let manifestDirty = false

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    const base = path.basename(file, ext)
    const slug = toSlug(base)
    const pdfTarget = path.join(OUT_DIR, `${slug}.pdf`)

    if (ext === ".pdf") {
      if (!DRY) fs.copyFileSync(file, pdfTarget)
      stats.pdf++
      console.log(`  · PDF  ${base}`)
    } else {
      const hash = sha256(file)
      const relSource = path.relative(CONTENT_DIR, file).split(path.sep).join("/")
      // 还没有清单条目、但 PDF 已经在 → 认账（历史产物，不判成「待转换」）
      if (!manifest[slug] && fs.existsSync(pdfTarget)) {
        manifest[slug] = { source: relSource, hash }
        manifestDirty = true
      }
      // 你现在这一版的 docx 是否已经转过
      const upToDate = !FORCE && fs.existsSync(pdfTarget) && manifest[slug]?.hash === hash

      // 同目录已有同名 PDF → 直接用，保真度最高（你想精确控版式时的手动导出）
      const sibling = path.join(path.dirname(file), `${base}.pdf`)
      const existing = FORCE ? null : fs.existsSync(sibling) ? sibling : pdfBySlug.get(slug)

      if (existing) {
        if (!DRY && path.resolve(existing) !== path.resolve(pdfTarget)) {
          fs.copyFileSync(existing, pdfTarget)
        }
        if (manifest[slug]?.hash !== hash) {
          manifest[slug] = { source: relSource, hash }
          manifestDirty = true
        }
        console.log(`  · DOCX ${base} → 复用已有 PDF`)
      } else if (upToDate) {
        // 云端转过、且 docx 没再改动 → 不重复转换（这是构建保持快的关键）
        console.log(`  · DOCX ${base} → 已是最新转换`)
      } else if (NO_CONVERT) {
        // 主构建不等转换：先落一个占位页，PDF 到位后会被自动覆盖
        stats.skipped++
        const why = FORCE
          ? "强制重新转换"
          : fs.existsSync(pdfTarget)
            ? "docx 有改动，待重新转换"
            : "等待云端转换"
        console.log(`  ⏳ DOCX ${base} → ${why}`)
        const pendingPath = path.join(path.dirname(file), `${base}.md`)
        const isGenerated =
          !fs.existsSync(pendingPath) ||
          fs.readFileSync(pendingPath, "utf-8").includes("generated: true")
        if (!DRY && isGenerated) {
          fs.writeFileSync(pendingPath, pendingMarkdown(base, existingStatus(pendingPath)), "utf-8")
          stats.pages++
        }
        continue
      } else if (!label || DRY) {
        stats.skipped++
        console.log(`  ⚠ DOCX ${base} → 未转换（${label ? "预览模式" : "缺转换器"}）`)
        continue
      } else {
        let ok = false
        if (hasWord) ok = convertWithWord(file, pdfTarget)
        if (!ok) {
          const oo = converters.find((c) => c.startsWith("onlyoffice:"))
          if (oo) ok = convertWithOnlyOffice(oo.split(":")[1], file, pdfTarget)
        }
        if (!ok) {
          const lo = converters.find((c) => c.startsWith("libreoffice:"))
          if (lo) ok = convertWithLibreOffice(lo.split(":")[1], file, pdfTarget)
        }
        if (!ok) {
          stats.failed++
          console.log(`  ✗ DOCX ${base} → 转换失败`)
          continue
        }
        stats.converted++
        manifest[slug] = { source: relSource, hash }
        manifestDirty = true
        console.log(`  · DOCX ${base} → ${slug}.pdf（${label}）`)
      }
    }

    // 生成预览页（已有手写笔记则不覆盖）
    const mdPath = path.join(path.dirname(file), `${base}.md`)
    if (fs.existsSync(mdPath)) {
      const existingMd = fs.readFileSync(mdPath, "utf-8")
      if (!existingMd.includes("generated: true")) {
        console.log(`     ↳ 已有同名笔记，跳过生成（${base}.md）`)
        continue
      }
    }
    if (!DRY) fs.writeFileSync(mdPath, previewMarkdown(base, slug, existingStatus(mdPath)), "utf-8")
    stats.pages++
  }

  if (!DRY && manifestDirty) {
    const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
    fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n", "utf-8")
  }

  console.log(
    `\n  ✓ 完成：PDF ${stats.pdf} · 转换 ${stats.converted} · 预览页 ${stats.pages}` +
      (stats.skipped ? ` · 跳过 ${stats.skipped}` : "") +
      (stats.failed ? ` · 失败 ${stats.failed}` : ""),
  )
  console.log("")
}

main()
