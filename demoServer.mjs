// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// —————————————————————————————————
// ① COOP/COEP ヘッダー（既存）
// —————————————————————————————————
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy',  'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  next();
});

// —————————————————————————————————
// ② CORP ヘッダーを静的ファイルに付与
// —————————————————————————————————
app.use((req, res, next) => {
  // 全てのレスポンスに同一オリジンリソースポリシーを付与
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

// —————————————————————————————————
// ③ 静的ファイル配信
// —————————————————————————————————
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));

// —————————————————————————————————
// ④ SPA 用キャッチオール
// —————————————————————————————————
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
