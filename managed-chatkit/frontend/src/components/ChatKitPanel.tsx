import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import type { ChatKitMessage } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

const getCartIdFromUrl = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get("cartId");
};

const getSessionId = () => {
  // Session ID is per-conversation (resets on page refresh)
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
  
  try {
    await fetch("https://n8n.curtainworld.net.au/webhook/log-message", {
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
    console.log(`[Trax] Logged ${role} message`);
  } catch (e) {
    console.error("Message logging error:", e);
  }
};

// ============================================
// SESSION LOGGING
// ============================================
const logSession = async (transcript: string[], outcome: string = "unclear") => {
  const sessionId = getSessionId();
  
  // Don't log if no messages
  if (transcript.length === 0) return;
  
  // Determine topic from conversation
  const fullTranscript = transcript.join("\n");
  let topic = "other";
  const lowerTranscript = fullTranscript.toLowerCase();
  
  if (lowerTranscript.includes("order") || lowerTranscript.includes("delivery") || lowerTranscript.includes("track")) {
    topic = "orders";
  } else if (lowerTranscript.includes("measure") || lowerTranscript.includes("install")) {
    topic = "measuring";
  } else if (lowerTranscript.includes("blind") || lowerTranscript.includes("curtain") || lowerTranscript.includes("shutter")) {
    topic = "products";
  }
  
  try {
    await fetch("https://n8n.curtainworld.net.au/webhook/log-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        summary: `Conversation with ${transcript.length} messages about ${topic}.`,
        transcript: fullTranscript,
        topic_category: topic,
        outcome: outcome,
        timestamp: new Date().toISOString(),
      }),
    });
    console.log("[Trax] Session logged");
  } catch (e) {
    console.error("Session logging error:", e);
  }
};

// Extract text content from ChatKit message
const extractMessageText = (message: ChatKitMessage): string => {
  if (!message.content) return "";
  
  // Handle array of content blocks
  if (Array.isArray(message.content)) {
    return message.content
      .filter((c: any) => c.type === "text" && c.text)
      .map((c: any) => c.text)
      .join(" ");
  }
  
  // Handle string content
  if (typeof message.content === "string") {
    return message.content;
  }
  
  return "";
};

export function ChatKitPanel() {
  const getClientSecret = useMemo(
    () => createClientSecretFetcher(workflowId),
    []
  );

  // Track conversation for logging
  const conversationRef = useRef<string[]>([]);
  const lastMessageCountRef = useRef(0);
  const hasEscalatedRef = useRef(false);

  useEffect(() => {
    sendAnalytics("conversation_start");
    
    // Log session when user leaves page
    const handleBeforeUnload = () => {
      if (conversationRef.current.length > 0) {
        const outcome = hasEscalatedRef.current ? "escalated" : "abandoned";
        // Use sendBeacon for reliability on page close
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

    // ============================================
    // MESSAGE EVENT HANDLERS
    // ============================================
    onMessage: (message: ChatKitMessage) => {
      console.log("[Trax] onMessage fired:", message.role, message);
      
      const text = extractMessageText(message);
      if (!text) return;
      
      // Log the message
      if (message.role === "user" || message.role === "assistant") {
        logMessage(message.role, text);
        
        // Add to conversation transcript
        const prefix = message.role === "user" ? "User" : "Assistant";
        conversationRef.current.push(`${prefix}: ${text}`);
      }
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
          
          // Log session as escalated
          logSession(conversationRef.current, "escalated");

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
