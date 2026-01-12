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
    header: { enabled: false },
    startScreen: {
      greeting: "Hi! I'm Trax, C&BCo's new AI agent in training. If at any point you'd prefer help from a human, just let me know and I'll send your query to our service team. How can I help you today?",
      prompts: [
        {
          label: "Order Enquiry",
          prompt: "I'd like to check on an existing order",
          icon: "lucide:package"
        },
        {
          label: "Product Help",
          prompt: "I need help choosing the right product for my space",
          icon: "search"
        },
        {
          label: "Measure & Install",
          prompt: "I need guidance on measuring or installing my order",
          icon: "info"
        },
        {
          label: "Other",
          prompt: "I have a different question",
          icon: "circle-question"
        }
      ]
    },
    onClientTool: async (toolCall) => {
      console.log("Client tool called:", toolCall.name, toolCall);
      
      if (toolCall.name === "create_gorgias_ticket") {
        try {
          const response = await fetch("https://n8n.curtainworld.net.au/webhook/gorgias-escalation", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              customer_email: toolCall.params.customer_email,
              customer_phone: toolCall.params.customer_phone || "",
              subject: toolCall.params.subject,
              summary: toolCall.params.summary,
              conversation_transcript: toolCall.params.conversation_transcript
            })
          });
          if (!response.ok) {
            throw new Error("Failed to create ticket");
          }
          return {
            success: true,
            message: "Support ticket created successfully. Our team will be in touch within 1 business day."
          };
        } catch (error) {
          console.error("Gorgias ticket error:", error);
          return {
            success: false,
            message: "There was an issue creating the support ticket. Please call us on 1300 301 368."
          };
        }
      }

      if (toolCall.name === "lookup_order") {
        try {
          const response = await fetch("https://n8n.curtainworld.net.au/webhook/order-lookup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              order_number: toolCall.params.order_number,
              email: toolCall.params.email
            })
          });
          if (!response.ok) {
            throw new Error("Failed to lookup order");
          }
          const data = await response.json();
          return data;
        } catch (error) {
          console.error("Order lookup error:", error);
          return {
            success: false,
            message: "There was an issue looking up your order. Please try again or call us on 1300 301 368."
          };
        }
      }
      
      return { error: "Unknown tool: " + toolCall.name };
    }
  });

  return (
    <>
      <style>{`
        /* Make greeting text smaller */
        [data-chatkit-greeting],
        .chatkit-greeting,
        [class*="greeting"],
        [class*="Greeting"] {
          font-size: 16px !important;
          font-weight: 400 !important;
          line-height: 1.5 !important;
        }
        
        /* Style thinking indicator */
        [data-chatkit-thinking],
        [class*="thinking"],
        [class*="Thinking"] {
          font-size: 14px !important;
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%", backgroundColor: "#f8f7f4" }}>
        {/* Header */}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "12px", 
          padding: "12px 16px", 
          backgroundColor: "#3d6b4f", 
          color: "white" 
        }}>
          <div style={{ 
            width: "40px", 
            height: "40px", 
            borderRadius: "50%", 
            backgroundColor: "rgba(255,255,255,0.2)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            fontSize: "18px",
            fontWeight: "bold"
          }}>
            
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "16px" }}>Traxine</div>
            <div style={{ fontSize: "12px", opacity: 0.8 }}>C&BCo's AI Assistant</div>
          </div>
        </div>
        
        {/* Chat Area */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ChatKit control={chatkit.control} style={{ height: "100%", width: "100%" }} />
        </div>
        
        {/* Footer */}
        <div style={{ 
          padding: "8px 16px", 
          textAlign: "center", 
          fontSize: "11px", 
          color: "#999", 
          backgroundColor: "white", 
          borderTop: "1px solid #eee" 
        }}>
          Powered by The Curtain & Blind Co
        </div>
      </div>
    </>
  );
}
