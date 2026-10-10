/**
 * AI 引擎 — 七级难度（青铜→王者）
 * 核心：基于评分函数 + Minimax Alpha-Beta 剪枝
 */
const BOARD_SIZE = 15;
const EMPTY = 0, BLACK = 1, WHITE = 2;

const RANK_NAMES = {
  bronze: '青铜', silver: '白银', gold: '黄金',
  platinum: '铂金', diamond: '钻石', star: '星耀', king: '王者'
};

// 各难度参数：搜索深度、随机扰动概率、评估偏差
const RANK_CONFIG = {
  bronze:   { depth: 1, randomProb: 0.40, evalNoise: 300 },
  silver:   { depth: 1, randomProb: 0.20, evalNoise: 200 },
  gold:     { depth: 2, randomProb: 0.10, evalNoise: 120 },
  platinum: { depth: 2, randomProb: 0.04, evalNoise: 60  },
  diamond:  { depth: 3, randomProb: 0.02, evalNoise: 30  },
  star:     { depth: 4, randomProb: 0.01, evalNoise: 10  },
  king:     { depth: 5, randomProb: 0.00, evalNoise: 0   },
};

// ── 棋盘操作 ────────────────────────────────────────────────
function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function getNeighbors(board, r, c, range = 2) {
  const cells = [];
  for (let dr = -range; dr <= range; dr++) {
    for (let dc = -range; dc <= range; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] !== EMPTY) cells.push([nr, nc]);
    }
  }
  return cells;
}

function getCandidates(board, lastR, lastC) {
  // 首手或空棋盘
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c] !== EMPTY) count++;
  if (count === 0) return [[7, 7]];
  if (count === 1 && lastR === -1) return [[7, 7]];

  const candidates = new Set();
  const range = lastR >= 0 ? 2 : 1;
  const startR = Math.max(0, lastR - range);
  const endR = Math.min(BOARD_SIZE - 1, lastR + range);
  const startC = Math.max(0, lastC - range);
  const endC = Math.min(BOARD_SIZE - 1, lastC + range);

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      if (board[r][c] === EMPTY) {
        // 检查是否有邻居
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && board[nr][nc] !== EMPTY) {
              candidates.add(r * BOARD_SIZE + c);
            }
          }
        }
      }
    }
  }
  // 若没有候选（被包围），返回空棋盘中心附近
  if (candidates.size === 0) return [[7, 7]];
  return [...candidates].map(v => [Math.floor(v / BOARD_SIZE), v % BOARD_SIZE]);
}

// ── 胜负判断 ────────────────────────────────────────────────
const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

function checkWin(board, r, c, player) {
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let k = 1; k < 5; k++) {
      const nr = r + dr * k, nc = c + dc * k;
      if (!inBounds(nr, nc) || board[nr][nc] !== player) break;
      count++;
    }
    for (let k = 1; k < 5; k++) {
      const nr = r - dr * k, nc = c - dc * k;
      if (!inBounds(nr, nc) || board[nr][nc] !== player) break;
      count++;
    }
    if (count >= 5) return true;
  }
  return false;
}

function getWinLine(board, r, c, player) {
  for (const [dr, dc] of DIRS) {
    const line = [[r, c]];
    for (let k = 1; k < 5; k++) {
      const nr = r + dr * k, nc = c + dc * k;
      if (!inBounds(nr, nc) || board[nr][nc] !== player) break;
      line.push([nr, nc]);
    }
    for (let k = 1; k < 5; k++) {
      const nr = r - dr * k, nc = c - dc * k;
      if (!inBounds(nr, nc) || board[nr][nc] !== player) break;
      line.push([nr, nc]);
    }
    if (line.length >= 5) return line;
  }
  return null;
}

// ── 评分函数 ────────────────────────────────────────────────
function scoreLine(segments) {
  // segments: array of consecutive counts for one player
  let score = 0;
  for (const len of segments) {
    if (len >= 5) score += 1000000;
    else if (len === 4) score += 100000;
    else if (len === 3) score += 10000;
    else if (len === 2) score += 1000;
    else if (len === 1) score += 100;
  }
  return score;
}

function evaluateBoard(board, player) {
  const opponent = player === BLACK ? WHITE : BLACK;
  let totalScore = 0;

  // 方向：横、竖、两对角线
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];

  for (const [dr, dc] of dirs) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === EMPTY) continue;
        // 只从每个方向的起始位置开始统计
        const pr = r - dr, pc = c - dc;
        if (inBounds(pr, pc) && board[pr][pc] === board[r][c]) continue;

        let count = 0;
        let openEnds = 0;
        for (let k = 0; k < 5; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (!inBounds(nr, nc)) break;
          if (board[nr][nc] === board[r][c]) {
            count++;
          } else {
            if (board[nr][nc] === EMPTY) openEnds++;
            break;
          }
        }
        const isPlayer = board[r][c] === player;
        const base = isPlayer ? 1 : -1;
        totalScore += base * count * 10 * (1 + openEnds);
      }
    }
  }

  // 特殊形状加分
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== player) continue;
      // 活四
      for (const [dr, dc] of DIRS) {
        const line = getConsecutive(board, r, c, dr, dc, player);
        if (line.count >= 4 && line.open >= 2) totalScore += 50000;
        if (line.count >= 5) totalScore += 1000000;
      }
    }
  }

  return totalScore;
}

function getConsecutive(board, r, c, dr, dc, player) {
  let count = 1, open = 0;
  // forward
  for (let k = 1; k < 5; k++) {
    const nr = r + dr * k, nc = c + dc * k;
    if (!inBounds(nr, nc)) break;
    if (board[nr][nc] === player) count++;
    else { if (board[nr][nc] === EMPTY) open++; break; }
  }
  // backward
  for (let k = 1; k < 5; k++) {
    const nr = r - dr * k, nc = c - dc * k;
    if (!inBounds(nr, nc)) break;
    if (board[nr][nc] === player) count++;
    else { if (board[nr][nc] === EMPTY) open++; break; }
  }
  return { count, open };
}

// ── Minimax + Alpha-Beta ────────────────────────────────────
function minimax(board, depth, alpha, beta, isMaximizing, aiPlayer) {
  const opponent = aiPlayer === BLACK ? WHITE : BLACK;

  // 检查是否已有五连
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === EMPTY) continue;
      if (checkWin(board, r, c, board[r][c])) {
        return board[r][c] === aiPlayer ? 10000000 : -10000000;
      }
    }
  }

  if (depth === 0) {
    return evaluateBoard(board, aiPlayer);
  }

  const candidates = getCandidatesForSearch(board);
  if (candidates.length === 0) return 0;

  // 排序：优先检查高分候选
  candidates.sort((a, b) => scoreMove(board, b[0], b[1], aiPlayer) - scoreMove(board, a[0], a[1], aiPlayer));
  const limited = candidates.slice(0, Math.min(12, candidates.length));

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const [r, c] of limited) {
      board[r][c] = aiPlayer;
      const ev = minimax(board, depth - 1, alpha, beta, false, aiPlayer);
      board[r][c] = EMPTY;
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const [r, c] of limited) {
      board[r][c] = opponent;
      const ev = minimax(board, depth - 1, alpha, beta, true, aiPlayer);
      board[r][c] = EMPTY;
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function scoreMove(board, r, c, player) {
  if (board[r][c] !== EMPTY) return -1;
  let score = 0;
  for (const [dr, dc] of DIRS) {
    // simulate placement
    board[r][c] = player;
    const info = getConsecutive(board, r, c, dr, dc, player);
    score += info.count * 10 + info.open * 5;
    if (info.count >= 5) score += 1000000;
    if (info.count === 4 && info.open >= 2) score += 50000;
    board[r][c] = EMPTY;
  }
  return score;
}

function getCandidatesForSearch(board) {
  const set = new Set();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== EMPTY) {
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
              set.add(nr * BOARD_SIZE + nc);
            }
          }
        }
      }
    }
  }
  return [...set].map(v => [Math.floor(v / BOARD_SIZE), v % BOARD_SIZE]);
}

// ── 主 AI 接口 ──────────────────────────────────────────────
function getBestMove(board, player, rank, lastR, lastC) {
  const config = RANK_CONFIG[rank] || RANK_CONFIG.bronze;

  // 青铜有概率随机落子
  if (Math.random() < config.randomProb) {
    const candidates = getCandidates(board, lastR, lastC);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ── 全局扫描：检查 AI 自己能否立即五连获胜 ─────────────────
  // 不能只查邻域候选，胜负落子可能在较远位置
  const globalCandidates = getCandidatesForSearch(board);
  for (const [r, c] of globalCandidates) {
    board[r][c] = player;
    if (checkWin(board, r, c, player)) {
      board[r][c] = EMPTY;
      return [r, c];
    }
    board[r][c] = EMPTY;
  }

  // ── 全局扫描：检查玩家能否立即五连，必须优先防守 ─────────
  const opponent = player === BLACK ? WHITE : BLACK;
  for (const [r, c] of globalCandidates) {
    board[r][c] = opponent;
    if (checkWin(board, r, c, opponent)) {
      board[r][c] = EMPTY;
      // 玩家可在此处获胜，AI 必须阻挡（占此点）
      return [r, c];
    }
    board[r][c] = EMPTY;
  }

  const candidates = getCandidates(board, lastR, lastC);
  if (candidates.length === 0) return [7, 7];

  let bestScore = -Infinity;
  let bestMove = candidates[0];

  // 排序候选
  candidates.sort((a, b) => scoreMove(board, b[0], b[1], player) - scoreMove(board, a[0], a[1], player));
  const limited = candidates.slice(0, Math.min(20, candidates.length));

  for (const [r, c] of limited) {
    board[r][c] = player;
    const score = minimax(board, config.depth - 1, -Infinity, Infinity, false, player);
    board[r][c] = EMPTY;

    // 对方若在该点可立即获胜，需防守加分
    board[r][c] = opponent;
    const defendWin = checkWin(board, r, c, opponent);
    board[r][c] = EMPTY;
    if (defendWin) score += 500000;

    // add noise for lower ranks
    const noise = (Math.random() - 0.5) * 2 * config.evalNoise;

    if (score + noise > bestScore) {
      bestScore = score + noise;
      bestMove = [r, c];
    }
  }

  return bestMove;
}

function getAIMove(board, player, rank, lastR, lastC) {
  // 前三级（青铜/白银/黄金）：纯本地加强算法
  // 后四级（铂金/钻石/星耀/王者）：本地 + API 混合
  if (['platinum', 'diamond', 'star', 'king'].includes(rank)) {
    // 异步混合引擎（API 失败自动降级本地）
    // 这里返回 Promise；game.js 需 await
    return getHybridAIMove(board, player, rank, lastR, lastC);
  }
  // 前三级同步本地
  const boardCopy = board.map(row => [...row]);
  return Promise.resolve(getLocalAIMove(boardCopy, player, rank, lastR, lastC));
}
