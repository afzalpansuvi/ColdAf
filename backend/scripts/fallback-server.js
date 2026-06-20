const http = require('http');
const fs = require('fs');
const PORT = parseInt(process.env.PORT || '4000', 10);
const LOG_FILE = process.env.STARTUP_LOG || '/tmp/backend-startup.log';

http.createServer((req, res) => {
  let log = '';
  try {
    log = fs.readFileSync(LOG_FILE, 'utf8');
  } catch (e) {
    log = '(no startup log captured: ' + e.message + ')';
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 503;
  res.end(
    'BACKEND FALLBACK MODE — main process exited.\n' +
      '================================================\n' +
      'PID=' + process.pid + ' time=' + new Date().toISOString() + '\n' +
      '================================================\n\n' +
      log
  );
}).listen(PORT, () => {
  console.log('[fallback-server] listening on :' + PORT);
});
