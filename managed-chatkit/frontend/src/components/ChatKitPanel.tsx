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
    onClientToolCall: async (toolCall) => {
      console.log("Client tool called:", toolCall.name, toolCall.arguments);
      
      if (toolCall.name === "create_gorgias_ticket") {
        try {
          const response = await fetch("https://n8n.curtainworld.net.au/webhook/gorgias-escalation", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              customer_email: toolCall.arguments.customer_email,
              customer_phone: toolCall.arguments.customer_phone || "",
              subject: toolCall.arguments.subject,
              summary: toolCall.arguments.summary,
              conversation_transcript: toolCall.arguments.conversation_transcript
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
      
      return { error: "Unknown tool: " + toolCall.name };
    }
  });

  return (
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
          justifyContent: "center" 
        }}>
          <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "16px" }}>Curtain & Blind Co</div>
          <div style={{ fontSize: "12px", opacity: 0.8 }}>Ask us anything about curtains & blinds</div>
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
  );
}
