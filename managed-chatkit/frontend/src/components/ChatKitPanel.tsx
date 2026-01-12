import { useMemo, useEffect } from "react";
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
    composer: { placeholder: "Chat to Trax" },
    threadItemActions: {
      feedback: false,
      retry: false,
    },

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

          return await response.json();
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

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("=== DEBUG: Deep scan for ChatKit elements ===");
      
      const iframes = document.querySelectorAll('iframe');
      console.log("Iframes found:", iframes.length);
      iframes.forEach((iframe, i) => {
        console.log(`Iframe ${i}:`, iframe.src, iframe);
      });

      const contentEditables = document.querySelectorAll('[contenteditable="true"]');
      console.log("Contenteditable elements:", contentEditables.length);
      contentEditables.forEach((el, i) => {
        console.log(`Contenteditable ${i}:`, el);
      });

      const shadowHosts = document.querySelectorAll('*');
      let shadowCount = 0;
      shadowHosts.forEach((el) => {
        if (el.shadowRoot) {
          shadowCount++;
          console.log("Shadow DOM host found:", el);
          console.log("Shadow content:", el.shadowRoot.innerHTML.substring(0, 500));
        }
      });
      console.log("Total shadow DOMs:", shadowCount);

      const divWithRole = document.querySelectorAll('[role="textbox"]');
      console.log("Div textboxes (role=textbox):", divWithRole.length);

      const chatKitContainer = document.querySelector('[class*="chatkit"], [class*="ChatKit"], [data-chatkit]');
      console.log("ChatKit container:", chatKitContainer);

      console.log("Full body HTML preview:", document.body.innerHTML.substring(0, 2000));
      
      console.log("=== END DEBUG ===");
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

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
            C&amp;BCo&apos;s AI Assistant
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
