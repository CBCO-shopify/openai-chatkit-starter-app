import { useMemo, useEffect, useRef } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
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

export function ChatKitPanel() {
  const getClientSecret = useMemo(
    () => createClientSecretFetcher(workflowId),
    []
  );

  const conversationRef = useRef<string[]>([]);
  const hasEscalatedRef = useRef(false);

  useEffect(() => {
  // Listen for ChatKit postMessage events
  const handleMessage = (event: MessageEvent) => {
  if (!event.origin.includes('openai.com')) return;
  
  if (event.data?.__oaiChatKit && Array.isArray(event.data.data)) {
    const [eventType, eventData] = event.data.data;
    
    // Capture user message from composer.submit
    if (eventType === 'log' && eventData?.name === 'composer.submit') {
      const userText = eventData.data?.text?.[0]?.text;
      if (userText) {
        console.log('[Trax] User message:', userText);
        
        fetch("https://n8n.curtainworld.net.au/webhook/log-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: crypto.randomUUID(),
            session_id: getSessionId(),
            role: "user",
            content: userText,
            timestamp: new Date().toISOString(),
          }),
        }).catch(e => console.error('[Trax] Failed to log message:', e));
      }
    }
    
    // Capture thread ID and store it
    if (eventType === 'thread.change' && eventData?.threadId) {
      const threadId = eventData.threadId;
      console.log('[Trax] Thread ID captured:', threadId);
      sessionStorage.setItem('trax_thread_id', threadId);
      
      fetch("https://n8n.curtainworld.net.au/webhook/chatbot-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "thread_created",
          session_id: getSessionId(),
          thread_id: threadId,
          timestamp: new Date().toISOString(),
        }),
      }).catch(e => console.error('[Trax] Failed to log thread:', e));
    }
    
    // On response.end, fetch assistant message from OpenAI
    if (eventType === 'response.end') {
      const threadId = sessionStorage.getItem('trax_thread_id');
      if (threadId) {
        console.log('[Trax] Response ended, fetching assistant message...');
        
        fetch("https://n8n.curtainworld.net.au/webhook/fetch-assistant-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: getSessionId(),
            thread_id: threadId,
            timestamp: new Date().toISOString(),
          }),
        }).catch(e => console.error('[Trax] Failed to fetch assistant message:', e));
      }
    }
  }
};
  window.addEventListener('message', handleMessage);
  
  sendAnalytics("conversation_start");
  console.log("[Trax] Session started:", getSessionId());
  
  // Log session when user leaves page (backup)
  const handleBeforeUnload = () => {
    if (conversationRef.current.length > 0 && !hasEscalatedRef.current) {
      navigator.sendBeacon(
        "https://n8n.curtainworld.net.au/webhook/log-session",
        JSON.stringify({
          session_id: getSessionId(),
          summary: `Session ended (abandoned). ${conversationRef.current.length} messages exchanged.`,
          transcript: conversationRef.current.join("\n"),
          topic_category: "other",
          outcome: "abandoned",
          timestamp: new Date().toISOString(),
        })
      );
    }
  };
  
  window.addEventListener("beforeunload", handleBeforeUnload);
  
  return () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener('message', handleMessage);
  };
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
    { label: "Check an order", prompt: "I'd like to check my order status", icon: "package" },
    { label: "Ask me anything", prompt: "I have a question about products or installation", icon: "circle-question" },
    { label: "Submit enquiry", prompt: "I need to speak with someone from your team", icon: "envelope" },
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
      console.log("[Trax] Client tool called:", toolCall.name, toolCall.params);

      // ============================================
      // LOG MESSAGE HANDLER
      // ============================================
      if (toolCall.name === "log_message") {
        const sessionId = getSessionId();
        
        console.log("[Trax] Logging message exchange");
        
        try {
          // Log user message
          if (toolCall.params.user_message) {
            await fetch("https://n8n.curtainworld.net.au/webhook/log-message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message_id: crypto.randomUUID(),
                session_id: sessionId,
                role: "user",
                content: toolCall.params.user_message,
                timestamp: new Date().toISOString(),
              }),
            });
            conversationRef.current.push(`User: ${toolCall.params.user_message}`);
          }

          // Log assistant message
          if (toolCall.params.assistant_message) {
            await fetch("https://n8n.curtainworld.net.au/webhook/log-message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message_id: crypto.randomUUID(),
                session_id: sessionId,
                role: "assistant",
                content: toolCall.params.assistant_message,
                timestamp: new Date().toISOString(),
              }),
            });
            conversationRef.current.push(`Assistant: ${toolCall.params.assistant_message}`);
          }

          console.log("[Trax] Messages logged successfully");
          return { success: true, message: "Messages logged" };
        } catch (error) {
          console.error("[Trax] Message logging error:", error);
          return { success: false, message: "Failed to log messages" };
        }
      }

      // ============================================
      // LOG SESSION HANDLER
      // ============================================
      if (toolCall.name === "log_session") {
        const sessionId = getSessionId();
        
        console.log("[Trax] Logging session");
        
        try {
          const response = await fetch("https://n8n.curtainworld.net.au/webhook/log-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              summary: toolCall.params.summary || "",
              transcript: toolCall.params.transcript || conversationRef.current.join("\n"),
              topic_category: toolCall.params.topic_category || "other",
              outcome: toolCall.params.outcome || "unclear",
              customer_email: toolCall.params.customer_email || "",
              customer_phone: toolCall.params.customer_phone || "",
              customer_name: toolCall.params.customer_name || "",
              escalated: toolCall.params.outcome === "escalated",
              timestamp: new Date().toISOString(),
            }),
          });

          if (toolCall.params.outcome === "escalated") {
            hasEscalatedRef.current = true;
          }

          console.log("[Trax] Session logged successfully");
          return { success: true, message: "Session logged" };
        } catch (error) {
          console.error("[Trax] Session logging error:", error);
          return { success: false, message: "Failed to log session" };
        }
      }

      // ============================================
      // GORGIAS ESCALATION HANDLER
      // ============================================
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
  thread_id: sessionStorage.getItem('trax_thread_id') || toolCall.params.thread_id || "",
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

      // ============================================
      // ORDER LOOKUP HANDLER
      // ============================================
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

      // ============================================
      // GET VARIANT ID HANDLER
      // ============================================
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

      // ============================================
      // GET CART ID HANDLER
      // ============================================
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

      // ============================================
      // UNKNOWN TOOL FALLBACK
      // ============================================
      console.warn("[Trax] Unknown tool called:", toolCall.name);
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
