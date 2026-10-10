---
name: 工作方式
description: 五子棋项目的标准工作流程规范。当在五子棋项目（Z:\web\wuziqi）中进行开发操作、讨论代码/bug/测试、要求修改项目文件或提到 CLAUDE.md/PROJECT.md 时自动加载此 skill。包含完整的 Plan-Implement-Verify 三步工作流、Git 操作规范（含锁文件问题规避）、项目结构速查和常见 Debug 指南。
---

# 五子棋项目工作方式

> 本 skill 定义了与五子棋项目（Gomoku）交互的标准工作流程，所有对话均遵循此规范。

---

## 触发条件

当用户提及以下任一场景时自动加载：
- 在五子棋项目目录（Z:\web\wuziqi）中进行任何开发操作
- 讨论五子棋代码、功能、bug、测试
- 要求修改项目文件并提交
- 提到 CLAUDE.md 或 PROJECT.md

---

## 工作流程

### 第一阶段：规划（Plan）

在动手写代码前，先完成以下步骤：

1. **理解需求**：确认用户要实现的功能边界、优先级、验收标准
2. **技术方案**：选择合适的前端方案（Canvas/DOM/WebGL）、算法方案（AI难度、复盘策略）
3. **文件清单**：列出需要创建/修改的文件及其职责
4. **风险评估**：识别潜在冲突（如变量命名、依赖顺序、样式覆盖）

### 第二阶段：实现（Implement）

按以下顺序执行，每完成一个模块提交一次 commit：

```
1. 修改/创建源代码文件（js/css/html）
2. 运行测试：node test/run-tests.js
3. 如有新增功能，补充或更新测试
4. 全部测试通过后，commit
5. 推送至 GitHub
6. 更新 PROJECT.md（记录变更）
```

**禁止跳步**：未通过测试不得 commit，未 commit 不得推送。

### 第三阶段：验证（Verify）

交付前必须完成：
- [ ] 所有测试用例通过（`node test/run-tests.js`）
- [ ] 浏览器手动验证核心流程（落子、胜负判断、复盘、悔棋）
- [ ] 确认 GitHub 远程分支包含最新 commit
- [ ] PROJECT.md 已同步更新

---

## 关键约束（来自 CLAUDE.md）

1. 每次改动 → 必须对应一个 Git commit
2. 每次改动 → 必须编写/更新测试，全部通过才能交付
3. 每一次对话 → 必须遵守本 CLAUDE.md
4. 每一次修改 → 必须推送到 `git@github.com:HAAVKSKY/web.git`
5. 每一次更新 → 必须更新 PROJECT.md（没有则创建）

---

## Git 操作规范

### 锁文件问题（已知）

本地 `.git/` 目录存在不可删除的 lock 文件，直接 commit/push 会失败。

**正确做法**：通过 `/tmp/wuziqi-sync/` 中转推送：

```bash
# 1. 拷贝工作区文件到 /tmp
rm -rf /tmp/wuziqi-sync && mkdir -p /tmp/wuziqi-sync
cp /sessions/fervent-amazing-albattani/mnt/wuziqi/*.{html,md,js} /tmp/wuziqi-sync/ 2>/dev/null
cp -r /sessions/fervent-amazing-albattani/mnt/wuziqi/{css,js,test} /tmp/wuziqi-sync/

# 2. 在 /tmp 中 init + push
cd /tmp/wuziqi-sync && git init && git remote add origin git@github.com:HAAVKSKY/web.git
git add -A && git commit -m "your message" && git push origin master --force

# 3. 同步回工作区
cp /tmp/wuziqi-sync/*.md /sessions/fervent-amazing-albattani/mnt/wuziqi/
```

### Commit 信息格式

```
feat: 新增功能描述
fix: 修复某问题
docs: 更新文档
test: 新增/修改测试
chore: 配置/工具变更
```

---

## 项目结构速查

| 文件 | 职责 |
|------|------|
| `index.html` | 页面入口，Canvas 棋盘容器 |
| `encryptor.html` | API Key 凯撒加密工具 |
| `js/config.js` | 解密配置（ENCRYPTED_API_KEY + KEY_SHIFT） |
| `js/ai.js` | AI 引擎（7级难度，Minimax+Alpha-Beta） |
| `js/engine.js` | 强化搜索引擎（迭代加深+时间预算） |
| `js/apiAi.js` | API AI 辅助模块（铂金级以上） |
| `js/analysis.js` | 复盘分析（本地评分+API增强） |
| `js/game.js` | 游戏主逻辑（渲染、交互、状态管理） |
| `css/style.css` | 样式（深色木质主题） |
| `test/run-tests.js` | 测试套件（40项） |
| `CLAUDE.md` | 项目约束规则 |
| `PROJECT.md` | 设计文档（需随变更更新） |

---

## 常见 Debug 指南

### API Key 解密失败
```javascript
// 浏览器控制台检查
console.log('API Key:', window.API_KEY);
console.log('长度:', window.API_KEY?.length);
```
应输出：`长度: 50`，`格式: true`

### AI 不响应
检查 `console` 是否有 JS 错误；确认 `js/ai.js` 先于 `js/game.js` 加载。

### 复盘面板空白
检查 `window.API_KEY` 是否为空；若为空则降级为本地分析。

### Canvas 棋盘错位
检查 `resizeCanvas()` 是否在窗口 resize 时正确调用。

---

*本 skill 由 CLAUDE.md 整理生成，与项目保持一致。*
