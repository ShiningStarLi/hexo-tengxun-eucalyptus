# hexo-tengxun-eucalyptus

> Hexo 腾讯视频追剧页插件：同步腾讯视频账号「加追」「预约」列表，自动按进度分组生成卡片网格追剧页。

## 功能

- **账号同步**：`hexo zhuiju -u` 拉取腾讯视频「加追 / 预约」列表，自动抓详情
- **智能增量**：集数没变的剧跳过详情接口，大幅缩短同步时间
- **Cookie 过期兜底**：登录态失效时自动用缓存重分组，页面不崩
- **卡片网格**：竖版海报墙 + pill tabs 分组（追剧 / 已完结 / 预约）+ 搜索过滤
- **主题适配**：自动探测 anzhiyu / next / butterfly / volantis 等主题主色变量
- **封面缩略分流**：竖版 vt-pic 用 `/220`，横版 hz-pic 用 `/498`，加载 55KB vs 1MB 原图
- **零依赖**：只用 Node 18+ 内置 `fetch`

## 安装

```bash
npm install hexo-tengxun-eucalyptus
```

Hexo 启动时会自动加载，命令和 generator 自动注册，**不需要额外 require**。

## 配置

在 `_config.yml` 添加（所有字段都有默认值，可只写想改的）：

```yaml
zhuiju_vqq:
  enable: true
  path: zhuijus/              # 生成页面路径，最终是 /zhuijus/index.html
  title: 追剧列表             # 页面标题
  quote: ''                   # 顶部引言（可选）
  columns: 5                  # 桌面端卡片列数
  primary_color: ''           # 留空让主题 CSS 变量自动接管；写死如 '#3db4f2' 则强制
  groups:                     # 分组顺序和标签名（最多 3 组）
    - key: airing
      label: 追剧
    - key: finished
      label: 已完结
    - key: reserved
      label: 预约
```

### Cookie（账号同步模式）

**方式一**：根目录建 `.vqq-cookie` 文件（一行纯 cookie 字符串）

```bash
# 从浏览器复制：v.qq.com 登录后 F12 → Application → Cookies → Copy all
```

**方式二**：环境变量 `VQQ_COOKIE`

```bash
export VQQ_COOKIE='RK=xxx; ptcz=xxx; ...'
```

Cookie 只需要包含腾讯视频的鉴权字段：`ptcz`（最关键）+ 一些设备指纹。过期时插件会自动降级用缓存，页面不会空白。

### 手动清单（无账号模式）

不想绑账号？在 `source/_data/zhuiju_src.json` 里手动填：

```json
{
  "airing":   ["mzc002000abcde", "https://v.qq.com/x/cover/mzc002000fghij.html"],
  "finished": ["mzc002000klmno"],
  "reserved": ["mzc002000pqrst"]
}
```

cid 也可以写 `{ "cid": "xxx" }` 或直接写完整 URL，插件会自动提取。

### 手动分组覆盖

Cookie 同步模式下，分组规则是：`mark_label` 带「全 N 集 / 已完结」→ `finished`，否则 `airing`。想强制覆盖？

在 `source/_data/zhuiju_status.json` 里写：

```json
{
  "mzc002000abcde": "finished",
  "mzc002000fghij": "airing"
}
```

支持的 key 值：`airing` / `finished` / `reserved`。

## 使用

```bash
# 1. 同步数据（Cookie 过期自动兜底）
npx hexo zhuiju -u

# 2. 构建
npx hexo clean && npx hexo generate

# 3. 预览
npx hexo s
# 打开 http://localhost:4000/zhuijus/
```

## 生成的文件

| 文件 | 说明 |
|------|------|
| `source/_data/zhuijus.json` | 数据文件，供 generator 读入 |
| `public/zhuijus/index.html` | 最终页面（generator 构建时自动生成） |

## 主题适配

插件 CSS 自动探测以下 CSS 变量作为主色调：

```css
var(--primary-color,        /* volantis */
    var(--anzhiyu-main,     /* anzhiyu */
        var(--theme-color,   /* next / butterfly */
            #3db4f2)));     /* fallback */
```

深浅色模式通过 `html.dark` / `[data-theme="dark"]` 自动切换背景色。如果你的主题用了不同的 dark class，告诉我我补上。

## 常见问题

**Q: Cookie 多久过期？**
A: 腾讯视频 Cookie 一般几周，过期时插件会日志警告 `Cookie 已过期，用缓存数据兜底`，页面照常显示。

**Q: 部分剧没有竖版封面怎么办？**
A: 正常，腾讯部分新剧评分接口还没开放，只给了横版 hz-pic。封面分流会自动走 hz-pic + `/498` 缩略。

**Q: 可以换卡片数量 / 布局吗？**
A: 改 `_config.yml` 里的 `columns`（默认 5）。CSS 里有 `@media` 响应式断点，移动端自动降到 2 列。

## License

MIT
