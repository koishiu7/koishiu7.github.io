/**
 * note-polish —— 笔记排版的收尾工作，三件事：
 *
 * 1) 维护状态徽标：笔记 frontmatter 写一行
 *      status: seed | growing | stable | stale
 *    （也认中文和几个常见别名，见 ALIASES），在正文最前面渲染一段：
 *      <a class="note-status" data-status="growing" href="/状态">● 生长中 · 还在整理，可能变</a>
 *
 * 2) 忠实 md 的排版：笔记常常是「一行一句」写的，而标准 Markdown 会把同一个
 *    段落里的换行折叠掉，句子全糊成一坨。这里把换行还原成 <br>，也就是
 *    Obsidian 里「严格换行」的效果。单篇不想要：respectLineBreaks: false
 *
 * 3) 去掉与页面标题重复的正文一级标题。Obsidian 里习惯在开头再写一个 `# 标题`，
 *    而 Quartz 的 article-title 已经渲染了同一个标题，页面上会重复两遍。
 *    在 markdown 阶段处理，所以目录（TOC）里也不会多出一条。
 *
 * 这是本地插件，靠 quartz.config.yaml 里的 `source: "./plugins/note-polish"` 加载，
 * 构建时会被软链到 .quartz/plugins/ 下（见 quartz/plugins/loader/gitLoader.ts）。
 * 样式在 quartz/styles/custom.scss 的「维护状态徽标」一节。
 */

export const manifest = {
  name: "note-polish",
  displayName: "Note Polish",
  description: "维护状态徽标 + 去掉与标题重复的正文 H1",
  version: "1.0.0",
  category: "transformer",
  defaultOptions: {
    // 没写 status 的页面显示什么：true = 显示「未评估」，false = 什么都不显示
    showUnknown: true,
    // 徽标点进去的状态说明页；置空则不生成链接
    overviewHref: "/状态",
    // 去掉与标题重复的正文 H1
    dropDuplicateH1: true,
    // md 里的换行原样显示（和 Obsidian 的「严格换行」一样）；false = 回到标准 Markdown
    respectLineBreaks: true,
  },
}

/** 状态定义：顺序即总览页里的顺序 */
export const STATUSES = [
  {
    key: "stable",
    label: "已稳定",
    hint: "可以放心读",
    detail: "内容成形，结论和引用都确认过。看到这个可以当正式笔记来用。",
  },
  {
    key: "growing",
    label: "生长中",
    hint: "还在整理，可能变",
    detail: "结构有了、方向清楚，但论证和细节还会改，别直接引用。",
  },
  {
    key: "seed",
    label: "种子",
    hint: "零散记录，别当结论",
    detail: "只是把想法先记下来，可能只有我自己看得懂，随时会重写。",
  },
  {
    key: "stale",
    label: "待复核",
    hint: "可能过时",
    detail: "当时成立，但现在未必；引用前请自己再确认一遍。",
  },
]

const ALIASES = {
  seed: "seed", sprout: "seed", stub: "seed", draft: "seed",
  种子: "seed", 草稿: "seed", 零散: "seed",
  growing: "growing", budding: "growing", growth: "growing", wip: "growing",
  生长: "growing", 生长中: "growing", 成长: "growing", 整理中: "growing",
  stable: "stable", evergreen: "stable", mature: "stable", done: "stable",
  稳定: "stable", 已稳定: "stable", 定稿: "stable", 完成: "stable",
  stale: "stale", outdated: "stale", deprecated: "stale",
  过时: "stale", 待复核: "stale", 需更新: "stale",
}

function normalize(raw) {
  if (raw === undefined || raw === null) return null
  const key = String(raw).trim().toLowerCase()
  if (!key || key === "none" || key === "unknown") return null
  return ALIASES[key] ?? ALIASES[String(raw).trim()] ?? null
}

/** 把 mdast/hast 节点里的文字摊平，用来比较「正文 H1」和「页面标题」 */
function plainText(node) {
  if (!node) return ""
  if (typeof node === "string") return node
  if (Array.isArray(node)) return node.map(plainText).join("")
  if (typeof node.value === "string") return node.value
  if (Array.isArray(node.children)) return node.children.map(plainText).join("")
  return ""
}

/** 比较标题时忽略空白和大小写：`# 洛克：第一性质` == `洛克： 第一性质` */
function compact(text) {
  return String(text ?? "").replace(/\s+/g, "").toLowerCase()
}

// 这些节点里的换行必须有意义（代码要保证原样），不能动
const KEEP_NEWLINES = new Set([
  "code",
  "inlineCode",
  "yaml",
  "html",
  "definition",
  "footnoteDefinition",
])

/** 把文本节点里的换行换成 break 节点；等价于 Obsidian 的「严格换行」 */
function softenBreaks(node) {
  const children = node?.children
  if (!Array.isArray(children)) return

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!child || typeof child !== "object") continue
    if (KEEP_NEWLINES.has(child.type)) continue

    if (child.type === "text" && typeof child.value === "string" && child.value.includes("\n")) {
      const parts = child.value.split("\n")
      const nodes = []
      parts.forEach((part, k) => {
        if (k > 0) nodes.push({ type: "break" })
        if (part !== "") nodes.push({ type: "text", value: part })
      })
      children.splice(i, 1, ...nodes)
      i += nodes.length - 1
      continue
    }

    softenBreaks(child)
  }
}

function text(value, className) {
  return {
    type: "element",
    tagName: "span",
    properties: { className: [className] },
    children: [{ type: "text", value }],
  }
}

function buildNode(key, opts) {
  const def = STATUSES.find((s) => s.key === key)
  const status = def ?? {
    key: "unknown",
    label: opts.unknownLabel ?? "未评估",
    hint: opts.unknownHint ?? "作者还没标状态",
    detail: "这篇还没有标注维护状态，读的时候自己判断。",
  }

  const properties = {
    className: ["note-status"],
    "data-status": status.key,
    title: `${status.label}：${status.detail}`,
  }
  if (opts.overviewHref) properties.href = opts.overviewHref

  return {
    type: "element",
    tagName: opts.overviewHref ? "a" : "span",
    properties,
    children: [
      { type: "element", tagName: "span", properties: { className: ["note-status-dot"] }, children: [] },
      text(status.label, "note-status-label"),
      text("·", "note-status-sep"),
      text(status.hint, "note-status-hint"),
    ],
  }
}

export default function NotePolish(userOpts) {
  const opts = { ...manifest.defaultOptions, ...(userOpts ?? {}) }

  return {
    name: "NotePolish",

    markdownPlugins() {
      const plugins = []

      // --- 忠实 md 的排版：软换行保留成换行 ---
      // 标准 Markdown 会把同一个段落里的换行折叠掉。但笔记常常是「一行一句」写的
      // （Obsidian 里的「严格换行」也是这个效果），折叠之后所有句子糊成一坨，
      // 和写作时看到的完全不一样。这里把换行还原回 <br>。
      // 单篇不想这样：frontmatter 写 `respectLineBreaks: false`
      if (opts.respectLineBreaks) plugins.push(() => (tree, file) => {
        const fm = file.data?.frontmatter ?? {}
        const off = fm.respectLineBreaks === false || fm.breakLines === false
        if (off) return
        softenBreaks(tree)
      })

      // --- 去掉与页面标题重复的正文 H1 ---
      if (opts.dropDuplicateH1) plugins.push(() => (tree, file) => {
        const title = plainText(file.data?.frontmatter?.title).trim()
        if (!title) return
        const first = (tree.children ?? []).find((n) => n.type !== "yaml" && n.type !== "html")
        if (!first || first.type !== "heading" || first.depth !== 1) return
        if (compact(plainText(first)) !== compact(title)) return
        tree.children.splice(tree.children.indexOf(first), 1)
      })

      return plugins
    },

    htmlPlugins() {
      return [
        () => (tree, file) => {
          const fm = file.data?.frontmatter ?? {}
          const key = normalize(fm.status ?? fm.maturity ?? fm.stage ?? fm["状态"])

          // 首页/文件夹索引页是导航，没显式标状态就别占位置
          const slug = String(file.data?.slug ?? "")
          const isIndexPage = slug === "index" || slug === "" || slug.endsWith("/index")
          if (!key && (isIndexPage || !opts.showUnknown)) return

          // 幂等：同一棵树里已经有徽标就不再插
          const has = (tree.children ?? []).some((child) => {
            const cls = child?.properties?.className
            const list = Array.isArray(cls) ? cls : typeof cls === "string" ? cls.split(/\s+/) : []
            return list.includes("note-status")
          })
          if (has) return

          tree.children = tree.children ?? []
          tree.children.unshift(buildNode(key, opts))
        },
      ]
    },
  }
}
