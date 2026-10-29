---
title: Obsidian 与 Quartz 使用指南
status: stable
description: 这套知识库的写作、图片归类、论文引用与发布流程。
tags:
  - 工具
  - 使用说明
---

# Obsidian 与 Quartz 使用指南

这篇既是说明文档，也是各种写法的示例。想抄格式，直接看源码。

## 写作与发布

在 Obsidian 里正常写，写完提交即可：

```bash
git add -A
git commit -m "notes: 今天的笔记"
git push
```

推上去之后 GitHub Actions 会自动做三件事：整理图片、构建站点、发布到 Pages。
大约一两分钟后就能在 <https://koishiu7.github.io> 看到。

> [!note] 也可以在 Obsidian 里全自动
> 装 `Obsidian Git` 插件并开启 `Auto commit-and-sync`（建议间隔 10 分钟），
> 之后连 `git push` 都不用敲，关掉 Obsidian 就已经在路上了。

## 图片：随便粘，发布时自动归类

Obsidian 粘贴图片默认生成 `Pasted image 20261028214219.png` 这种名字，堆在仓库根目录，完全看不出属于哪篇笔记。

现在的规则很简单：**你什么都不用管**。

构建时会自动把它搬运并重命名成：

```
assets/<笔记名>/01.png
assets/<笔记名>/02.png
```

正文里的链接也会同步改写，顺带修好 Obsidian 里偶尔漏掉 `]]` 的破损嵌入。

> [!tip] 为什么按笔记归类而不是按日期
> 因为查找图片时人的第一反应是「那篇文章里的图」，不是「十月二十八号那张图」。
> 按笔记归类，删笔记时整目录一起删，也不会误伤别的文章。

## 论文引用（Zotero）

正文里写 `[@vaswani2017attention]`，就会渲染成引用，文末自动生成参考文献表。例如：注意力机制并不是凭空出现的，它的工程化落地依赖序列建模的长期积累[@hochreiter1997long]，而 Transformer 把它推到了主流[@vaswani2017attention]。

多篇一起引用写成 `[@a; @b]`。

### 和 Zotero 打通

1. Zotero 装 [Better BibTeX](https://retorque.re/zotero-better-bibtex/) 插件
2. 选中要用的文献集合 → 右键 → 导出条目 → 格式选 **Better BibTeX**
3. 勾选 **Keep updated**，保存为仓库根目录的 `bibliography.bib`
4. 之后在 Zotero 里加一篇论文，`bibliography.bib` 会自动更新，提交后站点上的引用就齐了

> [!warning] citekey 会变
> Better BibTeX 默认按「作者+年份+标题词」生成 citekey，改标题可能导致 key 变化。
> 想稳定就在 BBT 设置里把 citation key formula 固定成 `auth.lower + year + shorttitle(3,3)`。

引用样式在 `quartz.config.yaml` 里改 `csl` 字段，默认 `apa`，写工科论文可以换成 `ieee`。

## 索引与检索

站点提供了四条找东西的路，不需要额外维护目录页：

| 方式 | 位置 | 适合什么场景 |
| --- | --- | --- |
| 文件夹树 | 左侧栏 | 知道大概在哪个分区 |
| 全站搜索 | 顶栏搜索框 | 记得关键词，但忘了在哪 |
| 标签页 | 笔记顶部标签 / `/tags/` | 跨目录的主题聚合 |
| 关系图 | 右侧栏 | 顺着双链发现关联笔记 |

> [!note] 标签怎么打
> 在 frontmatter 里写 `tags: [工具, 使用说明]`，或者正文里写 `#工具`。
> 标签别打太细，二级分类交给文件夹，标签只留真正跨领域的主题。

## 评论

每篇笔记底部是 giscus 评论区，基于 GitHub Discussions。第一次使用需要在仓库设置里开启 Discussions 并装 giscus App，具体见仓库 README 的「启用评论」一节。

## 草稿与私密笔记

- frontmatter 写 `draft: true` → 不发布
- 放进 `private/` 目录 → 不发布（已在 `ignorePatterns` 里）

---

相关：[[首页]]
