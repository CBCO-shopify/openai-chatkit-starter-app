import { useEffect, useMemo, useRef } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

function getThreadKey(control: any) {
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

    // IMPORTANT: Your ChatKit build rejects startScreen.enabled, so we omit startScreen entirely.

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

    const tryInject = () => {
      const ctrl: any = chatkit.control;
      if (!ctrl) return false;

      const thread = ctrl.thread;

      // If thread already has messages, don't inject (not a new session)
      const items = thread?.items ?? ctrl?.threadItems ?? [];
      if (Array.isArray(items) && items.length > 0) {
        didInjectWelcome.current = true;
        return true;
      }

      // Find an append-like API (varies by build)
      const appendFn =
        (typeof thread?.append === "function" && ((x: any) => thread.append(x))) ||
        (typeof ctrl?.addThreadItem === "function" && ((x: any) => ctrl.addThreadItem(x))) ||
        (typeof ctrl?.appendThreadItem === "function" && ((x: any) => ctrl.appendThreadItem(x))) ||
        (typeof ctrl?.pushThreadItem === "function" && ((x: any) => ctrl.pushThreadItem(x))) ||
        null;

      // Not ready yet — keep waiting
      if (!appendFn) return false;

      // LocalStorage guard so refreshes don’t re-add it to an empty thread
      const threadKey = String(getThreadKey(ctrl));
      const storageKey = `trax_welcome_shown:${workflowId}:${threadKey}`;
      if (localStorage.getItem(storageKey) === "1") {
        didInjectWelcome.current = true;
        return true;
      }

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

      return true;
    };

    // ✅ Poll briefly until ChatKit has the append API ready (so the widget appears immediately)
    // This avoids the “not ready on first render” problem.
    const start = Date.now();
    const interval = window.setInterval(() => {
      const done = tryInject();
      const timedOut = Date.now() - start > 5000; // 5s safety timeout
      if (done || timedOut) window.clearInterval(interval);
    }, 100);

    // Try immediately too (best effort)
    tryInject();

    return () => window.clearInterval(interval);
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
      {/* Top Header (restored + correct background) */}
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
            C&amp;BCo&apos;s AI Assistant
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
        <div style={{ color: "#999" }}>
          Powered by The Curtain &amp; Blind Co
        </div>
      </div>
    </div>
  );
}
