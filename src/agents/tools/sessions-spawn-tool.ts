import { Type } from "@sinclair/typebox";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { loadConfig } from "../../config/config.js";
import { ACP_SPAWN_MODES, spawnAcpDirect } from "../acp-spawn.js";
import { optionalStringEnum } from "../schema/typebox.js";
import { SUBAGENT_SPAWN_MODES, spawnSubagentDirect } from "../subagent-spawn.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const SESSIONS_SPAWN_RUNTIMES = ["subagent", "acp"] as const;

const logger = createSubsystemLogger("agent/sessions-spawn");

const SessionsSpawnToolSchema = Type.Object({
  task: Type.String(),
  label: Type.Optional(Type.String()),
  runtime: optionalStringEnum(SESSIONS_SPAWN_RUNTIMES),
  agentId: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  thinking: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
  runTimeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  // Back-compat: older callers used timeoutSeconds for this tool.
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  thread: Type.Optional(Type.Boolean()),
  mode: optionalStringEnum(SUBAGENT_SPAWN_MODES),
  cleanup: optionalStringEnum(["delete", "keep"] as const),
});

function resolveSpawnTimeoutMs(cfg: OpenClawConfig): number {
  return cfg.agents?.defaults?.subagents?.spawnTimeoutMs ?? 30_000; // 30s default
}

function isTimeoutError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return msg.includes('timeout') || msg.includes('gateway') || msg.includes('closed');
}

export function createSessionsSpawnTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  sandboxed?: boolean;
  /** Explicit agent ID override for cron/hook sessions where session key parsing may not work. */
  requesterAgentIdOverride?: string;
}): AnyAgentTool {
  return {
    label: "Sessions",
    name: "sessions_spawn",
    description:
      'Spawn an isolated session (runtime="subagent" or runtime="acp"). mode="run" is one-shot and mode="session" is persistent/thread-bound.',
    parameters: SessionsSpawnToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const task = readStringParam(params, "task", { required: true });
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const runtime = params.runtime === "acp" ? "acp" : "subagent";
      const requestedAgentId = readStringParam(params, "agentId");
      const modelOverride = readStringParam(params, "model");
      const thinkingOverrideRaw = readStringParam(params, "thinking");
      const cwd = readStringParam(params, "cwd");
      const mode = params.mode === "run" || params.mode === "session" ? params.mode : undefined;
      const cleanup =
        params.cleanup === "keep" || params.cleanup === "delete" ? params.cleanup : "keep";
      // Back-compat: older callers used timeoutSeconds for this tool.
      const timeoutSecondsCandidate =
        typeof params.runTimeoutSeconds === "number"
          ? params.runTimeoutSeconds
          : typeof params.timeoutSeconds === "number"
            ? params.timeoutSeconds
            : undefined;
      const runTimeoutSeconds =
        typeof timeoutSecondsCandidate === "number" && Number.isFinite(timeoutSecondsCandidate)
          ? Math.max(0, Math.floor(timeoutSecondsCandidate))
          : undefined;
      const thread = params.thread === true;

      // Load config and resolve spawn timeout (default: 30s)
      const cfg = loadConfig();
      const spawnTimeoutMs = resolveSpawnTimeoutMs(cfg);
      
      logger.debug("sessions_spawn executing", { 
        runtime, 
        spawnTimeoutMs,
        hasAgentId: !!requestedAgentId,
        thread: !!thread,
      });

      let result;
      let attempt = 0;
      const maxAttempts = 2; // Initial + 1 retry
      
      while (attempt < maxAttempts) {
        attempt++;
        try {
          result = runtime === "acp"
            ? await spawnAcpDirect(
                {
                  task,
                  label: label || undefined,
                  agentId: requestedAgentId,
                  cwd,
                  mode: mode && ACP_SPAWN_MODES.includes(mode) ? mode : undefined,
                  thread,
                },
                {
                  agentSessionKey: opts?.agentSessionKey,
                  agentChannel: opts?.agentChannel,
                  agentAccountId: opts?.agentAccountId,
                  agentTo: opts?.agentTo,
                  agentThreadId: opts?.agentThreadId,
                },
              )
            : await spawnSubagentDirect(
                {
                  task,
                  label: label || undefined,
                  agentId: requestedAgentId,
                  model: modelOverride,
                  thinking: thinkingOverrideRaw,
                  runTimeoutSeconds,
                  thread,
                  mode,
                  cleanup,
                  expectsCompletionMessage: true,
                  spawnTimeoutMs,
                },
                {
                  agentSessionKey: opts?.agentSessionKey,
                  agentChannel: opts?.agentChannel,
                  agentAccountId: opts?.agentAccountId,
                  agentTo: opts?.agentTo,
                  agentThreadId: opts?.agentThreadId,
                  agentGroupId: opts?.agentGroupId,
                  agentGroupChannel: opts?.agentGroupChannel,
                  agentGroupSpace: opts?.agentGroupSpace,
                  requesterAgentIdOverride: opts?.requesterAgentIdOverride,
                },
              );
          
          // Success - break out of retry loop
          break;
        } catch (err) {
          const isTimeout = isTimeoutError(err);
          const isLastAttempt = attempt >= maxAttempts;
          
          if (isTimeout && !isLastAttempt) {
            logger.warn(`sessions_spawn timeout on attempt ${attempt}, retrying after 2s delay`, {
              error: err instanceof Error ? err.message : String(err),
              runtime,
              attempt,
            });
            
            // Wait 2s before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // Not a timeout or last attempt - log and throw
          logger.error("sessions_spawn failed", {
            error: err instanceof Error ? err.message : String(err),
            runtime,
            attempt,
            isTimeout,
          });
          
          if (isTimeout) {
            throw new Error(
              `Gateway timeout after ${attempt} attempt(s) (${spawnTimeoutMs}ms each). ` +
              `The gateway may be under heavy load. ` +
              `Consider increasing 'agents.defaults.subagents.spawnTimeoutMs' in config. ` +
              `Original error: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          
          throw err;
        }
      }
      
      if (attempt > 1) {
        logger.info(`sessions_spawn succeeded after ${attempt} attempts`);
      }

      // result should always be defined here, but handle edge case
      if (!result) {
        throw new Error("sessions_spawn failed: result is undefined after execution");
      }

      if (result.status === "error") {
        logger.warn("sessions_spawn returned error", { 
          error: result.error,
          childSessionKey: result.childSessionKey,
        });
      } else {
        logger.info("sessions_spawn succeeded", {
          childSessionKey: result.childSessionKey,
          runId: result.runId,
          mode: result.mode,
        });
      }

      return jsonResult(result);
    },
  };
}
