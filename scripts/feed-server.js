"use strict";

/**
 * 本地更新源服务器(开发用):把 release/ 目录当静态更新源,支持 Range 请求。
 * 用法: node scripts/feed-server.js [端口] [目录]
 *   node scripts/feed-server.js 8765
 * 之后把 http://127.0.0.1:8765 写入 %APPDATA%\DeepSeek Harness\update-url.txt,
 * 重启桌面应用即可验证自动更新(鲸鱼页进度条 → 静默安装 → 自动重启)。
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.argv[2] || 8765);
const root = path.resolve(process.argv[3] || path.join(__dirname, "..", "release"));

const MIME = {
  ".exe": "application/octet-stream",
  ".yml": "application/octet-stream",
  ".yaml": "application/octet-stream",
  ".zip": "application/octet-stream",
  ".blockmap": "application/octet-stream",
  ".json": "application/json",
  ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end("not found: " + urlPath); return; }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const range = req.headers.range;
    res.setHeader("Content-Type", type);
    res.setHeader("Accept-Ranges", "bytes");

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] === "" ? st.size - Number(m[2]) : Number(m[1]);
        let end = m[2] === "" ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
        if (start >= st.size || start > end) { res.writeHead(416); res.end(); return; }
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${st.size}`,
          "Content-Length": end - start + 1,
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, { "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[feed-server] http://127.0.0.1:${port} -> ${root}`);
});
