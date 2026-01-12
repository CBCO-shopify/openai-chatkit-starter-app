import { useEffect, useMemo, useRef } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

function getThreadKey(control: any) {
  // Try common identifiers; fall back to a stable “default”
  return (
    control?.thread?.id ||
    control?.threadId ||
    control?.sessionId ||
    control?.conversationId ||
    "default"
  );
}

export function ChatKitPanel() {
  const getClientSecret = useMemo(
    () => createClientSecretFetcher(workflowId),
    []
  );

  const chatkit = useChatKit({
    api: { getClientSecret },

    // We render our own header above ChatKit
    header: { enabled: false },

    composer: {
      placeholder: "Chat to Trax",
    },

    threadItemActions: {
      feedback: false,
      retry: false,
    },

    // IMPORTANT:
    // Do NOT set startScreen.enabled in your build (it errors).
    // Also, we’re not using ChatKit’s startScreen prompts anymore.

    onClientTool: async (toolCall) => {
      console.log("Client tool called:", toolCall.name, toolCall);

      if (toolCall.name === "create_gorgias_ticket") {
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
          return {
            success: false,
            message:
              "There was an issue creating the support ticket. Please call us on 1300 301 368.",
          };
        }
      }

      if (toolCall.name === "lookup_order") {
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

          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Order lookup error:", error);
          return {
            success: false,
            message:
              "There was an issue looking up your order. Please try again or call us on 1300 301 368.",
          };
        }
      }

      return { error: "Unknown tool: " + toolCall.name };
    },
  });

  // Inject welcome widget once per new session
  const didInjectWelcome = useRef(false);

  useEffect(() => {
    if (didInjectWelcome.current) return;

    const control: any = chatkit.control;
    if (!control) return;

    const thread = control.thread;
    const items = thread?.items ?? control?.threadItems ?? [];

    // If the thread already has messages, it's not a new session -> do nothing
    if (Array.isArray(items) && items.length > 0) {
      didInjectWelcome.current = true;
      return;
    }

    // Detect an append-like API (varies by ChatKit build)
    const appendFn =
      (typeof thread?.append === "function" && ((x: any) => thread.append(x))) ||
      (typeof control?.addThreadItem === "function" && ((x: any) => control.addThreadItem(x))) ||
      (typeof control?.appendThreadItem === "function" && ((x: any) => control.appendThreadItem(x))) ||
      (typeof control?.pushThreadItem === "function" && ((x: any) => control.pushThreadItem(x))) ||
      null;

    // If ChatKit isn’t ready yet, wait for the next render
    if (!appendFn) return;

    // LocalStorage guard so refreshes don’t re-add it to an empty thread
    const threadKey = String(getThreadKey(control));
    const storageKey = `trax_welcome_shown:${workflowId}:${threadKey}`;
    if (localStorage.getItem(storageKey) === "1") {
      didInjectWelcome.current = true;
      return;
    }

    // Mark + inject
    localStorage.setItem(storageKey, "1");
    didInjectWelcome.current = true;

    appendFn({
      role: "assistant",
      content: [
        {
          type: "widget",
          name: "Trax Welcome",
          state: {
            title: "Hi! I’m Trax 👋",
            message:
              "I’m C&BCo’s new AI agent in training. If you’d prefer help from a human at any point, tell me and I’ll send your query to our service team. How can I help today?",
            options: [
              {
                id: "order",
                label: "Order enquiry",
                prompt: "I'd like to check on an existing order",
                icon: "suitcase",
              },
              {
                id: "product",
                label: "Product help",
                prompt: "I need help choosing the right product for my space",
                icon: "search",
              },
              {
                id: "install",
                label: "Measure & install",
                prompt: "I need guidance on measuring or installing my order",
                icon: "info",
              },
              {
                id: "other",
                label: "Other",
                prompt: "I have a different question",
                icon: "circle-question",
              },
            ],
          },
        },
      ],
    });
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
      {/* Top Header (restored) */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "white",
          borderBottom: "1px solid #eee",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: "16px" }}>Traxine</div>
          <div style={{ fontSize: "12px", opacity: 0.8 }}>
            C&BCo&apos;s AI Assistant
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChatKit
          control={chatkit.control}
          style={{ height: "100%", width: "100%" }}
        />
      </div>

      {/* Footer (always visible tip + brand) */}
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
        <div style={{ color: "#999" }}>Powered by The Curtain &amp; Blind Co</div>
      </div>
    </div>
  );
}
