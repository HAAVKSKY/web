/**
 * 复盘分析模块
 * 离线评分 + API 增强分析
 */

// DIRS 和 inBounds 复用 ai.js 中已声明的全局变量（index.html 先加载 ai.js）

function evaluateMove(board, r, c, player) {
  if (board[r][c] !== 0) return 0;
  let score = 0;
  for (const [dr, dc] of DIRS) {
    let count = 0, open = 0;
    for (let k = 1; k <= 4; k++) {
      const nr = r+dr*k, nc = c+dc*k;
      if (!inBounds(nr,nc)) break;
      if (board[nr][nc] === player) count++;
      else { if (board[nr][nc] === 0) open++; break; }
    }
    for (let k = 1; k <= 4; k++) {
      const nr = r-dr*k, nc = c-dc*k;
      if (!inBounds(nr,nc)) break;
      if (board[nr][nc] === player) count++;
      else { if (board[nr][nc] === 0) open++; break; }
    }
    if (count >= 4) score += 50000;
    else if (count === 3 && open >= 2) score += 10000;
    else if (count === 3 && open === 1) score += 1000;
    else if (count === 2 && open >= 2) score += 500;
    else if (count === 2 && open === 1) score += 100;
    else if (count === 1) score += 10;
  }
  return score;
}

function analyzeBoard(board, moveNum, r, c, player) {
  const opponent = player === 1 ? 2 : 1;
  let isWin = false;
  for (const [dr, dc] of DIRS) {
    let count = 1;
    for (let k = 1; k < 5; k++) {
      const nr = r+dr*k, nc = c+dc*k;
      if (!inBounds(nr,nc) || board[nr][nc] !== player) break;
      count++;
    }
    for (let k = 1; k < 5; k++) {
      const nr = r-dr*k, nc = c-dc*k;
      if (!inBounds(nr,nc) || board[nr][nc] !== player) break;
      count++;
    }
    if (count >= 5) isWin = true;
  }
  if (isWin) {
    return [{ type: 'win', text: `第${moveNum}手形成五连，是胜利的一手！` }];
  }
  // 临时清空当前落子点，evaluateMove 要求该格为空（模拟"落子前的棋形价值"）
  const saved = board[r][c];
  board[r][c] = 0;
  const attackScore = evaluateMove(board, r, c, player);
  const defendScore = evaluateMove(board, r, c, opponent);
  board[r][c] = saved;

  if (attackScore >= 50000) {
    return [{ type: 'good', text: `第${moveNum}手非常强力，形成活四或冲四威胁！` }];
  } else if (attackScore >= 180) {
    return [{ type: 'good', text: `第${moveNum}手是积极的一手，棋形良好。` }];
  } else if (defendScore > attackScore * 1.5 && defendScore >= 100) {
    return [{ type: 'normal', text: `第${moveNum}手偏防守，可以考虑更积极的走法。` }];
  } else if (attackScore < 30 && moveNum > 10) {
    return [{ type: 'blunder', text: `第${moveNum}手较软，错过了更好的进攻机会。` }];
  } else {
    return [{ type: 'normal', text: `第${moveNum}手正常落子。` }];
  }
}

async function getAIAnalysis(moveHistory, rank, result) {
  const apiKey = window.API_KEY;
  if (!apiKey) return generateLocalAnalysis(moveHistory, rank, result);
  try {
    const response = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'agnes-2.5-flash',
        messages: [
          {
            role: 'system',
            content: '你是一位专业的五子棋教练。分析对局记录并给出复盘点评。棋盘15x15，坐标从0开始。请给出：1) 关键着法点评 2) 失误指出 3) 改进建议。用中文回复，简洁专业，不超过300字。'
          },
          {
            role: 'user',
            content: buildAnalysisPrompt(moveHistory, rank, result)
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    if (!response.ok) throw new Error('API error');
    const data = await response.json();
    return `<div style="white-space:pre-wrap;color:var(--text2);font-size:13px;line-height:1.8">${escapeHtml(data.choices?.[0]?.message?.content || '分析完成')}</div>`;
  } catch (e) {
    console.warn('API分析失败，使用本地分析:', e);
    return generateLocalAnalysis(moveHistory, rank, result);
  }
}

function buildAnalysisPrompt(moveHistory, rank, result) {
  let prompt = `对局等级：${rank}，结果：${result}\n\n落子记录（每行：手号 颜色 坐标）：\n`;
  for (const m of moveHistory) {
    prompt += `${m.num}. ${m.color === 1 ? '黑' : '白'} (${m.r},${m.c})\n`;
  }
  return prompt;
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function generateLocalAnalysis(moveHistory, rank, result) {
  let lines = [`<div class="replay-entry win"><span class="replay-num">—</span><span class="replay-text">${result}</span></div>`];
  let blunders = 0, goods = 0;
  for (let i = 0; i < moveHistory.length; i++) {
    const m = moveHistory[i];
    const b = Array.from({length:15}, () => Array(15).fill(0));
    for (let j = 0; j <= i; j++) b[moveHistory[j].r][moveHistory[j].c] = moveHistory[j].color;
    const analysis = analyzeBoard(b, m.num, m.r, m.c, m.color);
    for (const a of analysis) {
      if (a.type === 'blunder') blunders++;
      if (a.type === 'good') goods++;
      lines.push(`<div class="replay-entry ${a.type}"><span class="replay-num">${m.num}</span><span class="replay-text">${a.text}</span></div>`);
    }
  }
  lines.push(`<div class="replay-entry normal"><span class="replay-num">★</span><span class="replay-text">本局共${moveHistory.length}手，亮点${goods}处，软着${blunders}处。</span></div>`);
  return lines.join('');
}
