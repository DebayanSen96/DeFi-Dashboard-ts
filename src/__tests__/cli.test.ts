import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI', () => {
  const runCLI = async (args: string) => {
    const command = `npx ts-node src/index.ts ${args}`;
    const { stdout, stderr } = await execAsync(command);
    return { stdout, stderr };
  };

  it('should show help when no arguments provided', async () => {
    const { stdout } = await runCLI('--help');
    expect(stdout).toContain('Usage: defi-dashboard');
    expect(stdout).toContain('CLI for DeFi Portfolio Dashboard');
  });

  it('should show help for positions command', async () => {
    const { stdout } = await runCLI('positions --help');
    expect(stdout).toContain('Fetch DeFi positions for a wallet');
    expect(stdout).toContain('--chain <chain>');
    expect(stdout).toContain('--protocols <protocols>');
  });

  it('should show help for server command', async () => {
    const { stdout } = await runCLI('server --help');
    expect(stdout).toContain('Start the DeFi Dashboard API server');
    expect(stdout).toContain('--port <port>');
  });
});
