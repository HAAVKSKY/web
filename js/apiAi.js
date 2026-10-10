/**
 * API AI 辅助模块
 * 中两级（铂金/钻石）：top-3 候选 + API 3选1
 * 后两级（星耀/王者）：全局面 + API 求最佳，失败降级本地深搜
 */

const API_URL = 'https://apihub.agnes-ai.com/v1/chat/completions';
const API_MODEL = 'agnes-2.5-flash';

/**
 * 将棋盘序列化为紧凑字符串（15×15，. X O）
 */
function boardToString(board, aiPlayer) {
  const opp = aiPlayer === BLACK ? WHITE : BLACK;
  const lines = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    let row = '';
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === EMPTY) row += '.';
      else if (board[r][c] === aiPlayer) row += 'X';
      else row += 'O';
    }
    lines.push(row);
  }
  return lines.join('\n');
}

/**
 * 构造 system + user prompt
 * @param {string} boardStr
 * @param {'top3'|'full'} mode - top3 时 boardStr 后附候选列表
 * @param {Array} top3 - [[r,c], ...] 或 []
 */
function buildAiMovePrompt(boardStr, mode, top3, aiPlayer) {
  const aiColor = aiPlayer === BLACK ? 'X' : 'O';
  let sys = '你是五子棋引擎。棋盘 15x15，X 和 O 各执子，目标是先连成五子。' +
            `AI 执 ${aiColor}，请给出 AI 的最优落子坐标。` +
            `只输出一行：行,列（数字，0-14）。不输出任何其他文字。`;

  let user = `棋局（每行15字符，. 空 X/O 棋子）：\n${boardStr}`;
  if (mode === 'top3' && top3.length > 0) {
    user += `\n\n候选（本地引擎 Top-${top3.length}）：\n` +
            top3.map(([r, c]) => `${r},${c}`).join('\n') +
            `\n请从以上候选中选出最优一个，只输出 行,列。`;
  } else {
    user += `\n请给出 AI 的最优落子，只输出 行,列。`;
  }
  return { sys, user };
}

/**
 * 解析 API 响应中的坐标
 * @returns {{r: number, c: number} | null}
 */
function parseApiCoord(text, board, aiPlayer) {
  if (!text) return null;
  // 匹配第一个 "数字,数字" 模式
  const m = text.match(/\b(\d+)\s*[,\s]\s*(\d+)\b/);
  if (!m) return null;
  const r = parseInt(m[1], 10);
  const c = parseInt(m[2], 10);
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
  if (board[r][c] !== EMPTY) return null;
  return { r, c };
}

/**
 * 调用 API，带超时控制
 * @param {Array} board
 * @param {number} aiPlayer
 * @param {'top3'|'full'} mode
 * @param {Array} top3
 * @param {number} timeoutMs
 * @returns {Promise<{r, c} | null>}
 */
async function getApiMove(board, aiPlayer, mode, top3, timeoutMs) {
  const apiKey = window.API_KEY;
  if (!apiKey) return null;

  const boardStr = boardToString(board, aiPlayer);
  const { sys, user } = buildAiMovePrompt(boardStr, mode, top3, aiPlayer);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: API_MODEL,
        messages: [
          { role: 'system', content: sys },
          { role: 'user',   content: user },
        ],
        temperature: 0.1,
        max_tokens: 10,
        stop: ['\n'],
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return parseApiCoord(text, board, aiPlayer);
  } catch (e) {
    console.warn('[apiAi] API 调用失败，降级本地搜索:', e.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 主接口（供 ai.js 调用）
 * @returns {Promise<{r, c}>} 保证一定返回合法坐标
 */
async function getHybridAIMove(board, player, rank, lastR, lastC) {
  const timeoutByRank = { platinum: 3000, diamond: 4000, star: 6000, king: 8000 };
  const timeoutMs = timeoutByRank[rank] || 3000;

  let move = null;

  if (rank === 'platinum' || rank === 'diamond') {
    // top-3 候选模式：先跑本地拿到 top3，再让 API 3选1
    const localTop = rankedCandidates(board, player, 3).map(([r, c]) => [r, c]);
    move = await getApiMove(board, player, 'top3', localTop, timeoutMs);
    if (!move && localTop.length > 0) {
      // API 失败取本地最优
      move = { r: localTop[0][0], c: localTop[0][1] };
    }
  } else {
    // 全局面模式（star/king）
    move = await getApiMove(board, player, 'full', [], timeoutMs);
  }

  // API 失败或返回非法坐标 → 降级本地深搜
  if (!move || board[move.r]?.[move.c] !== EMPTY) {
    move = getLocalAIMove(board, player, rank, lastR, lastC);
  }

  return move;
}
