// ============================================================
// API Key 配置区
// 密文由 encryptor.html 生成，在此填入 ENCRYPTED_API_KEY 和 KEY_SHIFT
// ============================================================
const ENCRYPTED_API_KEY = 'zr4\NZpL~h=kj9_]^QtoWkjrtK"RJNZT"z_Pqwno`utq_sKMaS';
const KEY_SHIFT = 7;

function decryptApiKey() {
  if (!ENCRYPTED_API_KEY) return null;
  return ENCRYPTED_API_KEY.split('').map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      return String.fromCharCode(32 + ((code - 32 - KEY_SHIFT + 95) % 95));
    }
    return ch;
  }).join('');
}

window.API_KEY = decryptApiKey();
