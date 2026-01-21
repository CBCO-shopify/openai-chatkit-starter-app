import { useMemo, useEffect, useRef } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import type { ChatKitMessage } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

const getCartIdFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get("cartId");
};

const getSessionId = () => {
  if (!sessionStorage.getItem("trax_session")) {
    sessionStorage.setItem("trax_session", crypto.randomUUID());
  }
  return sessionStorage.getItem("trax_session")!;
};

const getUserId = (): string => {
  const storageKey = "trax_user_id";
  let userId = localStorage.getItem(storageKey);
  
  if (!userId) {
    userId = "user_" + crypto.randomUUID();
    localStorage.setItem(storageKey, userId);
  }
  
  return userId;
};

const sendAnalytics = async (eventType: string, data: Record<string, unknown> = {}) => {
  try {
    await fetch("https://n8n.curtainworld.net.au/webhook/chatbot-analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        timestamp: new Date().toISOString(),
        session_id: getSessionId(),
        ...data,
      }),
    });
  } catch (e) {
    console.log("Analytics error:", e);
  }
};

// ============================================
// MESSAGE LOGGING
// ============================================
const logMessage = async (role: "user" | "assistant", content: string) => {
  const sessionId = getSessionId();
  
  console.log(`[Trax] Logging ${role} message:`, content.substring(0, 50) + "...");
  
  try {
    const response = await fetch("https://n8n.curtainworld.net.au/webhook/log-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message_id: crypto.randomUUID(),
        session_id: sessionId,
        role: role,
        content: content,
        timestamp: new Date().toISOString(),
      }),
    });
    console.log(`[Trax] Log response:`, response.status);
  } catch (e) {
    console.error("[Trax] Message logging error:", e);
  }
};

// Extract text content from ChatKit message
const extractMessageText = (message: any): string => {
  if (!message) return "";
  
  // Try different possible structures
  if (typeof message.content === "string") {
    return message.content;
  }
  
  if (Array.isArray(message.content)) {
    return message.content
      .filter((c: any) => c.type === "text" && c.text)
      .map((c: any) => c.text)
      .join(" ");
  }
  
  if (message.text) {
    return message.text;
  }
  
  return "";
};

export function ChatKitPanel() {
  const getClientSecret = useMemo(
    () => createClientSecretFetcher(workflowId),
    []
  );

  // Track logged messages to avoid duplicates
  const loggedMessageIds = useRef<Set<string>>(new Set());
  const conversationRef = useRef<string[]>([]);
  const hasEscalatedRef = useRef(false);
  const debugLoggedRef = useRef(false);

  useEffect(() => {
    sendAnalytics("conversation_start");
    console.log("[Trax] Session started:", getSessionId());
    
    // Log session when user leaves page
    const handleBeforeUnload = () => {
      if (conversationRef.current.length > 0) {
        const outcome = hasEscalatedRef.current ? "escalated" : "abandoned";
        navigator.sendBeacon(
          "https://n8n.curtainworld.net.au/webhook/log-session",
          JSON.stringify({
            session_id: getSessionId(),
            summary: `Session ended (${outcome}). ${conversationRef.current.length} messages exchanged.`,
            transcript: conversationRef.current.join("\n"),
            topic_category: "other",
            outcome: outcome,
            timestamp: new Date().toISOString(),
          })
        );
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const chatkit = useChatKit({
    api: { getClientSecret },
    header: { enabled: false },
    composer: { placeholder: "Chat to Trax" },
    threadItemActions: {
      feedback: false,
      retry: false,
    },

    startScreen: {
      greeting: "Hi there 👋",
      prompts: [
        { label: "Order lookup", prompt: "I'd like to lookup my order", icon: "compass" },
        { label: "Help me choose", prompt: "Help with product selections", icon: "search" },
        { label: "Measure and Install", prompt: "Help with measuring and installation", icon: "notebook-pencil" },
        { label: "Something else", prompt: "I have a different question", icon: "circle-question" },
      ],
    },

    theme: {
      colorScheme: "light",
      radius: "round",
      density: "normal",
      color: {
        accent: {
          primary: "#4A7C59",
          level: 2,
        },
      },
    },

    onClientTool: async (toolCall) => {
      console.log("Client tool called:", toolCall.name, toolCall);

      if (toolCall.name === "create_gorgias_ticket") {
        hasEscalatedRef.current = true;
        
        sendAnalytics("escalation", {
          tool_name: "create_gorgias_ticket",
          subject: toolCall.params.subject,
          summary: toolCall.params.summary,
          user_message: toolCall.params.summary,
          customer_email: toolCall.params.customer_email,
          customer_phone: toolCall.params.customer_phone,
          customer_name: toolCall.params.customer_name,
        });

        try {
          const response = await fetch(
            "https://n8n.curtainworld.net.au/webhook/gorgias-escalation",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customer_email: toolCall.params.customer_email,
                customer_phone: toolCall.params.customer_phone || "",
                subject: toolCall.params.subject,
                summary: toolCall.params.summary,
                conversation_transcript: toolCall.params.conversation_transcript,
              }),
            }
          );

          if (!response.ok) throw new Error("Failed to create ticket");

          return {
            success: true,
            message:
              "Support ticket created successfully. Our team will be in touch within 1 business day.",
          };
        } catch (error) {
          console.error("Gorgias ticket error:", error);

          sendAnalytics("error", {
            tool_name: "create_gorgias_ticket",
            error_message: error instanceof Error ? error.message : "Unknown error",
            user_message: toolCall.params.summary,
            customer_email: toolCall.params.customer_email,
            customer_phone: toolCall.params.customer_phone,
          });

          return {
            success: false,
            message:
              "There was an issue creating the support ticket. Please call us on 1300 301 368.",
          };
        }
      }

      if (toolCall.name === "lookup_order") {
        sendAnalytics("tool_call", {
          tool_name: "lookup_order",
          user_message: `Order lookup: ${toolCall.params.order_number}`,
          customer_email: toolCall.params.email,
          order_number: toolCall.params.order_number,
        });

        try {
          const response = await fetch(
            "https://n8n.curtainworld.net.au/webhook/order-lookup",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_number: toolCall.params.order_number,
                email: toolCall.params.email,
              }),
            }
          );

          if (!response.ok) throw new Error("Failed to lookup order");

          return await response.json();
        } catch (error) {
          console.error("Order lookup error:", error);

          sendAnalytics("error", {
            tool_name: "lookup_order",
            error_message: error instanceof Error ? error.message : "Unknown error",
            user_message: `Order lookup failed: ${toolCall.params.order_number}`,
            customer_email: toolCall.params.email,
            order_number: toolCall.params.order_number,
          });

          return {
            success: false,
            message:
              "There was an issue looking up your order. Please try again or call us on 1300 301 368.",
          };
        }
      }

      if (toolCall.name === "get_variant_id") {
        console.log("get_variant_id handler entered");
        console.log("Params:", toolCall.params);
        
        try {
          console.log("Making fetch request to n8n...");
          const response = await fetch(
            "https://n8n.curtainworld.net.au/webhook/get-variant-id",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                product_id: toolCall.params.product_id,
                color_name: toolCall.params.color_name || toolCall.params.color,
              }),
            }
          );

          console.log("Fetch response status:", response.status);

          if (!response.ok) throw new Error("Failed to get variant ID");

          const data = await response.json();
          console.log("Response data:", data);
          return data;
        } catch (error) {
          console.error("Get variant ID error:", error);
          return {
            success: false,
            message: "Unable to retrieve variant ID. Please try again.",
          };
        }
      }

      if (toolCall.name === "get_shopify_cart_id") {
        const cartId = getCartIdFromUrl();

        if (cartId && cartId !== "null" && cartId !== "") {
          return {
            success: true,
            cart_id: cartId,
            message: "Cart ID retrieved successfully. Use this ID with get_cart and update_cart tools."
          };
        } else {
          return {
            success: false,
            cart_id: null,
            message: "No cart ID available. The customer may not have an active cart session."
          };
        }
      }

      sendAnalytics("tool_call", {
        tool_name: toolCall.name,
        user_message: "Unknown tool invoked",
      });

      return { error: "Unknown tool: " + toolCall.name };
    },
  });

  // ============================================
  // DEBUG: Explore chatkit.control structure
  // ============================================
  useEffect(() => {
    console.log("[Trax] Starting message polling...");
    
    const pollInterval = setInterval(() => {
      // Debug: Log the entire control object structure (only once after messages exist)
      if (!debugLoggedRef.current && chatkit.control) {
        console.log("[Trax] DEBUG - chatkit.control keys:", Object.keys(chatkit.control));
        console.log("[Trax] DEBUG - chatkit.control:", chatkit.control);
        
        // Check for common property names
        const possibleProps = ['messages', 'thread', 'conversation', 'history', 'items', 'state'];
        possibleProps.forEach(prop => {
          if ((chatkit.control as any)[prop]) {
            console.log(`[Trax] DEBUG - Found property '${prop}':`, (chatkit.control as any)[prop]);
          }
        });
        
        debugLoggedRef.current = true;
      }
      
      // Try multiple possible paths to messages
      const control = chatkit.control as any;
      let messages: any[] | null = null;
      
      // Try different possible paths
      if (control?.messages && Array.isArray(control.messages)) {
        messages = control.messages;
        console.log("[Trax] Found messages at control.messages");
      } else if (control?.thread?.messages && Array.isArray(control.thread.messages)) {
        messages = control.thread.messages;
        console.log("[Trax] Found messages at control.thread.messages");
      } else if (control?.state?.messages && Array.isArray(control.state.messages)) {
        messages = control.state.messages;
        console.log("[Trax] Found messages at control.state.messages");
      }
      
      if (!messages) {
        return;
      }

      console.log("[Trax] Poll - messages count:", messages.length);

      for (const message of messages) {
        // Create unique ID for this message
        const messageId = message.id || `${message.role}-${JSON.stringify(message).substring(0, 50)}`;
        
        // Skip if already logged
        if (loggedMessageIds.current.has(messageId)) {
          continue;
        }

        const text = extractMessageText(message);
        
        // Only log if message has content
        if (text && (message.role === "user" || message.role === "assistant")) {
          console.log(`[Trax] New ${message.role} message detected:`, text.substring(0, 30));
          logMessage(message.role, text);
          loggedMessageIds.current.add(messageId);
          
          // Add to transcript
          const prefix = message.role === "user" ? "User" : "Assistant";
          conversationRef.current.push(`${prefix}: ${text}`);
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [chatkit.control]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        backgroundColor: "var(--background)",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "var(--trax-green)",
          color: "var(--trax-paper)",
          borderBottom: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: "16px" }}>Traxine</div>
          <div style={{ fontSize: "12px", opacity: 0.9 }}>
            C&amp;BCo&apos;s AI Assistant in training
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChatKit
          control={chatkit.control}
          style={{ height: "100%", width: "100%" }}
        />
      </div>

      <div
        style={{
          padding: "8px 16px",
          textAlign: "center",
          fontSize: "11px",
          backgroundColor: "white",
          borderTop: "1px solid #eee",
        }}
      >
        <div style={{ marginBottom: "4px", color: "var(--trax-green)" }}>
          Tip: you can ask for a human any time.
        </div>
        <div style={{ color: "#999" }}>
          Powered by The Curtain &amp; Blind Company
        </div>
      </div>
    </div>
  );
}
