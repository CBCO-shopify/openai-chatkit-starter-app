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

      if (toolCall.name === "lookup_order") {
        try {
          const response = await fetch("https://n8n.curtainworld.net.au/webhook/order-lookup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              order_number: toolCall.arguments.order_number,
              email: toolCall.arguments.email
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

      return { error: "Unknown tool" };
    }
