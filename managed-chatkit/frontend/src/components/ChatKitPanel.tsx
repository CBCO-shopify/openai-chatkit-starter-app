import { useMemo, useEffect, useRef } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

const getSessionId = () => {
  if (!sessionStorage.getItem("trax_session")) {
    sessionStorage.setItem("trax_session", crypto.randomUUID());
  }
  return sessionStorage.getItem("trax_session")!;
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

  useEffect(() => {
    sendAnalytics("conversation_start");
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

      if (toolCall.name === "log_message") {
        try {
          await fetch("https://n8n.curtainworld.net.au/webhook/log-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message_id: crypto.randomUUID(),
              session_id: getSessionId(),
              role: "user",
              content: toolCall.params.user_message,
              timestamp: new Date().toISOString(),
            }),
          });

          await fetch("https://n8n.curtainworld.net.au/webhook/log-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message_id: crypto.randomUUID(),
              session_id: getSessionId(),
              role: "assistant",
              content: toolCall.params.assistant_message,
              timestamp: new Date().toISOString(),
            }),
          });

          return { success: true };
        } catch (error) {
          console.error("Log message error:", error);
          return { success: false };
        }
      }

      if (toolCall.name === "log_session") {
        try {
          await fetch("https://n8n.curtainworld.net.au/webhook/log-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: getSessionId(),
              timestamp: new Date().toISOString(),
              summary: toolCall.params.summary,
              transcript: toolCall.params.transcript,
              topic_category: toolCall.params.topic_category,
              outcome: toolCall.params.outcome,
              customer_email: toolCall.params.customer_email || "",
              customer_phone: toolCall.params.customer_phone || "",
              customer_name: toolCall.params.customer_name || "",
              escalated: toolCall.params.outcome === "escalated",
            }),
          });

          return { success: true };
        } catch (error) {
          console.error("Log session error:", error);
          return { success: false };
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
