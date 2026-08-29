import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { requestCompute } from 'kaspa-x402';

const GATEWAY = process.env.KASPA_COMPUTE_GATEWAY ?? 'https://kaspai.win';
const KEY = process.env.KASPA_COMPUTE_PRIVATE_KEY ?? '';
const RPC_URL = process.env.KASPA_COMPUTE_RPC_URL || undefined;
const MAX_SPEND_KAS = Number(process.env.KASPA_COMPUTE_MAX_SPEND_KAS ?? '1');

let spentSompi = 0n;

const NOT_CONFIGURED =
  'No wallet configured. Run `npx kaspa-compute-mcp init` to create one, fund it with a little KAS, ' +
  'then set KASPA_COMPUTE_PRIVATE_KEY in this server\'s config and restart.';

export async function runServer(): Promise<void> {
  const server = new McpServer({ name: 'kaspa-compute', version: '0.1.0' });

  server.registerTool(
    'kaspa_compute',
    {
      description:
        'Run an AI compute task, paying per call in Kaspa (KAS) over HTTP 402 -- no API key needed. ' +
        'Each call broadcasts a real Kaspa transaction from your configured wallet and costs a fraction of a cent.',
      inputSchema: {
        prompt: z.string().min(1).max(8000),
        model: z.enum(['kaspa-fast-1', 'kaspa-reasoning-1']).optional(),
        maxTokens: z.number().int().positive().max(4096).optional(),
      },
    },
    async ({ prompt, model, maxTokens }) => {
      if (!KEY) return { isError: true, content: [{ type: 'text', text: NOT_CONFIGURED }] };
      const capSompi = BigInt(Math.round(MAX_SPEND_KAS * 1e8));
      if (spentSompi >= capSompi) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Per-session spend cap of ${MAX_SPEND_KAS} KAS reached. Restart to reset, or raise KASPA_COMPUTE_MAX_SPEND_KAS.` }],
        };
      }
      try {
        const outcome = await requestCompute(GATEWAY, { prompt, model, maxTokens }, {
          privateKey: KEY,
          rpcUrl: RPC_URL,
          clientKind: 'mcp',
        });
        spentSompi += BigInt(outcome.payment.amountSompi);
        const paidKas = (Number(outcome.payment.amountSompi) / 1e8).toFixed(6);
        return {
          content: [
            { type: 'text', text: outcome.result.output.text },
            { type: 'text', text: `— paid ${paidKas} KAS · txid ${outcome.txid} · ${outcome.result.usage.totalTokens} tokens` },
          ],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: `kaspa_compute failed: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  await server.connect(new StdioServerTransport());
}
