/**
 * Minimal MCP (Model Context Protocol) server exposed at `/api/poke/mcp`.
 *
 * Poke connects third-party services by calling an MCP server URL
 * (https://poke.com/docs/mcp-servers), so this is the documented way for Poke
 * to *read* run data and *write* new runs — the ingestion half of the
 * integration, mirroring the outbound coaching messages in `adapters/pokeAi.ts`.
 *
 * Only the JSON-RPC methods MCP clients need for tool use are implemented:
 * `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
 */
import type { ActivityService } from '../services/activityService.js';
import type { RunCommandService } from '../services/runCommandService.js';
import type { RunStore } from '../services/store.js';
import { isCoachMode } from '../../shared/types.js';
import type { LeaderboardMetric } from '../../shared/types.js';

export const MCP_PATH = '/api/poke/mcp';
const PROTOCOL_VERSION = '2024-11-05';

export interface McpDeps {
  store: RunStore;
  activities: ActivityService;
  commands: RunCommandService;
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const TOOLS = [
  {
    name: 'get_leaderboard',
    description: 'Ranked runners with distance, pace, roast and bet totals.',
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['distance', 'pace', 'roasts'], description: 'Ranking metric.' },
        days: { type: 'number', description: 'Only count runs from the last N days.' },
      },
    },
  },
  {
    name: 'list_recent_runs',
    description: 'Recent completed runs, newest first, optionally for one runner.',
    inputSchema: {
      type: 'object',
      properties: {
        runnerName: { type: 'string' },
        limit: { type: 'number', description: 'Default 10, max 50.' },
      },
    },
  },
  {
    name: 'get_runner_summary',
    description: 'Totals, best pace and recent runs for a single runner.',
    inputSchema: {
      type: 'object',
      properties: { runnerName: { type: 'string' } },
      required: ['runnerName'],
    },
  },
  {
    name: 'log_run',
    description: 'Record a completed run so it appears on the leaderboard.',
    inputSchema: {
      type: 'object',
      properties: {
        runnerName: { type: 'string' },
        distanceKm: { type: 'number' },
        durationSec: { type: 'number' },
        name: { type: 'string' },
        startedAt: { type: 'string', description: 'ISO 8601 timestamp; defaults to now.' },
      },
      required: ['runnerName', 'distanceKm', 'durationSec'],
    },
  },
  {
    name: 'run_command',
    description:
      'Handle a natural-language coaching command such as "start my run", "stop my run" or ' +
      '"roast me". Returns a reply to relay plus a web app URL: the runner must tap once in the ' +
      'browser before audio can play, because browsers block audio without a user gesture.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: "The runner's message, verbatim." },
        runnerName: { type: 'string', description: 'Overrides the runner named in the text.' },
        targetPaceSecPerKm: { type: 'number', description: 'Target pace in seconds per km.' },
        coachMode: { type: 'string', enum: ['roast', 'drill'] },
        conversationId: { type: 'string' },
        idempotencyKey: {
          type: 'string',
          description: 'Repeat calls with the same key return the original command.',
        },
      },
      required: ['text'],
    },
  },
] as const;

const ok = (id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id: id ?? null,
  result,
});

const fail = (id: JsonRpcResponse['id'], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
});

/** MCP tool results are content blocks; JSON is returned as text for portability. */
const toolResult = (payload: unknown, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  isError,
});

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const numeric = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

async function callTool(
  name: string,
  args: Record<string, unknown>,
  deps: McpDeps,
): Promise<ReturnType<typeof toolResult>> {
  switch (name) {
    case 'get_leaderboard': {
      const metric = (str(args.metric) ?? 'distance') as LeaderboardMetric;
      if (metric !== 'distance' && metric !== 'pace' && metric !== 'roasts') {
        return toolResult({ error: "metric must be 'distance', 'pace' or 'roasts'" }, true);
      }
      const days = numeric(args.days);
      const sinceMs = days === undefined ? undefined : Date.now() - days * 86_400_000;
      return toolResult({ metric, entries: deps.activities.leaderboard(metric, sinceMs) });
    }

    case 'list_recent_runs': {
      const runnerName = str(args.runnerName);
      const limit = Math.min(50, Math.max(1, Math.round(numeric(args.limit) ?? 10)));
      const runs = deps.store
        .listActivities()
        .filter((activity) => !runnerName || activity.runnerName === runnerName)
        .slice(0, limit);
      return toolResult({ runs });
    }

    case 'get_runner_summary': {
      const runnerName = str(args.runnerName);
      if (!runnerName) return toolResult({ error: 'runnerName is required' }, true);
      const entry = deps.activities
        .leaderboard('distance')
        .find((item) => item.runnerName.toLowerCase() === runnerName.toLowerCase());
      if (!entry) return toolResult({ error: `no runner named ${runnerName}` }, true);
      const runs = deps.store
        .listActivities()
        .filter((activity) => activity.runnerName === entry.runnerName)
        .slice(0, 10);
      return toolResult({ summary: entry, recentRuns: runs });
    }

    case 'log_run': {
      const runnerName = str(args.runnerName);
      const distanceKm = numeric(args.distanceKm);
      const durationSec = numeric(args.durationSec);
      if (!runnerName) return toolResult({ error: 'runnerName is required' }, true);
      if (distanceKm === undefined || distanceKm <= 0) {
        return toolResult({ error: 'distanceKm must be a positive number' }, true);
      }
      if (durationSec === undefined || durationSec <= 0) {
        return toolResult({ error: 'durationSec must be a positive number' }, true);
      }
      const activity = deps.activities.record({
        runnerName,
        distanceKm,
        durationSec,
        name: str(args.name) ?? 'Run logged via Poke',
        source: 'poke',
        startedAt: str(args.startedAt),
      });
      return toolResult({ activity });
    }

    case 'run_command': {
      const text = str(args.text);
      if (!text) return toolResult({ error: 'text is required' }, true);
      const mode = str(args.coachMode);
      if (mode !== undefined && !isCoachMode(mode)) {
        return toolResult({ error: "coachMode must be 'roast' or 'drill'" }, true);
      }
      const outcome = await deps.commands.dispatch({
        text,
        runnerName: str(args.runnerName),
        targetPaceSecPerKm: numeric(args.targetPaceSecPerKm),
        coachMode: mode,
        conversationId: str(args.conversationId),
        idempotencyKey: str(args.idempotencyKey),
        source: 'poke_mcp',
      });
      return toolResult(outcome, !outcome.ok);
    }

    default:
      return toolResult({ error: `unknown tool ${name}` }, true);
  }
}

/**
 * Handles one JSON-RPC message. Returns `null` for notifications, which have no
 * id and must not produce a response body.
 */
export async function handleMcpRequest(
  body: JsonRpcRequest,
  deps: McpDeps,
): Promise<JsonRpcResponse | null> {
  const { method, id = null, params = {} } = body ?? {};
  if (!method) return fail(id, -32600, 'method is required');

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'run-hack-project', version: '0.1.0' },
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: TOOLS });

    case 'tools/call': {
      const name = str(params.name);
      if (!name) return fail(id, -32602, 'params.name is required');
      const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
      return ok(id, await callTool(name, args, deps));
    }

    default:
      return fail(id, -32601, `unsupported method ${method}`);
  }
}
