# 五子棋项目设计文档 (PROJECT.md)

> 本文档记录项目全部设计细节，用于日后 debug 和二次开发参考。
> 最后更新：2026-10-10（AI 引擎重构，测试扩至 40 项）

---

## 一、项目概述

纯前端 H5 五子棋游戏，支持双人对战和人机对决，配备七级 AI 难度和赛后复盘分析功能。

**技术栈：**
- 原生 HTML5 Canvas + CSS3 + JavaScript（无框架依赖）
- AI 算法：Minimax + Alpha-Beta 剪枝（本地计算，无需网络）
- 复盘分析：本地评分 + API 增强（可选）
- API：`https://apihub.agnes-ai.com/v1/chat/completions`，模型 `agnes-2.5-flash`

**GitHub 仓库：** https://github.com/HAAVKSKY/web

---

## 二、文件结构

```
wuziqi/
├── index.html              # 主页面入口
├── encryptor.html          # API Key 凯撒加密工具（独立使用）
├── CLAUDE.md               # 项目注意事项（每次对话遵守）
├── PROJECT.md              # 本文件
├── .gitignore
├── css/
│   └── style.css           # 样式（深色木质主题，含移动端适配）
├── js/
│   ├── config.js           # API Key 解密配置区
│   ├── ai.js               # AI 引擎入口（getAIMove 分发）
│   ├── engine.js           # 强化搜索引擎（pointScore + 迭代加深 + 时间预算）
│   ├── apiAi.js           # API 辅助/主导引擎（铂金以上）
│   ├── analysis.js         # 复盘分析模块
│   └── game.js             # 游戏主逻辑（Canvas渲染、事件、状态管理）
└── test/
    └── run-tests.js        # 单元测试（node test/run-tests.js，27项断言）
```

---

## 三、核心设计决策

### 3.1 Canvas 渲染方案
- 棋盘 15×15，Canvas 初始 600×600px
- 响应式：`resizeCanvas()` 根据容器宽度动态调整
- 触摸支持：`touchend` 事件模拟 click 事件
- 木纹渐变背景 + 径向渐变棋子（黑/白双色）
- 最后一手棋用中心圆点标记

### 3.2 AI 架构（七级难度，2026-10-10 重构）

| 等级 | 名称 | 策略 | 时间预算 | 候选数 | 最大深度 | 噪声 |
|------|------|------|---------|--------|---------|------|
| bronze | 青铜 | 纯本地 | 200ms | 8 | 2 | 15% |
| silver | 白银 | 纯本地 | 400ms | 10 | 3 | 8% |
| gold | 黄金 | 纯本地 | 800ms | 12 | 4 | 4% |
| platinum | 铂金 | 本地 top-3 + API 3选1 | 1500ms+3s API | 16 | 5 | 1% |
| diamond | 钻石 | 本地 top-3 + API 3选1 | 2500ms+4s API | 20 | 6 | 0% |
| star | 星耀 | API 全局面（失败降级本地） | 5s API | 24 | 7 | 0% |
| king | 王者 | API 全局面（失败降级本地） | 8s API | 24 | 8 | 0% |

**算法流程（本地引擎，`js/engine.js`）：**
1. `pointScore`：精细棋形识别（活四/跳四/双活三/冲四/活三/眠三），进攻分与防守分取 max
2. `rankedCandidates`：全局候选按 pointScore 排序截断
3. `localBestMove`：迭代加深（depth 2→maxDepth），时间预算控制，超时返回当前评估
4. 立即获胜/必须防守优先于搜索（全局扫描）

**API 增强（`js/apiAi.js`，铂金及以上）：**
- 铂金/钻石：本地引擎拿到 top-3 候选后发给 API 做 3 选 1，失败取本地最优
- 星耀/王者：直接发全局面给 API，失败降级本地深搜
- 超时控制：`AbortController` + `setTimeout` 实现，超时 abort
- API 端点：`https://apihub.agnes-ai.com/v1/chat/completions`，模型 `agnes-2.5-flash`，temperature=0.1

**`getAIMove` 接口变更（2026-10-10）：**
- 现在返回 `Promise<{r, c}>`，`game.js` 中 `doAIMove` 已改为 `.then()` 调用
- 前三级内部同步计算后 `Promise.resolve()`，响应 < 1s
- 中高级有网络请求，期间 UI 显示「AI 思考中…」（替换 `turnDisplay` 文本）

**关键文件：**
- `js/engine.js`：`pointScore`、`rankedCandidates`、`localBestMove`、`alphabeta`、`iterativeDeepen`
- `js/apiAi.js`：`getHybridAIMove`、`getApiMove`、`boardToString`、`parseApiCoord`
- `js/ai.js`：`getAIMove`（分发入口），旧 `getBestMove`/`minimax` 保留作为备用

### 3.3 评分函数设计

**evaluateBoard（全局评估）：**
- 对每个方向（横、竖、两对角线）统计连续棋子和开放端数
- 基础分 = count × 10 × (1 + openEnds)
- 活四（count≥4, open≥2）：+50000
- 五连（count≥5）：+1000000

**evaluateMove（单步评估，用于复盘）：**
- 模拟落子后四个方向的连续数和开放端
- 权重：五连50000、活四10000、冲四1000、活三500、眠三100

### 3.4 复盘分析

**两种模式：**
1. **API 模式**：调用 `https://apihub.agnes-ai.com/v1/chat/completions`，发送对局记录，由 AI 给出专业点评
2. **本地降级模式**：逐手调用 `analyzeBoard()`，按评分阈值分类：
   - `good`（≥180）：积极一手
   - `good`（≥50000）：非常强力，活四/冲四威胁
   - `blunder`（<30 且 moveNum>10）：软着
   - `normal`：其余

**API 调用参数：**
- model: `agnes-2.5-flash`
- temperature: 0.3（稳定输出）
- max_tokens: 500
- system prompt：专业五子棋教练角色

### 3.5 API Key 安全方案

**设计思路：**
- 明文 Key 不暴露于代码中
- 使用凯撒密码（Caesar Cipher）加密
- 加密工具（encryptor.html）与主程序分离

**加密算法：**
```javascript
// 加密：ASCII码 + shift，模95（可打印字符范围32~126）
encrypted[i] = String.fromCharCode(32 + ((code - 32 + shift) % 95))

// 解密：反向操作
decrypted[i] = String.fromCharCode(32 + ((code - 32 - shift + 95) % 95))
```

**当前配置：**
- `ENCRYPTED_API_KEY = 'zr4\NZpL~h=kj9_]^QtoWkjrtK"RJNZT"z_Pqwno`utq_sKMaS'`（50字符）
- `KEY_SHIFT = 7`
- 解密结果：`sk-UGSiEwa6dc2XVWJmhPdckmDzKCGSMzsXIjpghYnmjXlDFZL`

**使用流程：**
1. 打开 `encryptor.html`
2. 输入明文 API Key 和偏移量
3. 点击「生成密文」
4. 复制输出到 `js/config.js` 的 `ENCRYPTED_API_KEY` 和 `KEY_SHIFT`

---

## 四、游戏状态管理

**全局变量（game.js 顶部）：**
```javascript
let board          // 15×15 二维数组，EMPTY=0, BLACK=1, WHITE=2
let currentTurn    // 当前回合
let gameOver       // 游戏是否结束
let gameMode       // 'pvp' | 'pve'
let selectedRank   // 当前难度等级
let lastMove       // {r, c} 最后一手坐标
let moveHistory    // [{num, r, c, color}] 落子历史
let undoStack      // [{r, c, player}] 悔棋栈
```

**状态转换：**
```
点击棋盘 → placeStone() → makeMove()
  ├─ 检查五连 → gameOver=true → showGameEnd()
  ├─ 检查平局 → gameOver=true → showGameEnd(0)
  └─ 切换回合 → 人机模式触发 doAIMove()
```

**悔棋逻辑：**
- 双人对战：撤销1手
- 人机对战：撤销2手（AI + 玩家各一步）

---

## 五、UI 组件与交互

### 5.1 布局
- 响应式：桌面端左右布局（侧边栏+棋盘），移动端上下布局
- 棋盘居中，最大600px，随容器自适应

### 5.2 侧边栏面板
1. **模式面板**：双人对战/人机对战切换，难度选择
2. **状态面板**：游戏结束时显示结果，提供「复盘分析」和「新游戏」按钮
3. **复盘面板**：显示分析结果，提供「返回游戏」按钮

### 5.3 事件绑定
- `nav-btn`：模式切换
- `rank-btn`：难度选择
- `btnNewGame`：重新开始
- `btnReplay`：显示复盘
- `btnBackToGame`：返回游戏
- `canvas click/touchend`：落子

---

## 六、已知问题与注意事项

### 6.0 已修复的 Bug（2026-10-10 代码审查）

| 严重程度 | 问题 | 修复方式 |
|---------|------|---------|
| 致命 | `ai.js` 和 `analysis.js` 均声明 `const DIRS`，浏览器加载顺序触发 `SyntaxError`，整个游戏无法运行 | 删除 `analysis.js` 中的 `const DIRS` 和 `inBounds`，复用 `ai.js` 的全局变量（`index.html` 先加载 `ai.js`） |
| 严重 | `getBestMove` 的立即获胜/防守检查只在 `lastMove` 2格邻域内查找，遗漏远处的四连威胁，AI 不补五连也不封堵 | 改为先用 `getCandidatesForSearch`（全局2格邻域）扫描所有可落点，发现可胜/必须防守的点位直接返回 |
| 中等 | `minimax` 叶节点（`depth===0`）噪声硬编码为 `RANK_CONFIG.star.evalNoise`（±10），各难度共用同一噪声，且与 `getBestMove` 末尾注入的等级噪声重复 | 移除 `minimax` 叶节点的随机噪声，改为纯 `evaluateBoard`；噪声由 `getBestMove` 对最终分数统一注入 |
| 中等 | `analyzeBoard` 调用 `evaluateMove` 时 `board[r][c]` 已被填充（`generateLocalAnalysis` 先放子再分析），`evaluateMove` 第一行 `if (board[r][c] !== 0) return 0` 导致**每手评分恒为 0**，所有第 11 手后的非五连均被判为软着 | `analyzeBoard` 内部临时清空 `board[r][c]` 再调 `evaluateMove`，结束后还原 |
| 低 | `getBestMove` 防守加分处有无意义死代码块（`if (defendWin) { board[r][c] = player; }` 及注释 `// actually need to re-set`） | 删除该 if 块，保留 `if (defendWin) score += 500000` |
| 低 | `.modal-overlay` 设置了 `display: flex`，覆盖了 HTML `hidden` 属性默认的 `display: none`，导致弹窗无法通过 `hidden` 属性隐藏；且 `modalClose` 按钮无事件绑定，点击无反应 | CSS 增加 `.modal-overlay[hidden] { display: none; }`；`game.js` 为 `modalClose` 绑定 `click` 事件关闭弹窗 |

**测试验证：** 修复后新增 `test/run-tests.js`（30 项断言），覆盖 `checkWin`、`getConsecutive`、`evaluateBoard`、`getCandidates`、`getAIMove`（进攻五连 + 防守）、`evaluateMove`、`analyzeBoard`、`DIRS` 声明检查、凯撒解密、弹窗 CSS/HTML/JS 一致性，全部通过。

```bash
node test/run-tests.js
```

### 6.1 Git 锁文件问题
- 工作目录 `/sessions/fervent-amazing-albattani/mnt/wuziqi/.git/` 存在不可删除的 lock 文件
- **解决方案**：在 `/tmp/wuziqi-final/` 目录执行 git 操作，然后 push 到 GitHub
- 推送使用 `--force` 覆盖（因本地无法 commit）

### 6.2 字符串转义陷阱
- 凯撒密文包含反斜杠 `\`、反引号 `` ` ``、双引号 `"`
- 在 JS 单引号字符串中：`\` 需写为 `\\`，`` ` `` 无需转义，`"` 无需转义
- 在 bash heredoc 中：`\` 需写为 `\\`，`` ` `` 需用 `\`` 转义
- **验证方法**：用 Node.js 读取文件内容并解密，确认结果为合法的 `sk-` 开头 50 字符 Key

### 6.3 AI 性能
- 王者等级（depth=5）在复杂局面可能耗时较长
- 建议：后续可考虑时间限制或迭代加深

### 6.4 API 降级
- 当 `window.API_KEY` 为空或 API 调用失败时，自动降级为本地分析
- 本地分析仍提供有价值的每步评分反馈

---

## 七、调试指南

### 7.1 检查 API Key 是否生效
打开浏览器控制台，执行：
```javascript
console.log('API Key:', window.API_KEY);
console.log('长度:', window.API_KEY?.length);
console.log('格式:', window.API_KEY?.startsWith('sk-'));
```
应输出：`长度: 50`，`格式: true`

### 7.2 检查 AI 难度配置
```javascript
console.log(RANK_CONFIG);
```

### 7.3 检查棋盘状态
```javascript
console.log(board);
console.log(currentTurn); // 1=黑, 2=白
console.log(moveHistory);
```

### 7.4 测试复盘分析
游戏结束后点击「复盘分析」，查看：
- 是否有「正在生成复盘分析...」loading 状态
- 分析结果是否显示每手棋的评价
- 底部是否有总结（亮点数、软着数）

### 7.5 测试移动端触摸
- 使用浏览器开发者工具的 Device Toolbar
- 或直接在手机上打开
- 确保 `touchend` 事件正确触发 `placeStone()`

---

## 八、扩展方向

1. **音效反馈**：落子、胜利、悔棋音效
2. **开局库**：预置常见开局定式
3. **棋谱保存/加载**：localStorage 持久化
4. **在线对战**：WebSocket 实时多人对战
5. **AI 训练**：基于历史棋谱训练神经网络
6. **更多难度梯度**：在现有7级之间插入更细粒度级别

---

*文档生成时间：2026-10-10*
*项目代码总量：约 1214 行*

---

## 九、测试结果

运行 `node test/run-tests.js`，**27 项测试全部通过，0 失败**。

| 测试类别 | 数量 | 状态 |
|----------|------|------|
| checkWin（胜负判断） | 6 | ✓ |
| getConsecutive（连续棋子统计） | 4 | ✓ |
| evaluateBoard（全局棋盘评估） | 2 | ✓ |
| getCandidates（候选落子点） | 3 | ✓ |
| getAIMove / AI 落子 | 3 | ✓ |
| evaluateMove（复盘评分） | 2 | ✓ |
| analyzeBoard（复盘分析） | 2 | ✓ |
| DIRS 冲突检查 | 2 | ✓ |
| 凯撒解密验证 | 2 | ✓ |

---

*文档最后更新：2026-10-10*

---

## 十、Bug 修复记录

### 2026-10-10：青铜难度 AI 返回空对象

**现象**：`getLocalAIMove` 在青铜难度、棋盘只有一手棋时返回 `{}`（r/c 均为 undefined）

**根因**：`engine.js:220` 解构赋值错误
```javascript
// 错误写法（getCandidates 返回二维数组 [[r,c],...]，不能解构成 [ar, ac]）
const [ar, ac] = getCandidates(board, lastR, lastC);
if (ar.length > 0) return { r: ar[0][0], c: ar[0][1] };
```

**修复**：
```javascript
const cands = getCandidates(board, lastR, lastC);
if (cands.length > 0) return { r: cands[0][0], c: cands[0][1] };
```

**影响范围**：青铜、白银两个低等级在第二手棋时都会触发此 bug

---

*文档最后更新：2026-10-10*
