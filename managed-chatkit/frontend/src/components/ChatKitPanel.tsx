import { useMemo } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

export function ChatKitPanel() {
  const getClientSecret = useMemo(
    () => createClientSecretFetcher(workflowId),
    []
  );

  const chatkit = useChatKit({
    api: { getClientSecret },

    // Keep ChatKit's own start screen (we'll use it for the welcome message)
    header: { enabled: false },

    composer: {
      placeholder: "Chat to Trax",
    },

    // ✅ Hide thumbs + retry
    threadItemActions: {
      feedback: false,
      retry: false,
    },

    // ✅ Option 1: ChatKit Start Screen greeting (heading + body copy)
    startScreen: {
      greeting: `Hi there 👋

I'm Trax, C&BCo's new AI agent in training. If at any point you'd prefer help from a human, just let me know and I'll send your query to our service team. How can I help you today?`,
      prompts: [
        {
          label: "Order Enquiry",
          prompt: "I'd like to check on an existing order",
          icon: "lucide:package",
        },
        {
          label: "Product Help",
          prompt: "I need help choosing the right product for my space",
          icon: "search",
        },
        {
          label: "Measure & Install",
          prompt: "I need guidance on measuring or installing my order",
          icon: "info",
        },
        {
          label: "Other",
          prompt: "I have a different question",
          icon: "circle-question",
        },
      ],
    },

    onClientTool: async (toolCall) => {
      console.log("Client tool called:", toolCall.name, toolCall);

      if (toolCall.name === "create_gorgias_ticket") {
        try {
          const response = await fetch(
            "https://n8n.curtainworld.net.au/webhook/gorgias-escalation",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                customer_email: toolCall.params.customer_email,
                customer_phone: toolCall.params.customer_phone || "",
                subject: toolCall.params.subject,
                summary: toolCall.params.summary,
                conversation_transcript: toolCall.params.conversation_transcript,
              }),
            }
          );

          if (!response.ok) {
            throw new Error("Failed to create ticket");
          }

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
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                order_number: toolCall.params.order_number,
                email: toolCall.params.email,
              }),
            }
          );

          if (!response.ok) {
            throw new Error("Failed to lookup order");
          }

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        backgroundColor: "#f8f7f4",
      }}
    >
      {/* Chat Area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChatKit control={chatkit.control} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 16px",
          textAlign: "center",
          fontSize: "11px",
          color: "#999",
          backgroundColor: "white",
          borderTop: "1px solid #eee",
        }}
      >
        Powered by The Curtain & Blind Co
      </div>
    </div>
  );
}
