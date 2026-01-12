import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { CHATKIT_API_DOMAIN_KEY, CHATKIT_API_URL } from "../lib/config";

export function ChatKitPanel() {
  const chatkit = useChatKit({
    api: { url: CHATKIT_API_URL, domainKey: CHATKIT_API_DOMAIN_KEY },
    composer: {
      attachments: { enabled: false },
    },
    startScreen: {
      greeting: `Hi! I'm Trax, C&BCo's new AI agent in training. If at any point you'd prefer help from a human, just let me know and I'll send your query to our service team. How can I help you today?`,
      prompts: [
        {
          name: "Order Enquiry",
          prompt: "I'd like to check on an existing order",
          icon: "search"
        },
        {
          name: "Product Help",
          prompt: "I need help choosing the right product for my space",
          icon: "lightbulb"
        },
        {
          name: "Measure & Install",
          prompt: "I need guidance on measuring or installing my order",
          icon: "ruler"
        },
        {
          name: "Other",
          prompt: "I have a different question",
          icon: "chat"
        }
      ]
    },
  });

  return (
    <div className="relative pb-8 flex h-[90vh] w-full rounded-2xl flex-col overflow-hidden bg-white shadow-lg">
      <ChatKit control={chatkit.control} className="block h-full w-full" />
    </div>
  );
}
