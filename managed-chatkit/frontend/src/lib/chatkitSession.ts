const readEnvString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const workflowId = (() => {
  const id = readEnvString(import.meta.env.VITE_CHATKIT_WORKFLOW_ID);
  if (!id || id.startsWith("wf_replace")) {
    throw new Error("Set VITE_CHATKIT_WORKFLOW_ID in your .env file.");
  }
  return id;
})();

// Persistent user ID - survives browser close
export const getUserId = (): string => {
  const storageKey = "trax_user_id";
  let userId = localStorage.getItem(storageKey);
  
  if (!userId) {
    userId = "user_" + crypto.randomUUID();
    localStorage.setItem(storageKey, userId);
  }
  
  return userId;
};

// Extract cartId from URL parameters
export const getCartIdFromUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("cartId");
};

export function createClientSecretFetcher(
  workflow: string,
  endpoint = "/api/create-session"
) {
  return async (currentSecret: string | null) => {
    if (currentSecret) return currentSecret;
    
    // Get persistent user ID
    const userId = getUserId();
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        workflow: { id: workflow },
        userId: userId
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
