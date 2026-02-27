export type GatewayBindUrlResult =
  | {
      url: string;
      source: "gateway.bind=custom" | "gateway.bind=tailnet" | "gateway.bind=lan" | "gateway.bind=loopback" | "gateway.bind=all";
    }
  | {
      error: string;
    }
  | null;

// Valid bind values and their normalized forms
const VALID_BIND_VALUES = ["auto", "lan", "loopback", "localhost", "custom", "tailnet", "all", "any", "127.0.0.1", "0.0.0.0"] as const;
type ValidBindValue = (typeof VALID_BIND_VALUES)[number];

// Aliases that map to normalized IP addresses
const BIND_ALIASES: Record<string, string> = {
  localhost: "127.0.0.1",
  loopback: "127.0.0.1",
  all: "0.0.0.0",
  any: "0.0.0.0",
};

export function normalizeBind(bind?: string): { normalized: string; isValid: boolean } {
  if (!bind) {
    return { normalized: "127.0.0.1", isValid: true };
  }
  
  const lowerBind = bind.toLowerCase();
  
  // Check for direct IP addresses
  if (lowerBind === "127.0.0.1" || lowerBind === "0.0.0.0") {
    return { normalized: lowerBind, isValid: true };
  }
  
  // Check for aliases
  if (BIND_ALIASES[lowerBind]) {
    return { normalized: BIND_ALIASES[lowerBind], isValid: true };
  }
  
  // Check for other valid values that aren't IP aliases
  if (["auto", "lan", "custom", "tailnet"].includes(lowerBind)) {
    return { normalized: lowerBind, isValid: true };
  }
  
  return { normalized: bind, isValid: false };
}

export function getBindValidationError(): string {
  return 'gateway.bind must be one of: "127.0.0.1" | "0.0.0.0" (aliases: localhost, loopback, all, any) or: auto | lan | custom | tailnet';
}

export function resolveGatewayBindUrl(params: {
  bind?: string;
  customBindHost?: string;
  scheme: "ws" | "wss";
  port: number;
  pickTailnetHost: () => string | null;
  pickLanHost: () => string | null;
}): GatewayBindUrlResult {
  const bind = params.bind ?? "loopback";
  
  // Normalize the bind value
  const { normalized, isValid } = normalizeBind(bind);
  
  if (!isValid) {
    return { error: getBindValidationError() };
  }
  
  // Handle custom bind
  if (normalized === "custom") {
    const host = params.customBindHost?.trim();
    if (host) {
      return { url: `${params.scheme}://${host}:${params.port}`, source: "gateway.bind=custom" };
    }
    return { error: "gateway.bind=custom requires gateway.customBindHost." };
  }

  // Handle tailnet bind
  if (normalized === "tailnet") {
    const host = params.pickTailnetHost();
    if (host) {
      return { url: `${params.scheme}://${host}:${params.port}`, source: "gateway.bind=tailnet" };
    }
    return { error: "gateway.bind=tailnet set, but no tailnet IP was found." };
  }

  // Handle lan bind
  if (normalized === "lan") {
    const host = params.pickLanHost();
    if (host) {
      return { url: `${params.scheme}://${host}:${params.port}`, source: "gateway.bind=lan" };
    }
    return { error: "gateway.bind=lan set, but no private LAN IP was found." };
  }

  // Handle auto bind (default to loopback)
  if (normalized === "auto") {
    return { url: `${params.scheme}://127.0.0.1:${params.port}`, source: "gateway.bind=loopback" };
  }

  // Handle IP addresses (127.0.0.1 and 0.0.0.0)
  if (normalized === "127.0.0.1") {
    return { url: `${params.scheme}://127.0.0.1:${params.port}`, source: "gateway.bind=loopback" };
  }
  
  if (normalized === "0.0.0.0") {
    return { url: `${params.scheme}://0.0.0.0:${params.port}`, source: "gateway.bind=all" };
  }

  return null;
}
