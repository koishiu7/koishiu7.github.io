/**
 * 两侧边栏的折叠开关。
 *
 * 这两段脚本本身不会自动生效，需要在 `quartz/plugins/emitters/componentResources.ts`
 * 的 `addGlobalPageResources()` 里 push 进 beforeDOMLoaded / afterDOMLoaded。
 * 之所以用「导出字符串」而不是 `.inline.ts`，是因为这里不需要打包任何依赖，
 * 纯字符串更容易读懂，也方便单独调试。
 */

/** 在 <head> 里同步执行：先把折叠状态写到 <html>，避免侧栏先展开再收起闪一下。 */
export const sidebarToggleBeforeDOMLoaded = `
try {
  var __l = localStorage.getItem("aw-sidebar-left")
  var __r = localStorage.getItem("aw-sidebar-right")
  if (__l === "collapsed") document.documentElement.setAttribute("data-sidebar-left", "collapsed")
  if (__r === "collapsed") document.documentElement.setAttribute("data-sidebar-right", "collapsed")
} catch (e) {}
`

/** DOM 就绪后：生成贴边的折叠按钮，绑定点击/快捷键，并在 SPA 换页后刷新。 */
export const sidebarToggleAfterDOMLoaded = `
(function () {
  if (window.__awSidebarToggle) return
  window.__awSidebarToggle = true

  var root = document.documentElement
  var KEY = { left: "aw-sidebar-left", right: "aw-sidebar-right" }
  var NAME = { left: "左侧栏", right: "右侧栏" }
  var SHORTCUT = { left: "[", right: "]" }
  var CHEVRON =
    '<svg viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">' +
    '<path d="M6.4 1 L1.6 7 L6.4 13" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>'
  var btns = {}

  function sidebarEl(side) {
    return document.querySelector("#quartz-body .sidebar." + side)
  }

  function isCollapsed(side) {
    return root.getAttribute("data-sidebar-" + side) === "collapsed"
  }

  function setCollapsed(side, collapsed) {
    if (collapsed) root.setAttribute("data-sidebar-" + side, "collapsed")
    else root.removeAttribute("data-sidebar-" + side)
    try {
      localStorage.setItem(KEY[side], collapsed ? "collapsed" : "expanded")
    } catch (e) {}
    sync()
  }

  function ensureBtn(side) {
    var btn = btns[side]
    if (btn && btn.isConnected) return btn
    btn = document.createElement("button")
    btn.type = "button"
    btn.className = "sidebar-toggle"
    btn.setAttribute("data-side", side)
    btn.innerHTML = CHEVRON
    btn.addEventListener("click", function () {
      setCollapsed(side, !isCollapsed(side))
    })
    document.body.appendChild(btn)
    btns[side] = btn
    return btn
  }

  function sync() {
    ["left", "right"].forEach(function (side) {
      var el = sidebarEl(side)
      // 有些页面没有侧栏（404 / 文件夹页 / 手机单列），没有就不显示按钮
      if (!el) {
        if (btns[side]) btns[side].classList.remove("is-visible")
        return
      }
      var btn = ensureBtn(side)
      var collapsed = isCollapsed(side)
      if (!el.id) el.id = "sidebar-" + side
      btn.classList.add("is-visible")
      btn.setAttribute("aria-controls", el.id)
      btn.setAttribute("aria-expanded", String(!collapsed))
      btn.title = (collapsed ? "显示" : "隐藏") + NAME[side] + "（" + SHORTCUT[side] + "）"
      btn.setAttribute("aria-label", btn.title)
    })
  }

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    var t = e.target
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
    if (e.key === "[") {
      if (sidebarEl("left")) setCollapsed("left", !isCollapsed("left"))
      e.preventDefault()
    } else if (e.key === "]") {
      if (sidebarEl("right")) setCollapsed("right", !isCollapsed("right"))
      e.preventDefault()
    }
  })

  sync()
  // SPA 换页后 DOM 重绘，按钮可能被换掉，重新同步一次
  document.addEventListener("nav", sync)
})()
`
