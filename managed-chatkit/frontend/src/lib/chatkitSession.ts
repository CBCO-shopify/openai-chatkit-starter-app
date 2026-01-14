const readEnvString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const workflowId = (() => {
  const id = readEnvString(import.meta.env.VITE_CHATKIT_WORKFLOW_ID);
  if (!id || id.startsWith("wf_replace")) {
    throw new Error("Set VITE_CHATKIT_WORKFLOW_ID in your .env file.");
  }
  return id;
})();

// Extract cartId from URL parameters
export const getCartIdFromUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("cartId");
};

export function createClientSecretFetcher(
  workflow: string,
  endpoint = "https://n8n.curtainworld.net.au/webhook/chatkit-session"
) {
  return async (currentSecret: string | null) => {
    if (currentSecret) return currentSecret;
    
    // Get cart ID from URL
    const cartId = getCartIdFromUrl();
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        workflow: { id: workflow },
        cartId: cartId  // Pass cart ID to n8n
      }),
    });
    
    const payload = (await response.json().catch(() => ({}))) as {
      client_secret?: string;
      error?: string;
    };
    
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to create session");
    }
    if (!payload.client_secret) {
      throw new Error("Missing client secret in response");
    }
    return payload.client_secret;
  };
}
