/**
 * 五子棋主游戏逻辑
 * - Canvas 渲染
 * - 双人对战 / 人机对战
 * - 悔棋、复盘
 */

// ── 状态 ────────────────────────────────────────────────────
let board = createBoard();
let currentTurn = BLACK;
let gameOver = false;
let gameMode = 'pvp';  // 'pvp' | 'pve'
let selectedRank = 'bronze';
let lastMove = { r: -1, c: -1 };
let moveHistory = [];
let undoStack = [];

// ── Canvas 初始化 ────────────────────────────────────────────
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

// 响应式尺寸
function resizeCanvas() {
  const area = document.querySelector('.board-area');
  const size = Math.min(area.clientWidth - 16, 600);
  canvas.width = size;
  canvas.height = size;
  drawBoard();
}
window.addEventListener('resize', resizeCanvas);

// ── 绘制 ─────────────────────────────────────────────────────
function drawBoard() {
  const W = canvas.width, H = canvas.height;
  const pad = W * 0.06;
  const cell = (W - 2 * pad) / (BOARD_SIZE - 1);

  // 背景
  ctx.fillStyle = '#d4a84b';
  ctx.fillRect(0, 0, W, H);

  // 木纹渐变
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#d4a84b');
  grad.addColorStop(1, '#c89838');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 网格线
  ctx.strokeStyle = '#8b6914';
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const x = pad + i * cell;
    const y = pad + i * cell;
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
  }

  // 星位
  const stars = [[3,3],[3,11],[7,7],[11,3],[11,11]];
  ctx.fillStyle = '#8b6914';
  for (const [r, c] of stars) {
    ctx.beginPath();
    ctx.arc(pad + c * cell, pad + r * cell, cell * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // 棋子
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== EMPTY) drawStone(r, c, board[r][c], cell, pad, r === lastMove.r && c === lastMove.c);
    }
  }
}

function drawStone(r, c, player, cell, pad, isLast) {
  const x = pad + c * cell;
  const y = pad + r * cell;
  const radius = cell * 0.44;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);

  // 渐变
  const grad = ctx.createRadialGradient(x - radius*0.3, y - radius*0.3, radius*0.1, x, y, radius);
  if (player === BLACK) {
    grad.addColorStop(0, '#555');
    grad.addColorStop(1, '#111');
  } else {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#d8ccb8');
  }
  ctx.fillStyle = grad;
  ctx.fill();

  // 边框
  ctx.strokeStyle = player === BLACK ? '#000' : '#a08060';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // 最后一手标记
  if (isLast) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = player === BLACK ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)';
    ctx.fill();
  }
}

// ── 交互 ─────────────────────────────────────────────────────
canvas.addEventListener('click', handleCanvasClick);
canvas.addEventListener('touchend', handleTouch, { passive: false });

function handleCanvasClick(e) {
  if (gameOver || (gameMode === 'pve' && currentTurn === WHITE)) return;
  placeStone(e);
}

function handleTouch(e) {
  e.preventDefault();
  if (gameOver || (gameMode === 'pve' && currentTurn === WHITE)) return;
  const touch = e.changedTouches[0];
  const rect = canvas.getBoundingClientRect();
  const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
  Object.defineProperty(fakeEvent, 'offsetX', { get: () => touch.clientX - rect.left });
  Object.defineProperty(fakeEvent, 'offsetY', { get: () => touch.clientY - rect.top });
  placeStone(fakeEvent);
}

function placeStone(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const pad = canvas.width * 0.06;
  const cell = (canvas.width - 2 * pad) / (BOARD_SIZE - 1);
  const c = Math.round((x - pad) / cell);
  const r = Math.round((y - pad) / cell);

  if (!inBounds(r, c) || board[r][c] !== EMPTY) return;

  makeMove(r, c);
}

function makeMove(r, c) {
  board[r][c] = currentTurn;
  lastMove = { r, c };
  undoStack.push({ r, c, player: currentTurn });
  moveHistory.push({ num: moveHistory.length + 1, r, c, color: currentTurn });

  document.getElementById('moveCounter').textContent = `第 ${moveHistory.length} 手`;

  if (checkWin(board, r, c, currentTurn)) {
    gameOver = true;
    drawBoard();
    showGameEnd(currentTurn);
    return;
  }

  // 检查平局
  if (undoStack.length === BOARD_SIZE * BOARD_SIZE) {
    gameOver = true;
    drawBoard();
    showGameEnd(0); // 平局
    return;
  }

  currentTurn = currentTurn === BLACK ? WHITE : BLACK;
  updateTurnDisplay();
  drawBoard();

  // AI 走棋
  if (gameMode === 'pve' && currentTurn === WHITE && !gameOver) {
    setTimeout(doAIMove, 100);
  }
}

function doAIMove() {
  const turnDisplay = document.getElementById('turnDisplay');
  turnDisplay.textContent = 'AI 思考中…';
  getAIMove(board, WHITE, selectedRank, lastMove.r, lastMove.c).then(({ r, c }) => {
    turnDisplay.textContent = currentTurn === BLACK ? '黑棋' : '白棋';
    makeMove(r, c);
  });
}

// ── UI 更新 ──────────────────────────────────────────────────
function updateTurnDisplay() {
  document.getElementById('turnDisplay').textContent = currentTurn === BLACK ? '黑棋' : '白棋';
}

function showGameEnd(winner) {
  const panel = document.getElementById('statusPanel');
  const title = document.getElementById('statusTitle');
  const body = document.getElementById('statusBody');
  panel.hidden = false;

  if (winner === 0) {
    title.textContent = '平局';
    body.innerHTML = '<p style="color:var(--text2)">棋盘已满，双方平手。</p>';
  } else {
    title.textContent = winner === BLACK ? '黑棋获胜！' : '白棋获胜！';
    const color = winner === BLACK ? '黑棋' : '白棋';
    body.innerHTML = `<p style="color:var(--win);font-size:16px;font-weight:600;margin-bottom:8px">${color}在 ${moveHistory.length} 手后获胜</p>
      <p style="color:var(--text2);font-size:12px">点击「复盘分析」查看AI点评</p>`;
  }
}

// ── 模式切换 ─────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gameMode = btn.dataset.mode;
    document.getElementById('rankSelector').hidden = gameMode !== 'pve';
    document.getElementById('rankRow').hidden = gameMode !== 'pve';
    startNewGame();
  });
});

document.querySelectorAll('.rank-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rank-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRank = btn.dataset.rank;
    document.getElementById('rankDisplay').textContent = RANK_NAMES[selectedRank];
    startNewGame();
  });
});

document.getElementById('btnNewGame').addEventListener('click', startNewGame);
document.getElementById('btnReplay').addEventListener('click', showReplay);
document.getElementById('btnBackToGame').addEventListener('click', () => {
  document.getElementById('replayPanel').hidden = true;
  document.getElementById('statusPanel').hidden = false;
});
document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').hidden = true;
});

// ── 复盘 ─────────────────────────────────────────────────────
async function showReplay() {
  document.getElementById('statusPanel').hidden = true;
  const panel = document.getElementById('replayPanel');
  panel.hidden = false;
  const body = document.getElementById('replayBody');
  body.innerHTML = '<div class="thinking">正在生成复盘分析...</div>';

  const html = await getAIAnalysis(moveHistory, selectedRank,
    moveHistory.length > 0 && checkWinAtLast()
      ? (moveHistory[moveHistory.length-1].color === BLACK ? '黑棋胜' : '白棋胜')
      : '平局'
  );
  body.innerHTML = html;
}

function checkWinAtLast() {
  if (moveHistory.length === 0) return false;
  const last = moveHistory[moveHistory.length - 1];
  return checkWin(board, last.r, last.c, last.color);
}

// ── 悔棋 ─────────────────────────────────────────────────────
function undo() {
  if (undoStack.length === 0 || gameOver) return;
  // 人机模式悔两步（AI + 玩家各一步）
  const steps = gameMode === 'pve' ? 2 : 1;
  for (let i = 0; i < steps && undoStack.length > 0; i++) {
    const m = undoStack.pop();
    board[m.r][m.c] = EMPTY;
    moveHistory.pop();
    currentTurn = m.player;
  }
  lastMove = undoStack.length > 0 ? { r: undoStack[undoStack.length-1].r, c: undoStack[undoStack.length-1].c } : { r: -1, c: -1 };
  updateTurnDisplay();
  document.getElementById('moveCounter').textContent = `第 ${moveHistory.length} 手`;
  document.getElementById('statusPanel').hidden = true;
  drawBoard();
}

// ── 新游戏 ───────────────────────────────────────────────────
function startNewGame() {
  board = createBoard();
  currentTurn = BLACK;
  gameOver = false;
  lastMove = { r: -1, c: -1 };
  moveHistory = [];
  undoStack = [];
  document.getElementById('turnDisplay').textContent = '黑棋';
  document.getElementById('moveCounter').textContent = '第 0 手';
  document.getElementById('statusPanel').hidden = true;
  document.getElementById('replayPanel').hidden = true;
  drawBoard();
}

// ── 启动 ─────────────────────────────────────────────────────
resizeCanvas();
startNewGame();

// ── 悔棋按钮 ──────────────────────────────────────────────────
// 在 sidebar panel 里加悔棋按钮
(function addUndoButton() {
  const modePanel = document.getElementById('modePanel');
  const undoBtn = document.createElement('button');
  undoBtn.className = 'btn btn-secondary';
  undoBtn.style.marginTop = '8px';
  undoBtn.style.width = '100%';
  undoBtn.textContent = '悔棋';
  undoBtn.addEventListener('click', undo);
  modePanel.appendChild(undoBtn);
})();
