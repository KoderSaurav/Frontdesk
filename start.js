const { spawn } = require('child_process');
const path = require('path');

console.log('[Runner] Starting Frontdesk backend and frontend services...\n');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

// 1. Start Backend
const backend = spawn('node', ['dist/server.js'], {
  cwd: backendDir,
  env: { ...process.env, PORT: '5000', NODE_ENV: 'development' },
  stdio: 'inherit',
  shell: true,
});

backend.on('error', (err) => {
  console.error('[Error] Backend failed to start:', err);
});

// 2. Start Frontend
const frontend = spawn('npx', ['vite', '--port', '5173'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
});

frontend.on('error', (err) => {
  console.error('[Error] Frontend failed to start:', err);
});

process.on('SIGINT', () => {
  console.log('\n[Runner] Stopping services...');
  backend.kill();
  frontend.kill();
  process.exit(0);
});
