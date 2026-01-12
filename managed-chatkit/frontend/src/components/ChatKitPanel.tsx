import { useEffect, useMemo, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";

type WelcomeOption = {
  id: string;
  label: string;
  prompt: string;
};

const WELCOME_OPTIONS: WelcomeOption[] = [
  { id: "order", label: "Order enquiry", prompt: "I'd like to check on an existing order" },
  { id: "product", label: "Product help", prompt: "I need help choosing the right product for my space" },
  { id: "install", label: "Measure & install", prompt: "I need guidance on measuring or installing my order" },
  { id: "other", label: "Other", prompt: "I have a different question" },
];

// Only show once per “new session” in this browser.
// If you want it to re-appear for a truly new server-side session, we can key this differently later.
const storageKey = `trax_welcome_overlay_shown:${workflowId}`;

export function ChatKitPanel() {
  const getClientSecret = useMemo(() => createClientSecretFetcher(workflowId), []);
  const [showWelcome, setShowWelcome] = useState(false);

  const chatkit = useChatKit({
    api: { getClientSecret },

    // We render our own header above ChatKit
    header: { enabled: false },

    composer: { placeholder: "Chat to Trax" },

    threadItemActions: { feedback: false, retry: false },

    // IMPORTANT: do not set startScreen.enabled (your build rejects it)

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

  // Decide if we should show the welcome overlay:
  // - only if user hasn't started (thread is empty)
  // - only if we haven't shown it already for this “session” in this browser
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const alreadyShown = localStorage.getItem(storageKey) === "1";
    if (alreadyShown) {
      setShowWelcome(false);
      return;
    }

    // If there are already thread items, it's not a new session
    const control: any = chatkit.control;
    const items = control?.thread?.items ?? control?.threadItems ?? [];
    if (Array.isArray(items) && items.length > 0) {
      setShowWelcome(false);
      return;
    }

    setShowWelcome(true);
  }, [chatkit.control]);

  // Hide overlay as soon as the user starts chatting (thread gets items)
  useEffect(() => {
    if (!showWelcome) return;

    const interval = window.setInterval(() => {
      const control: any = chatkit.control;
      const items = control?.thread?.items ?? control?.threadItems ?? [];

      if (Array.isArray(items) && items.length > 0) {
        localStorage.setItem(storageKey, "1");
        setShowWelcome(false);
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [showWelcome, chatkit.control]);

  // Send text via whatever API your ChatKit build exposes
  const sendText = async (text: string) => {
    const control: any = chatkit.control;
    if (!control) return;

    // Try common ChatKit methods
    if (typeof control.sendMessage === "function") {
      await control.sendMessage({ text });
    } else if (typeof control.send === "function") {
      await control.send({ text });
    } else if (typeof control.submitMessage === "function") {
      await control.submitMessage({ text });
    } else if (control.composer && typeof control.composer.setText === "function") {
      control.composer.setText(text);
      if (typeof control.composer.submit === "function") {
        await control.composer.submit();
      }
    } else {
      // If none exist, at least put it in the composer so the user can press send
      if (control.composer && typeof control.composer.setText === "function") {
        control.composer.setText(text);
      } else {
        console.warn("No known send API available on chatkit.control");
      }
    }

    // After user initiates, hide + persist
    localStorage.setItem(storageKey, "1");
    setShowWelcome(false);
  };

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
      {/* Top Header */}
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
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <ChatKit control={chatkit.control} style={{ height: "100%", width: "100%" }} />

        {/* Welcome overlay that looks “in-chat” */}
        {showWelcome && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              padding: "16px",
              pointerEvents: "none", // allow scroll behind, but we re-enable on the card
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "560px",
                background: "transparent",
                pointerEvents: "auto",
              }}
            >
              <div
                style={{
                  background: "transparent",
                  padding: "0px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "18px", marginBottom: "6px" }}>
                  Hi! I’m Trax 👋
                </div>
                <div style={{ opacity: 0.85, marginBottom: "12px", lineHeight: 1.4 }}>
                  I’m C&amp;BCo’s new AI agent in training. If you’d prefer help from a human at
                  any point, tell me and I’ll send your query to our service team. How can I help
                  today?
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  {WELCOME_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => sendText(o.prompt)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        background: "var(--trax-paper)",
                        color: "var(--trax-green)",
                        border: "1px solid var(--trax-green)",
                        borderRadius: "var(--trax-radius)",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--trax-green)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--trax-paper)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--trax-paper)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--trax-green)";
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: "10px", fontSize: "12px", opacity: 0.8 }}>
                  Tip: you can ask for a human any time.
                </div>
              </div>
            </div>
          </div>
        )}
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
        <div style={{ marginBottom: "4px", color: "var(--trax-green)" }}>
          Tip: you can ask for a human any time.
        </div>
        <div style={{ color: "#999" }}>Powered by The Curtain &amp; Blind Co</div>
      </div>
    </div>
  );
}
