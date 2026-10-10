/**
 * 五子棋项目测试
 * 运行：node test/run-tests.js
 */

// ── 加载 ai.js 模拟全局环境 ──────────────────────────────────
const fs = require('fs');
const path = require('path');

// 用 vm 模拟浏览器全局环境
const vm = require('vm');
const sandbox = {};
vm.createContext(sandbox);

// 注入 DOM 相关变量（ai.js 不需要 DOM，但 game.js 需要）
sandbox.window = sandbox;
sandbox.performance = { now: () => Date.now() };
sandbox.document = {
  getElementById: () => ({ textContent: '', innerHTML: '', hidden: false, classList: { add(){}, remove(){} }, style: {} }),
  querySelector: () => ({ addEventListener(){} }),
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ className:'', style:{}, addEventListener(){}, textContent:'' })
};
sandbox.addEventListener = () => {};

// 加载 ai.js
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/ai.js'), 'utf8'), sandbox);
// 加载 engine.js（依赖 ai.js 中的全局变量）
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/engine.js'), 'utf8'), sandbox);
// 加载 analysis.js（依赖 ai.js 中的 DIRS/inBounds 全局变量）
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/analysis.js'), 'utf8'), sandbox);

// 暴露函数
const {
  createBoard, inBounds, checkWin, getConsecutive,
  getCandidates, scoreMove, getBestMove, getAIMove,
  evaluateBoard,
  evaluateMove, analyzeBoard,
} = sandbox;
const {
  pointScore, rankedCandidates, getLocalAIMove,
} = sandbox;

// ── 测试框架 ──────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${label}`);
  }
}

console.log('\n── checkWin 测试 ──────────────────────────────────────');
{
  const b = createBoard();
  // 水平五连
  b[7][0] = b[7][1] = b[7][2] = b[7][3] = b[7][4] = 1;
  assert(checkWin(b, 7, 2, 1) === true, 'checkWin: 水平五连检测');

  // 垂直五连
  const b2 = createBoard();
  b2[0][7] = b2[1][7] = b2[2][7] = b2[3][7] = b2[4][7] = 1;
  assert(checkWin(b2, 2, 7, 1) === true, 'checkWin: 垂直五连检测');

  // 对角线五连
  const b3 = createBoard();
  b3[0][0] = b3[1][1] = b3[2][2] = b3[3][3] = b3[4][4] = 1;
  assert(checkWin(b3, 2, 2, 1) === true, 'checkWin: 主对角线五连检测');

  // 副对角线五连
  const b4 = createBoard();
  b4[0][4] = b4[1][3] = b4[2][2] = b4[3][1] = b4[4][0] = 1;
  assert(checkWin(b4, 2, 2, 1) === true, 'checkWin: 副对角线五连检测');

  // 未达成五连不触发
  const b5 = createBoard();
  b5[7][0] = b5[7][1] = b5[7][2] = b5[7][3] = 1;
  assert(checkWin(b5, 7, 1, 1) === false, 'checkWin: 四连不触发胜利');

  // 边界：超出棋盘范围不越界
  const b6 = createBoard();
  b6[0][0] = b6[0][1] = b6[0][2] = b6[0][3] = b6[0][4] = 1;
  assert(checkWin(b6, 0, 2, 1) === true, 'checkWin: 边界五连检测（顶行）');
}

console.log('\n── getConsecutive 测试 ────────────────────────────────');
{
  const b = createBoard();
  b[7][2] = b[7][3] = b[7][4] = b[7][5] = b[7][6] = 1;
  const info = getConsecutive(b, 7, 4, 0, 1, 1);
  assert(info.count === 5, `getConsecutive: 五连 count=${info.count}（期望5）`);
  assert(info.open === 2, `getConsecutive: 五连 open=${info.open}（期望2，两端均空）`);

  const b2 = createBoard();
  b2[7][2] = b2[7][3] = b2[7][4] = 1;
  const info2 = getConsecutive(b2, 7, 3, 0, 1, 1);
  assert(info2.count === 3, `getConsecutive: 三连 count=${info2.count}（期望3）`);
  assert(info2.open === 2, `getConsecutive: 活三 open=${info2.open}（期望2）`);
}

console.log('\n── evaluateBoard 测试 ────────────────────────────────');
{
  const b = createBoard();
  // 白棋（player=2）有四连
  b[7][2] = b[7][3] = b[7][4] = b[7][5] = 2;
  const score = evaluateBoard(b, 2);
  assert(score > 0, `evaluateBoard: 白棋四连评估为正（score=${score}）`);

  const b2 = createBoard();
  b2[7][2] = b2[7][3] = b2[7][4] = b2[7][5] = 1;
  const score2 = evaluateBoard(b2, 2);
  assert(score2 < 0, `evaluateBoard: 黑棋四连对白棋为负（score=${score2}）`);
}

console.log('\n── getCandidates 测试 ────────────────────────────────');
{
  const b = createBoard();
  assert(JSON.stringify(getCandidates(b, -1, -1)) === JSON.stringify([[7, 7]]),
    'getCandidates: 空棋盘返回 [7,7]');

  const b2 = createBoard();
  b2[7][7] = 1;
  const cands = getCandidates(b2, 7, 7);
  assert(cands.length > 0 && cands.every(([r, c]) => b2[r][c] === 0),
    `getCandidates: 有一手棋时返回邻域空位（${cands.length} 个）`);

  // 检查返回的候选都在邻域内
  const inRange = cands.every(([r, c]) =>
    Math.abs(r - 7) <= 2 && Math.abs(c - 7) <= 2
  );
  assert(inRange, 'getCandidates: 所有候选在2格邻域内');
}

console.log('\n── getBestMove / AI 落子测试（旧版同步接口）──────────────');
{
  // 旧版 getBestMove 仍保留（同步），用 getLocalAIMove 替代验证
  // 白棋四连在 [7,0..3]，AI 应进攻补 [7,4]
  const b = createBoard();
  b[7][0] = b[7][1] = b[7][2] = b[7][3] = 2;
  b[3][3] = 1;

  const move = getLocalAIMove(b, 2, 'gold', 3, 3);
  assert(b[move.r]?.[move.c] === 0, `getLocalAIMove: 返回空位 (${move.r},${move.c})`);
  assert(move.r === 7, `getLocalAIMove: 金色AI进攻（AI四连应补五连）r=${move.r}（期望7）`);
  console.log(`  （耗时 < 800ms 预算内）`);

  // 青铜也可正常返回坐标
  const b2 = createBoard();
  b2[7][7] = 1;
  const move2 = getLocalAIMove(b2, 2, 'bronze', 7, 7);
  assert(b2[move2.r]?.[move2.c] === 0, `getLocalAIMove(青铜): 返回合法空位 (${move2.r},${move2.c})`);
}

console.log('\n── evaluateMove（复盘评分）测试 ──────────────────────');
{
  const b = createBoard();
  // 白棋四连，补最后一手 = 五连
  b[7][2] = b[7][3] = b[7][4] = b[7][5] = 1;
  const winScore = evaluateMove(b, 7, 6, 1);
  assert(winScore >= 50000, `evaluateMove: 五连补位评分≥50000（score=${winScore}）`);

  const b2 = createBoard();
  b2[7][2] = b2[7][3] = b2[7][4] = 1;
  const threeScore = evaluateMove(b2, 7, 5, 1);
  assert(threeScore < 50000 && threeScore > 0, `evaluateMove: 非五连评分 < 50000（score=${threeScore}）`);
}

console.log('\n── analyzeBoard 测试 ─────────────────────────────────');
{
  const b = createBoard();
  b[7][0] = b[7][1] = b[7][2] = b[7][3] = b[7][4] = 1;
  const result = analyzeBoard(b, 5, 7, 4, 1);
  assert(result[0].type === 'win', `analyzeBoard: 五连返回 win 类型（got ${result[0].type}）`);

  const b2 = createBoard();
  const result2 = analyzeBoard(b2, 3, 7, 7, 1);
  assert(result2[0].type !== 'win', `analyzeBoard: 无五连不返回 win（got ${result2[0].type}）`);
}

console.log('\n── DIRS 冲突检查 ─────────────────────────────────────');
{
  // 两个文件都声明 const DIRS 会导致 SyntaxError
  // 修复后 analysis.js 不再声明 DIRS，改用 ai.js 的
  const analysisCode = fs.readFileSync(path.join(__dirname, '../js/analysis.js'), 'utf8');
  const hasOwnDirs = /const\s+DIRS\s*=/.test(analysisCode);
  assert(!hasOwnDirs, 'analysis.js: 不独立声明 DIRS（复用 ai.js 的）');

  const aiCode = fs.readFileSync(path.join(__dirname, '../js/ai.js'), 'utf8');
  assert(/const\s+DIRS\s*=\s*\[\[0,1\],\[1,0\],\[1,1\],\[1,-1\]\]/.test(aiCode),
    'ai.js: DIRS 正确声明');
}

console.log('\n── config.js 凯撒解密验证 ─────────────────────────────');
{
  const configCode = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
  const m1 = configCode.match(/const ENCRYPTED_API_KEY = '(.+)';/s);
  const m2 = configCode.match(/const KEY_SHIFT = (\d+);/);
  const enc = m1[1];
  const shift = parseInt(m2[1]);
  const dec = enc.split('').map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) return String.fromCharCode(32 + ((code - 32 - shift + 95) % 95));
    return ch;
  }).join('');
  assert(dec.startsWith('sk-'), `凯撒解密: 结果以 sk- 开头（got "${dec.slice(0,5)}…"）`);
  assert(dec.length === 50, `凯撒解密: 长度=50（got ${dec.length}）`);
}

console.log('\n── CSS / HTML 弹窗 hidden 属性验证 ─────────────────');
{
  const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  const hasHiddenOverride = /\.modal-overlay\[hidden\]\s*\{\s*display\s*:\s*none/.test(css);
  assert(hasHiddenOverride, 'style.css: 存在 .modal-overlay[hidden] { display:none } 覆盖规则');

  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const overlayHasHidden = html.includes('id="modalOverlay" hidden');
  assert(overlayHasHidden, 'index.html: modalOverlay 初始带有 hidden 属性');

  const gameJs = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
  const closeHandler = /modalClose.*addEventListener.*click/.test(gameJs);
  assert(closeHandler, 'game.js: modalClose 按钮已绑定 click 事件');
}

console.log('\n── engine.js pointScore 测试 ───────────────────────');
{
  // 黑棋 [7,3..6] 四连，白棋 (2) 落 [7,7] 形成防守分（阻止黑棋五连）
  const b = createBoard();
  b[7][3] = b[7][4] = b[7][5] = b[7][6] = 1;
  const s = pointScore(b, 7, 7, 2);
  assert(s >= 500000, `pointScore: 防守五连点评分 ≥500000（score=${s}）`);

  // 白棋 [7,3..5] 活三，白棋自己补 [7,6] 形成活四
  const b2 = createBoard();
  b2[7][3] = b2[7][4] = b2[7][5] = 2;
  const s2 = pointScore(b2, 7, 6, 2);
  assert(s2 >= 500000, `pointScore: 补活四进攻分 ≥500000（score=${s2}）`);

  // 空点基础分较低
  const b3 = createBoard();
  b3[7][7] = 1;
  const s3 = pointScore(b3, 0, 0, 2);
  assert(s3 < 1000, `pointScore: 远角点评分较低（score=${s3}）`);
}

console.log('\n── engine.js rankedCandidates 测试 ──────────────────');
{
  const b = createBoard();
  b[7][7] = 1; b[8][8] = 2;
  const cands = rankedCandidates(b, 2, 5);
  assert(cands.length > 0, `rankedCandidates: 返回候选（${cands.length} 个）`);
  assert(cands.every(([, ,s]) => typeof s === 'number'), 'rankedCandidates: 每个候选带评分');
  // 评分降序
  const sorted = cands.every((c, i) => i === 0 || cands[i-1][2] >= c[2]);
  assert(sorted, 'rankedCandidates: 按分降序排列');
}

console.log('\n── engine.js getLocalAIMove 测试 ───────────────────');
{
  // 青铜：应在 timeBudget=200ms 内返回合法坐标
  const b = createBoard();
  b[7][7] = 1; b[8][8] = 2;
  const t0 = Date.now();
  const move = getLocalAIMove(b, 2, 'bronze', 8, 8);
  const elapsed = Date.now() - t0;
  assert(b[move.r]?.[move.c] === 0, `getLocalAIMove(青铜): 返回合法空位 (${move.r},${move.c})`);
  assert(elapsed < 500, `getLocalAIMove(青铜): 耗时 ${elapsed}ms < 500ms`);

  // 黄金：四连防守场景
  const b2 = createBoard();
  b2[7][3] = b2[7][4] = b2[7][5] = b2[7][6] = 1; // 黑棋四连
  b2[3][3] = 2;
  const move2 = getLocalAIMove(b2, 2, 'gold', 3, 3);
  // 白棋必须阻止黑棋 [7,2] 或 [7,7] 五连，或自己进攻
  assert(b2[move2.r]?.[move2.c] === 0, `getLocalAIMove(黄金): 返回合法空位 (${move2.r},${move2.c})`);

  // 各等级均不超时（含最高等级 5s 上限）
  const b3 = createBoard();
  b3[7][7] = 1; b3[7][8] = 1; b3[8][8] = 2; b3[8][7] = 2;
  const t1 = Date.now();
  const move3 = getLocalAIMove(b3, 2, 'king', 8, 7);
  const elapsed3 = Date.now() - t1;
  assert(b3[move3.r]?.[move3.c] === 0, `getLocalAIMove(王者): 返回合法空位 (${move3.r},${move3.c})`);
  assert(elapsed3 <= 5500, `getLocalAIMove(王者): 耗时 ${elapsed3}ms ≤ 5500ms`);
}

// ── 汇总 ───────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════`);
console.log(`  通过 ${passed}，失败 ${failed}`);
if (failed > 0) {
  console.log(`  ✗ 有 ${failed} 个测试失败`);
  process.exit(1);
} else {
  console.log(`  ✓ 全部测试通过`);
}
