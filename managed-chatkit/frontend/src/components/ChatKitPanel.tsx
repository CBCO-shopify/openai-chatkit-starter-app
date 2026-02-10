import { useMemo, useEffect, useRef, useState } from "react";
import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { createClientSecretFetcher, workflowId } from "../lib/chatkitSession";
import { uploadChatImage, UploadError } from "../lib/uploadToSupabase";

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

// Pre-chat welcome screen component
function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        backgroundColor: "#fff",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "var(--trax-green, #4A7C59)",
          color: "#fff",
          borderBottom: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "16px" }}>Trax</div>
        <div style={{ fontSize: "12px", opacity: 0.9 }}>
          C&amp;BCo&apos;s AI Assistant in training
        </div>
      </div>

      {/* Welcome content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>&#x1F44B;</div>
        <h2 style={{ margin: "0 0 8px 0", color: "#333", fontSize: "20px" }}>
          Hi there!
        </h2>
        <p style={{ margin: "0 0 24px 0", color: "#666", fontSize: "14px", maxWidth: "280px" }}>
          I'm Trax, here to help with orders, products or any questions you have about curtains, blinds and shutters.
        </p>
        
        <button
          onClick={onStart}
          style={{
            backgroundColor: "var(--trax-green, #4A7C59)",
            color: "#fff",
            border: "none",
            borderRadius: "24px",
            padding: "14px 32px",
            fontSize: "16px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 2px 8px rgba(74, 124, 89, 0.3)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "scale(1.02)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(74, 124, 89, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(74, 124, 89, 0.3)";
          }}
        >
          Start chatting
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 16px",
          textAlign: "center",
          fontSize: "11px",
          backgroundColor: "white",
          borderTop: "1px solid #eee",
          color: "#999",
        }}
      >
        Powered by The Curtain &amp; Blind Company
      </div>
    </div>
  );
}

// The actual chat component (only mounted after user clicks Start)
function ActiveChat() {
  const getClientSecret = useMemo(
    () => createClientSecretFetcher(workflowId),
    []
  );

  const conversationRef = useRef<string[]>([]);
  const hasEscalatedRef = useRef(false);

  // Image upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const uploadedImageUrlsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    uploadedImageUrlsRef.current = uploadedImageUrls;
  }, [uploadedImageUrls]);

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
            
            fetch("/api/log-message", {
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
        }
        
        // On response.end, fetch assistant message from OpenAI
        if (eventType === 'response.end') {
          const threadId = sessionStorage.getItem('trax_thread_id');
          if (threadId) {
            console.log('[Trax] Response ended, fetching assistant message...');
            
            fetch("/api/fetch-assistant-message", {
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
    console.log("[Trax] Session started:", getSessionId());
    
    // Log session when user leaves page (backup)
    const handleBeforeUnload = () => {
      if (conversationRef.current.length > 0 && !hasEscalatedRef.current) {
        navigator.sendBeacon(
          "/api/log-session",
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
      greeting: "Hi there!",
      prompts: [
        { label: "Check an order", prompt: "I'd like to check my order status", icon: "search" },
        { label: "Ask me anything", prompt: "I have a question about products or installation", icon: "circle-question" },
        { label: "Submit enquiry", prompt: "I need to speak with someone from your team", icon: "user" },
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
            await fetch("/api/log-message", {
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
            await fetch("/api/log-message", {
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
          const response = await fetch("/api/log-session", {
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

        try {
          const response = await fetch("/api/gorgias-escalation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: getSessionId(),
              thread_id: sessionStorage.getItem('trax_thread_id') || toolCall.params.thread_id || "",
              customer_email: toolCall.params.customer_email,
              customer_phone: toolCall.params.customer_phone || "",
              subject: toolCall.params.subject,
              summary: toolCall.params.summary,
              conversation_transcript: toolCall.params.conversation_transcript,
              image_urls: uploadedImageUrlsRef.current,
            }),
          });

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

      // ============================================
      // ORDER LOOKUP HANDLER
      // ============================================
      if (toolCall.name === "lookup_order") {
        try {
          const response = await fetch("/api/order-lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_number: toolCall.params.order_number,
              email: toolCall.params.email,
            }),
          });

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

      // ============================================
      // GET VARIANT ID HANDLER
      // ============================================
      if (toolCall.name === "get_variant_id") {
        console.log("get_variant_id handler entered");
        console.log("Params:", toolCall.params);
        
        try {
          console.log("Making fetch request to n8n...");
          const response = await fetch("/api/get-variant-id", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: toolCall.params.product_id,
              color_name: toolCall.params.color_name || toolCall.params.color,
            }),
          });

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
      // ADD TO SHOPIFY CART HANDLER
      // ============================================
      if (toolCall.name === "add_to_shopify_cart") {
        console.log("add_to_shopify_cart handler entered");
        console.log("Params:", toolCall.params);

        return new Promise((resolve) => {
          // Listen for response from parent Shopify window
          const handleMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'ADD_TO_CART_RESULT') {
              window.removeEventListener('message', handleMessage);
              
              if (event.data.success) {
                console.log("[Trax] Sample added to cart:", event.data.item);
                resolve({
                  success: true,
                  message: "Sample added to cart successfully! The customer can view their cart and checkout when ready.",
                  item: event.data.item
                });
              } else {
                console.error("[Trax] Cart add failed:", event.data.error);
                resolve({
                  success: false,
                  message: "Failed to add to cart: " + (event.data.error || "Unknown error")
                });
              }
            }
          };
          
          window.addEventListener('message', handleMessage);
          
          // Send message to parent Shopify window
          window.parent.postMessage({
            type: 'ADD_TO_CART',
            variantId: toolCall.params.variant_id,
            quantity: toolCall.params.quantity || 1
          }, '*');
          
          console.log("[Trax] postMessage sent to parent window");
          
          // Timeout after 10 seconds
          setTimeout(() => {
            window.removeEventListener('message', handleMessage);
            resolve({
              success: false,
              message: "Cart operation timed out. Please try adding the sample directly from the website."
            });
          }, 10000);
        });
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

      return { error: "Unknown tool: " + toolCall.name };
    },
  });

  const handleImageUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await uploadChatImage({
        userId: getUserId(),
        sessionId: getSessionId(),
        file,
      });

      setUploadedImageUrls((prev) => [...prev, result.url]);

      // Send a clean text message — ChatKit does not render markdown images
      chatkit.sendUserMessage({
        text: "I've uploaded an image.",
      });

      console.log("[Trax] Image uploaded:", result.url);
    } catch (err) {
      const message =
        err instanceof UploadError
          ? err.message
          : "Failed to upload image. Please try again.";
      setUploadError(message);
      setTimeout(() => setUploadError(null), 5000);
      console.error("[Trax] Image upload error:", err);
    } finally {
      setIsUploading(false);
    }
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
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "var(--trax-green)",
          color: "var(--trax-paper)",
          borderBottom: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: "16px" }}>Trax</div>
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

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await handleImageUpload(file);
          e.target.value = "";
        }}
      />

      {/* Upload button bar */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid #eee",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "white",
        }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            fontSize: "13px",
            color: "var(--trax-green, #4A7C59)",
            background: "var(--trax-paper, #f5f2f0)",
            border: "1px solid var(--trax-green, #4A7C59)",
            borderRadius: "var(--trax-radius, 8px)",
            cursor: isUploading ? "wait" : "pointer",
            opacity: isUploading ? 0.6 : 1,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          {isUploading ? "Uploading..." : "Upload image"}
        </button>

        {uploadError && (
          <span style={{ color: "#dc2626", fontSize: "12px" }}>
            {uploadError}
          </span>
        )}
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

// Main component - shows welcome screen first, then active chat
export function ChatKitPanel() {
  const [chatStarted, setChatStarted] = useState(false);

  if (!chatStarted) {
    return <WelcomeScreen onStart={() => setChatStarted(true)} />;
  }

  return <ActiveChat />;
}
