import { spawn } from 'child_process';

console.log('[Dev Runner] Avvio del server WebSocket e del server di sviluppo Vite...');

const isWin = process.platform === 'win32';
const serverProcess = spawn('npx', ['tsx', 'server.ts'], { stdio: 'inherit', shell: isWin });
const viteProcess = spawn('npx', ['vite', '--host'], { stdio: 'inherit', shell: isWin });

function cleanup() {
  console.log('[Dev Runner] Chiusura dei processi in corso...');
  serverProcess.kill();
  viteProcess.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

serverProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Dev Runner] Il server WebSocket è terminato con codice ${code}`);
  }
  viteProcess.kill();
  process.exit(code || 0);
});

viteProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[Dev Runner] Vite è terminato con codice ${code}`);
  }
  serverProcess.kill();
  process.exit(code || 0);
});
