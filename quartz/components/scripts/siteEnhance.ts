/**
 * 站点级 DOM 增强，跟 sidebarToggle 一样由 componentResources.ts 注入（afterDOMLoaded）。
 *
 * 两件事，都是纯前端能干的活儿（改的是组件产出的结构，不动内容）：
 *   1. 把正文里的 <table> 包一层 .table-wrap —— 手机上宽表格可以横向滚动，不撑破页面
 *   2. 手机上把右栏的目录复制成正文顶部一个 <details>（右栏在手机上被折到正文下面了，看不到）
 *
 * 每次 SPA 换页都会重新跑一遍，所以都写成幂等的。
 */

export const siteEnhanceAfterDOMLoaded = `
(function () {
  if (window.__awSiteEnhance) return
  window.__awSiteEnhance = true

  var MOBILE = window.matchMedia("(max-width: 799.98px)")

  // ---------- 1. 表格横向滚动 ----------
  function wrapTables() {
    document.querySelectorAll("article table").forEach(function (table) {
      if (table.parentElement && table.parentElement.classList.contains("table-wrap")) return
      var wrap = document.createElement("div")
      wrap.className = "table-wrap"
      table.parentNode.insertBefore(wrap, table)
      wrap.appendChild(table)
    })
  }

  // ---------- 2. 手机上的本页目录 ----------
  function buildMobileToc() {
    var existing = document.querySelector(".mobile-toc")
    var toc = document.querySelector("#quartz-body .sidebar.right .toc")

    if (!MOBILE.matches || !toc) {
      if (existing) existing.remove()
      return
    }
    if (existing) existing.remove()

    var anchor = document.querySelector("#quartz-body .center .content-meta")
    var header = document.querySelector("#quartz-body .center .page-header")
    var host = anchor || header
    if (!host) return

    var details = document.createElement("details")
    details.className = "mobile-toc"

    var summary = document.createElement("summary")
    var count = toc.querySelectorAll("a").length
    summary.textContent = count > 0 ? "本页目录（" + count + " 节）" : "本页目录"
    details.appendChild(summary)

    var clone = toc.cloneNode(true)
    // 去掉克隆里自带的标题和 id，避免和右栏那份重复
    clone.removeAttribute("id")
    clone.querySelectorAll("h1, h2, h3, h4, .toc-title").forEach(function (n) {
      if (n.tagName.toLowerCase() !== "a") n.remove()
    })
    clone.querySelectorAll("[id]").forEach(function (n) { n.removeAttribute("id") })
    details.appendChild(clone)

    host.insertAdjacentElement("afterend", details)
  }

  function run() {
    wrapTables()
    buildMobileToc()
  }

  run()
  document.addEventListener("nav", run)

  // 旋转屏幕 / 拖动窗口大小跨越断点时也要重算（手机上进来、放大后目录就该消失）
  var onChange = function () { buildMobileToc() }
  if (MOBILE.addEventListener) MOBILE.addEventListener("change", onChange)
  else if (MOBILE.addListener) MOBILE.addListener(onChange)
})()
`
