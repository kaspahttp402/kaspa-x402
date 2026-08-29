#!/usr/bin/env node
import { addressForKey } from 'kaspa-402';

const cmd = process.argv[2];

async function main(): Promise<void> {
  if (cmd === 'init') {
    const { runInit } = await import('./init.js');
    await runInit();
    return;
  }
  if (cmd === 'address') {
    const key = process.env.KASPA_COMPUTE_PRIVATE_KEY;
    if (!key) {
      console.error('KASPA_COMPUTE_PRIVATE_KEY is not set.');
      process.exit(1);
    }
    const net = process.argv.includes('--testnet') ? 'testnet-10' : 'mainnet';
    console.log(await addressForKey(key, net));
    return;
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log('kaspa-compute-mcp            run the MCP server (stdio) -- used from your MCP client config');
    console.log('kaspa-compute-mcp init       create a wallet + print the config block');
    console.log('kaspa-compute-mcp address    print the address for KASPA_COMPUTE_PRIVATE_KEY');
    return;
  }
  // default: run the stdio MCP server
  const { runServer } = await import('./server.js');
  await runServer();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
