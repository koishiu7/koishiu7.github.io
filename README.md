# Koishiu 的知识库

Obsidian 写作 + Quartz 发布的个人知识 Wiki。风格参考 [ArchWiki](https://wiki.archlinux.org/)：信息密度优先，结构清晰。

线上地址：<https://koishiu7.github.io>

---

## 它解决了什么

| 问题 | 处理方式 |
| --- | --- |
| Obsidian 里图片全堆在一个文件夹，分不清属于哪篇 | 构建时自动搬运为 `assets/<笔记名>/01.png` 并改写链接 |
| 想发布却要手动复制、改路径、修链接 | 提交即触发 GitHub Actions，自动构建部署 |
| 论文引用要手动敲参考文献 | Zotero + Better BibTeX 导出 `.bib`，正文写 `[@citekey]` 自动生成 |
| 笔记多了找不到 | 文件夹树 + 全站搜索 + 标签页 + 关系图，四条路 |
| 想让人留言 | 每篇底部 giscus 评论区（GitHub Discussions） |

---

## 只维护一个仓库

`content/` 就是 Obsidian Vault。你在这个文件夹里写笔记，提交即发布。
不需要第二个笔记仓库，本地也不需要装 Node。

### 换一台电脑要配什么

只要 git，不要别的：

1. 装 git 和 Obsidian
2. `git clone https://github.com/koishiu7/koishiu7.github.io.git`
3. Obsidian → 打开文件夹 → 选 `content/`
4. 装 Obsidian Git 插件，开 `Auto commit-and-sync`

图片归类、Word 转 PDF、构建、部署全跑在 GitHub Actions 上，本地一个依赖都不用装，
也不用装 Word / LibreOffice。
只有想本地预览时才需要 Node（可选）：`npm install && npm run preview`。

---

## 那个 Liquid 报错是什么

如果 Actions 里看到 `pages build and deployment` 失败，报
`Liquid syntax error ... in docs/plugins/CustomOgImages.md`，不用担心，**它和你的站点无关**。

那是 GitHub 内置的 Jekyll 构建在扫描仓库里的所有 Markdown，撞上了 Quartz 官方文档里的 `{{ }}` 语法。
你的站点是 GitHub Actions 部署的，不受影响。

要彻底关掉它：

**Settings → Pages → Build and deployment → Source → 选 GitHub Actions**

切换后这个 workflow 就不会再触发。

> ⚠️ 别为了消掉这个报错去删 `docs/` 目录。Jekyll 一旦构建成功，会把 Jekyll 版站点覆盖掉你 Actions 部署的 Quartz 站点 —— 它现在报错反而是一种保护。

---

## 日常使用

### 写作 → 发布

笔记写在 `content/` 目录里。Obsidian 直接把 **`content/` 文件夹作为 Vault 打开**即可。

```bash
npm run sync      # 可选：从外部 Vault 同步笔记进来（见下）
npm run preview   # 本地预览 http://localhost:8080
git add -A && git commit -m "notes: ..." && git push
```

推送后 GitHub Actions 自动完成：图片归类 → 构建 → 发布。约 1–2 分钟后上线。

### 全自动（推荐）

在 Obsidian 里装 **Obsidian Git** 插件，设置 `Auto commit-and-sync interval` 为 10 分钟。
之后只要在关掉 Obsidian 前它会自动推上去，你完全不用碰命令行。

### 如果你把笔记放在别处

脚本支持从任意 Vault 同步进 `content/`，原文件不会被改动：

```bash
# 指定源目录
node tools/sync-vault.mjs "D:/path/to/your/vault"

# 或设成环境变量，之后直接 npm run sync
export OBSIDIAN_VAULT="D:/path/to/your/vault"
```

---

## 图片为什么会自动归类

在 Obsidian 里粘贴图片，默认生成 `Pasted image 20261028214219.png`，堆在仓库根目录。
你不必改变习惯，构建时会做三件事：

1. 把图片复制到 `assets/<笔记名>/01.png`、`02.png`……
2. 把正文里的 `![[Pasted image xxx.png]]` 改写成 `![[assets/<笔记名>/01.png]]`
3. 顺手修掉 Obsidian 里漏写 `]]` 的破损嵌入

编号严格按文中出现顺序排列。整理结果写在 `content/`，你的 Obsidian 原文件保持原样。

> 想按日期归类、或改成 `<笔记名>-01.png` 这种扁平命名，改 `tools/sync-vault.mjs` 里的 `rewrite()` 函数即可。

---

## 论文：PDF 与 Word 怎么发

把 `.pdf` 或 `.docx` 丢进 `小论文/`，同步、提交，剩下的事全在云端完成，你本地不用装任何转换工具。

站点上每份论文都有独立页面：内嵌阅读器 + 下载链接。

### 两条流水线，互不阻塞

| 工作流 | 触发条件 | 做什么 | 耗时 |
| --- | --- | --- | --- |
| `convert-papers.yml` | 推送里含 `.docx` / `.doc` | 装 LibreOffice，转 PDF，把结果提交回 `content/assets/papers/` | 2–4 分钟 |
| `deploy.yml` | `content/**` 等有改动 | 只搬运已有 PDF、生成预览页、构建发布 | 1–2 分钟 |

关键点：**发布流程从不转换文档**（`build-papers.mjs --no-convert`），所以装 LibreOffice、跑 Word 转换再慢，也拖不到站点构建。

### 推一份 Word 论文会发生什么

1. 你的 docx 先被发布一次，页面上显示「正在转换」的占位提示 —— 笔记不会凭空消失
2. 转换工作流同时跑完，把 PDF 提交回仓库
3. 这次提交又触发一次发布，几十秒后刷新页面，PDF 就能直接在线看了

全程约 3–5 分钟，你只做了一次 `git push`。

### 想要 Word 的精确排版

LibreOffice 偶尔会把复杂版式（公式、特殊字体、分栏）排得和 Word 不太一样。若在意：

```bash
npm run papers        # 本地用 Microsoft Word COM 导出，保真度最高
git add content/assets/papers && git commit -m "论文 PDF" && git push
```

本地转换器优先级：**Microsoft Word → OnlyOffice → LibreOffice**。
只要你提交了 PDF，云端就不会再转一次（同名 PDF 优先复用）。

---

## Zotero 论文引用

### 一次性设置

1. Zotero 安装 [Better BibTeX](https://retorque.re/zotero-better-bibtex/)
2. 选中文献集合 → 右键 → **导出条目** → 格式选 **Better BibTeX**
3. 勾选 **Keep updated**，保存到本仓库根目录，文件名 `bibliography.bib`

之后在 Zotero 里新增论文，这个文件会自动更新，提交后站点引用就齐了。

### 写作时

```markdown
注意力机制依赖序列建模的长期积累[@hochreiter1997long]，
而 Transformer 把它推到了主流[@vaswani2017attention]。
```

渲染成：(Hochreiter & Schmidhuber, 1997) 与 (Vaswani et al., 2017)，文末自动生成参考文献表。

多篇一起引用：`[@a; @b]`。

### 换引用样式

`quartz.config.yaml` 里 citations 插件的 `csl` 字段：

- `apa` — 默认，社科常用
- `ieee` — 工科论文
- 其他样式见 [rehype-citation 文档](https://rehype-citation.netlify.app/custom-csl)

---

## 启用评论（需要你操作一次）

评论区用的是 [giscus](https://giscus.app/zh-CN)，基于 GitHub Discussions，免费、无广告、数据存在你自己的仓库里。

配置已经写好，但 **`categoryId` 还是占位符，需要你补上**：

1. 打开 <https://github.com/apps/giscus> → **Install** → 选择 `koishiu7/koishiu7.github.io` 仓库
   （不装这一步会报 `giscus is not installed on this repository`）
2. 仓库 **Settings → General → Features**，勾选 **Discussions**
3. 进入 **Discussions** 标签页 → 新建一个分类，名字叫 `Comments`（类型选 Announcements 或 General）
4. 打开 <https://giscus.app/zh-CN>，在「仓库」填 `koishiu7/koishiu7.github.io`
5. 页面下方会给出 `data-repo-id` 和 `data-category-id` 两串值
6. 把它们填进 `quartz.config.yaml` 的 comments 插件：

```yaml
options:
  repo: "koishiu7/koishiu7.github.io"
  repoId: "1437762333"      # 已填好，一般不用改
  category: "Comments"
  categoryId: "在这里填 data-category-id"
```

7. 提交推送，评论区即可正常工作

> 没配置之前，页面底部会一直显示「正在加载评论…」，不影响正文阅读。

---

## 索引与检索

四条路径，都不需要手动维护目录页：

| 方式 | 位置 | 适合 |
| --- | --- | --- |
| 文件夹树 | 左侧栏 | 知道大概在哪个分区 |
| 全站搜索 | 顶栏 | 记得关键词，忘了在哪 |
| 标签 | 笔记顶部 / `/tags/` | 跨目录的主题聚合 |
| 关系图 | 右侧栏 | 顺着双链发现关联 |

`index.md` 是首页，用表格做分区导航。新建文件夹后，该目录会自动生成索引页。

---

## 草稿与私密内容

- frontmatter 写 `draft: true` → 不发布
- 放进 `private/` 目录 → 不发布
- `ignorePatterns` 里可以继续加要排除的路径

---

## 目录结构

```
├── content/              # 笔记正文（Obsidian Vault 就指这里）
│   ├── index.md          # 首页
│   └── assets/           # 构建时自动生成的图片目录
│       └── papers/       # 论文 PDF（本地或云端转换产出，会提交回仓库）
├── tools/
│   ├── sync-vault.mjs    # 同步 + 图片归类脚本
│   └── build-papers.mjs  # 论文附件：转换 PDF + 生成预览页
├── quartz.config.yaml    # 站点配置：标题、配色、插件、布局
├── quartz/styles/custom.scss  # ArchWiki 风格样式
├── bibliography.bib      # Zotero 导出的文献库
└── .github/workflows/
    ├── deploy.yml        # 构建 + 发布（不转换文档，秒级）
    └── convert-papers.yml # docx → PDF，结果提交回仓库
```

---

## 常用配置

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题 | `quartz.config.yaml` → `pageTitle` |
| 主色调 | `quartz.config.yaml` → `theme.colors.lightMode.secondary` |
| 字体 | `theme.typography` + `custom.scss` 顶部字体栈 |
| 右侧栏放什么 | `quartz.config.yaml` 里组件的 `layout.position` |
| 引用样式 | citations 插件的 `csl` |

改完跑 `npm run preview` 看效果，满意再推送。

---

## 本地故障排查

```bash
# 依赖装不上
rm -rf node_modules && npm ci

# 构建报错，想看详细
npx quartz build --verbose

# 只想看图片归类结果，不写文件
npm run sync:dry
```
