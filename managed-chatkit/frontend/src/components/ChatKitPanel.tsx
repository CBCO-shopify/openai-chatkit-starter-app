import { useEffect, useMemo, useRef } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

export function ChatKitPanel() {
  const getClientSecret = useMemo(
    () => createClientSecretFetcher(workflowId),
    []
  );

  const chatkit = useChatKit({
    api: { getClientSecret },

    header: { enabled: false },

    composer: {
      placeholder: "Chat to Trax",
    },

    threadItemActions: {
      feedback: false,
      retry: false,
    },

    // ✅ Remove ChatKit start screen so your widget is the welcome
    startScreen: { enabled: false },

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

  // ✅ Inject the welcome widget ONCE per session load
const didInjectWelcome = useRef(false);

useEffect(() => {
  if (didInjectWelcome.current) return;
  const control: any = chatkit.control;
  if (!control) return;

  // Thread may not be ready yet in this build
  const thread = control.thread;
  const items = thread?.items ?? [];

  // If items already exist, don't inject (returning session)
  if (items.length > 0) {
    didInjectWelcome.current = true;
    return;
  }

  // We can only inject once the thread has a way to accept items
  const canAppend =
    typeof thread?.append === "function" ||
    typeof control?.addThreadItem === "function" ||
    typeof control?.appendThreadItem === "function" ||
    typeof control?.pushThreadItem === "function";

  if (!canAppend) return; // wait for the next render when APIs are ready

  didInjectWelcome.current = true;

  const welcomeItem = {
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
            { id: "order", label: "Order enquiry", prompt: "I'd like to check on an existing order", icon: "suitcase" },
            { id: "product", label: "Product help", prompt: "I need help choosing the right product for my space", icon: "search" },
            { id: "install", label: "Measure & install", prompt: "I need guidance on measuring or installing my order", icon: "info" },
            { id: "other", label: "Other", prompt: "I have a different question", icon: "circle-question" },
          ],
        },
      },
    ],
  };

  // Try the known APIs in order
  if (typeof thread?.append === "function") thread.append(welcomeItem);
  else if (typeof control?.addThreadItem === "function") control.addThreadItem(welcomeItem);
  else if (typeof control?.appendThreadItem === "function") control.appendThreadItem(welcomeItem);
  else if (typeof control?.pushThreadItem === "function") control.pushThreadItem(welcomeItem);
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
    {/* Chat Area */}
    <div style={{ flex: 1, overflow: "hidden" }}>
      <ChatKit
        control={chatkit.control}
        style={{ height: "100%", width: "100%" }}
      />
    </div>

    {/* Footer */}
    <div
      style={{
        padding: "8px 16px",
        textAlign: "center",
        fontSize: "11px",
        backgroundColor: "white",
        borderTop: "1px solid #eee",
      }}
    >
      <div
        style={{
          marginBottom: "4px",
          color: "var(--trax-green)",
          fontSize: "11px",
        }}
      >
        Tip: you can ask for a human any time.
      </div>

      <div style={{ color: "#999", fontSize: "11px" }}>
        Powered by The Curtain & Blind Co
      </div>
    </div>
  </div>
);
}
