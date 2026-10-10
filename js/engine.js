/**
 * 强化搜索引擎
 * 精细棋形识别 + 迭代加深 + 时间预算
 * 所有等级共用，按 rank 配置不同时间预算和候选数
 */

// 棋形权重（基于常见 GOMOKU 评估体系）
const SHAPE_SCORES = {
  five:      1000000,  // 五连
  openFour:   500000,  // 活四（_1111_）
  doubleThree:100000,  // 双活三
  rushFour:   50000,   // 冲四（一端堵）
  jumpFour:   45000,   // 跳四（1_111 或 11_11）
  openThree:  5000,    // 活三
  doubleTwo:  3000,    // 双眠三/双活二
  sleepThree: 300,     // 眠三
  sleepFour:  4000,    // 眠四
  openTwo:    200,     // 活二
  sleepTwo:    30,     // 眠二
  one:         10,
};

// 方向定义
const SEARCH_DIRS = [[0,1],[1,0],[1,1],[1,-1]];

/**
 * 获取该点两侧的棋形信息
 * 返回 {count, open, pattern} 用于分类
 * board[r][c] 假设已放置 player
 */
function analyzeShapeAt(board, r, c, dr, dc, player) {
  const B = BOARD_SIZE;
  // 向正方向统计连续和开放端
  function scan(startR, startC, dr, dc) {
    let count = 1, open = 0, pattern = '';
    let cr = startR + dr, cc = startC + dc;
    // 连续段
    while (cr >= 0 && cr < B && cc >= 0 && cc < B && board[cr][cc] === player) {
      count++; pattern += 'X'; cr += dr; cc += dc;
    }
    // 第一个非本方格
    if (cr >= 0 && cr < B && cc >= 0 && cc < B && board[cr][cc] === EMPTY) {
      open++; pattern += '.'; cr += dr; cc += dc;
      // 跳过的空隙后是否还有同色（跳三/跳四模式）
      if (cr >= 0 && cr < B && cc >= 0 && cc < B && board[cr][cc] === player) {
        let jump = 0;
        while (cr >= 0 && cr < B && cc >= 0 && cc < B && board[cr][cc] === player) {
          jump++; cr += dr; cc += dc;
        }
        if (jump >= 2) {
          // 1_11 或 1_111 跳形
          pattern += 'J';
          // 跳形后面再查开放
          if (cr >= 0 && cr < B && cc >= 0 && cc < B && board[cr][cc] === EMPTY) {
            open++;
          }
        } else if (jump === 1) {
          pattern += 'j';
        }
      }
    }
    return { count, open, pattern };
  }

  const fwd = scan(r, c, dr, dc);
  const bwd = scan(r, c, -dr, -dc);
  const total = fwd.count + bwd.count - 1; // 减去重复的中心
  const totalOpen = fwd.open + bwd.open;

  // 判断棋形类型
  let type = 'one';
  if (total >= 5) type = 'five';
  else if (total === 4) {
    if (totalOpen >= 2) type = 'openFour';
    else if (totalOpen === 1) type = 'rushFour';
    else type = 'sleepFour';
  } else if (total === 3) {
    if (totalOpen >= 2) type = 'openThree';
    else if (totalOpen === 1) type = 'sleepThree';
    else type = 'one';
  } else if (total === 2) {
    if (totalOpen >= 2) type = 'openTwo';
    else if (totalOpen === 1) type = 'sleepTwo';
    else type = 'one';
  }

  return { total, totalOpen, type, fwd, bwd };
}

/**
 * 识别是否有跳四/跳活三模式（1_11 或 _1_1_）
 */
function checkJumpPattern(board, r, c, dr, dc, player) {
  const B = BOARD_SIZE;
  // 1_11：本方-空-本方-本方（跳四）
  // 检查正方向：X_X
  const patterns = [
    // [dr offset, 期望序列]
    [1, 'X.E'],  // 空后接敌/边界 → 跳四（冲四）
    [1, 'X..'],  // 双空 → 跳活三
  ];
  // 简化：直接统计该方向 4 格内的同色数量
  let same = 0;
  for (let k = 1; k <= 4; k++) {
    const nr = r + dr*k, nc = c + dc*k;
    if (nr < 0 || nr >= B || nc < 0 || nc >= B) break;
    if (board[nr][nc] === player) same++;
  }
  for (let k = 1; k <= 4; k++) {
    const nr = r - dr*k, nc = c - dc*k;
    if (nr < 0 || nr >= B || nc < 0 || nc >= B) break;
    if (board[nr][nc] === player) same++;
  }
  // same >= 3 且该点两侧至少有一侧有空格（跳形）
  // 这里用 totalOpen 来区分
  return same;
}

/**
 * 单点评分：假设 player 落在 (r,c)，评估该点对 player 的价值
 * 同时评估防守价值（对手若在此落子会形成什么）
 * 要求 board[r][c] === EMPTY
 */
function pointScore(board, r, c, player) {
  if (board[r][c] !== EMPTY) return 0;
  const opponent = player === BLACK ? WHITE : BLACK;

  let attackScore = 0;
  let defenseScore = 0;
  let openThreeCount = 0;
  let rushFourCount = 0;

  for (const [dr, dc] of SEARCH_DIRS) {
    // 进攻：我放子后形成什么
    board[r][c] = player;
    const aShape = analyzeShapeAt(board, r, c, dr, dc, player);
    board[r][c] = EMPTY;
    attackScore += SHAPE_SCORES[aShape.type] || 0;
    if (aShape.type === 'openThree') openThreeCount++;
    if (aShape.type === 'rushFour') rushFourCount++;

    // 防守：对手若在此落子会形成什么
    board[r][c] = opponent;
    const dShape = analyzeShapeAt(board, r, c, dr, dc, opponent);
    board[r][c] = EMPTY;
    defenseScore += (SHAPE_SCORES[dShape.type] || 0) * 0.9;
    if (dShape.type === 'openThree') openThreeCount++; // 对手双活三威胁
  }

  // 双活三奖励
  if (openThreeCount >= 2) attackScore += SHAPE_SCORES.doubleThree;
  // 双冲四奖励
  if (rushFourCount >= 2) attackScore += SHAPE_SCORES.rushFour;

  return Math.max(attackScore, defenseScore);
}

/**
 * 获取所有候选点并按 pointScore 排序
 * @param {Array} board - 棋盘
 * @param {number} player - 当前要评估的一方
 * @param {number} limit - 最多返回多少个候选
 * @returns {Array} [[r,c, score], ...] 按分降序
 */
function rankedCandidates(board, player, limit = 24) {
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
  const cands = [...set].map(v => [Math.floor(v / BOARD_SIZE), v % BOARD_SIZE]);
  const scored = cands.map(([r, c]) => [r, c, pointScore(board, r, c, player)]);
  scored.sort((a, b) => b[2] - a[2]);
  return scored.slice(0, limit);
}

/**
 * 全局搜索入口（替代原 minimax）
 * 迭代加深 + 时间预算
 * @returns {{r: number, c: number}}
 */
function localBestMove(board, player, rank, lastR, lastC) {
  const opponent = player === BLACK ? WHITE : BLACK;

  // 各等级参数
  const LEVELS = {
    bronze:   { timeBudget: 200,  candidateLimit: 8,  maxDepth: 2, noise: 0.15 },
    silver:   { timeBudget: 400,  candidateLimit: 10, maxDepth: 3, noise: 0.08 },
    gold:     { timeBudget: 800,  candidateLimit: 12, maxDepth: 4, noise: 0.04 },
    platinum: { timeBudget: 1500, candidateLimit: 16, maxDepth: 5, noise: 0.01 },
    diamond:  { timeBudget: 2500, candidateLimit: 20, maxDepth: 6, noise: 0.0  },
    star:     { timeBudget: 4000, candidateLimit: 24, maxDepth: 7, noise: 0.0  },
    king:     { timeBudget: 5000, candidateLimit: 24, maxDepth: 8, noise: 0.0  },
  };
  const cfg = LEVELS[rank] || LEVELS.bronze;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const timeLeft = () => cfg.timeBudget - (now() - t0);

  // 空棋盘或只有1手棋
  let stoneCount = 0;
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c] !== EMPTY) stoneCount++;
  if (stoneCount === 0) return { r: 7, c: 7 };
  if (stoneCount === 1) {
    // 第二手棋：紧挨第一手（常见开局）
    const cands = getCandidates(board, lastR, lastC);
    if (cands.length > 0) return { r: cands[0][0], c: cands[0][1] };
    return { r: 7, c: 7 };
  }

  // ── 迭代加深 ─────────────────────────────────────────────
  // 先快速深度2，拿启发序，再逐层加深到 timeLeft 不足或达到 maxDepth
  let cands = rankedCandidates(board, player, cfg.candidateLimit);
  if (cands.length === 0) cands = [[7,7,0]];

  // 迭代加深：先用低深度排序，再用该顺序继续
  let best = { r: cands[0][0], c: cands[0][1] };

  for (let depth = 2; depth <= cfg.maxDepth; depth++) {
    if (timeLeft() < 150) break; // 剩余时间不够跑一层
    const result = iterativeDeepen(board, cands, player, depth, timeLeft, cfg.noise);
    if (result) {
      best = { r: result.r, c: result.c };
    }
  }

  // 低等级加噪声（让 AI 有时选非最优）
  if (cfg.noise > 0 && cands.length > 1) {
    const n = Math.floor(Math.random() * cands.length * cfg.noise);
    const pick = Math.min(n, cands.length - 1);
    if (pick > 0) best = { r: cands[pick][0], c: cands[pick][1] };
  }

  return best;
}

/**
 * 单层迭代加深（Alpha-Beta + 候选排序）
 * @returns {{r, c} | null} 超时返回 null
 */
function iterativeDeepen(board, cands, player, depth, timeLeft, noise) {
  if (timeLeft() < 50) return null;
  const opponent = player === BLACK ? WHITE : BLACK;
  let bestScore = -Infinity;
  let bestMove = null;

  for (const [r, c, _] of cands) {
    if (timeLeft() < 100) break;
    board[r][c] = player;
    // 立即获胜直接返回
    if (checkWin(board, r, c, player)) {
      board[r][c] = EMPTY;
      return { r, c };
    }
    const score = alphabeta(board, depth - 1, -Infinity, Infinity, false, player, timeLeft);
    board[r][c] = EMPTY;

    // 防守加分
    board[r][c] = opponent;
    const defendWin = checkWin(board, r, c, opponent);
    board[r][c] = EMPTY;
    const finalScore = score + (defendWin ? 500000 : 0);

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMove = { r, c };
    }
  }

  return bestMove;
}

/**
 * Alpha-Beta 搜索（带时间检查）
 * @param {boolean} isMaximizing - true 表示当前层是 player（AI）层
 * @returns {number} 评估分；超时返回当前层 evaluateBoard
 */
function alphabeta(board, depth, alpha, beta, isMaximizing, aiPlayer, timeLeft) {
  const opponent = aiPlayer === BLACK ? WHITE : BLACK;

  if (timeLeft() <= 0) {
    // 超时：返回快速评估（用 pointScore 总和近似）
    let s = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (board[r][c] !== EMPTY) s += (board[r][c] === aiPlayer ? 1 : -1) * 10;
    return s;
  }

  // 检查五连
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

  // 取候选（深度越低候选越多，越需要精确）
  const limit = depth >= 4 ? 8 : 12;
  const cands = rankedCandidates(board, aiPlayer, limit);
  if (cands.length === 0) return 0;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const [r, c, _] of cands) {
      if (timeLeft() <= 0) break;
      board[r][c] = aiPlayer;
      const ev = alphabeta(board, depth - 1, alpha, beta, false, aiPlayer, timeLeft);
      board[r][c] = EMPTY;
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const [r, c, _] of cands) {
      if (timeLeft() <= 0) break;
      board[r][c] = opponent;
      const ev = alphabeta(board, depth - 1, alpha, beta, true, aiPlayer, timeLeft);
      board[r][c] = EMPTY;
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

/**
 * 主接口（供 ai.js 调用，保持向后兼容）
 * 同步版本，纯本地，不含 API
 * @returns {{r: number, c: number}}
 */
function getLocalAIMove(board, player, rank, lastR, lastC) {
  const boardCopy = board.map(row => [...row]);
  return localBestMove(boardCopy, player, rank, lastR, lastC);
}
