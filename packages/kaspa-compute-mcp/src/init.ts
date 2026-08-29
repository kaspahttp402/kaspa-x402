import { writeFileSync } from 'node:fs';
import { generateWallet } from 'kaspa-x402';

const GATEWAY = process.env.KASPA_COMPUTE_GATEWAY ?? 'https://kaspai.win';

export async function runInit(): Promise<void> {
  const network = process.argv.includes('--testnet') ? 'testnet-10' : 'mainnet';
  const wallet = await generateWallet(network);
  const bar = '='.repeat(70);

  console.log(`\n${bar}`);
  console.log('  New Kaspa wallet for kaspa-compute-mcp');
  console.log(bar);
  console.log(`\n  Address (fund this with a little KAS):\n\n    ${wallet.address}\n`);
  console.log('  Private key (keep secret -- this wallet only holds spending money):\n');
  console.log(`    ${wallet.privateKey}\n`);
  console.log(bar);
  console.log('  Add this to your MCP client config (Claude Desktop, Cursor, Cline, ...):\n');
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          'kaspa-compute': {
            command: 'npx',
            args: ['-y', 'kaspa-compute-mcp'],
            env: {
              KASPA_COMPUTE_GATEWAY: GATEWAY,
              KASPA_COMPUTE_PRIVATE_KEY: wallet.privateKey,
              KASPA_COMPUTE_MAX_SPEND_KAS: '1',
            },
          },
        },
      },
      null,
      2
    )
  );
  console.log(`\n${bar}`);
  console.log('  1. Fund the address above (buy KAS on any exchange, withdraw a few KAS).');
  console.log('  2. Paste the block into your MCP client config, restart the client.');
  console.log('  3. Ask your agent to use the kaspa_compute tool.\n');

  try {
    writeFileSync('kaspa-compute-wallet.json', JSON.stringify(wallet, null, 2) + '\n', { mode: 0o600 });
    console.log('  (also saved to ./kaspa-compute-wallet.json)\n');
  } catch {
    /* printing it is enough */
  }
}
