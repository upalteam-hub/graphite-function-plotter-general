# Graphite 函数绘制器

Graphite 是一个面向手机的函数绘图网页。输入表达式后，点击「绘制曲线」即可进入全屏 SVG 直角坐标系，观看曲线逐步绘出。项目只使用 HTML、CSS 和 JavaScript，无需安装依赖、构建或连接后端。

## 使用方法

下载并解压整个项目，在现代浏览器中打开 `index.html`。请保留旁边的 `assets/` 目录。网页可离线运行。

每行输入一条表达式，也可使用输入框下方的数学按键或点击示例。点击「绘制曲线」后，普通曲线会保留在本次页面会话中，可返回输入页继续添加，最多同时绘制 12 条。

| 类型 | 示例 |
| --- | --- |
| 显函数 | `y=sin(x)` 或 `x^2` |
| 指定区间 | `y=x² @ [-2, 2]` |
| 隐式方程 | `x^2+y^2=9` |
| 参数方程 | `x=3*cos(t); y=2*sin(t)`，默认 `t ∈ [0, 2π]`，也可用 `@` 指定区间 |

支持绝对值、圆周率（`π`、`Π`、`pi`）、指数、常见三角函数（角度用弧度）、自然对数 `ln(x)`、`log₂(x)`、`log₁₀(x)` 和 `log(x, 底数)`。单参数 `log(x)` 与 `ln(x)` 等价。

当所有曲线都能确定有限的横纵边界时，绘图区会等比例自动取景；否则沿用默认视野。支持拖动、双指或滚轮缩放、复位、重播和导出 SVG。点击「返回输入」可以继续编辑原表达式。

多条普通曲线用不同颜色区分，绘图区会标注表达式及检测到的交点。隐式及参数曲线的交点是数值近似。

## 文件结构

```text
.
├── index.html          页面入口和界面结构
├── assets/
│   ├── graphite.css    黑白灰主题、移动端与全屏布局
│   ├── graphite.js     表达式解析、取景、SVG 绘制与交互
│   └── heart-sticker.js 心形特效使用的内置 PNG 资源
├── .nojekyll           让 GitHub Pages 直接发布静态文件
├── README.md           使用和部署说明
└── PROJECT_CONTEXT.md  项目状态与开发交接
```

坐标系和曲线由程序生成 SVG，品牌标记由文字和 CSS 绘制。表情包内置在本地资源中，无需联网下载。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，例如 `graphite-function-plotter`。把 ZIP **解压后的内容**上传到 `main` 分支根目录，确保 `index.html` 和 `assets/` 直接位于根目录。
2. 在仓库中进入 **Settings → Pages**，在 **Build and deployment** 中选择 **Deploy from a branch**，然后选择 `main` 和 `/ (root)`，点击 **Save**。
3. 发布完成后，从 **Pages** 设置打开站点。普通项目仓库的默认地址形如 `https://用户名.github.io/仓库名/`。

如果文件管理器隐藏了 `.nojekyll`，请使用显示隐藏文件的方式上传，或在仓库根目录补建该空文件。部署详情见 [GitHub 官方 Pages 指南](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
