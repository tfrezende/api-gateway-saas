import { execSync } from 'child_process';

export default function globalSetup() {
  try {
    execSync('docker start gateway-redis', { stdio: 'ignore' });
  } catch {
    execSync(
      'docker run -d --name gateway-redis -p 6379:6379 redis:7.2-alpine',
      { stdio: 'ignore' },
    );
  }
}
