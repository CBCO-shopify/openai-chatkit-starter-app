import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { CHATKIT_API_DOMAIN_KEY, CHATKIT_API_URL } from "../lib/config";

export function ChatKitPanel() {
  const chatkit = useChatKit({
    api: { url: CHATKIT_API_URL, domainKey: CHATKIT_API_DOMAIN_KEY },
    startScreen: {
      greeting: "TEST GREETING - Does this appear?"
    },
  });

  return (
    <div className="relative pb-8 flex h-[90vh] w-full rounded-2xl flex-col overflow-hidden bg-white shadow-lg">
      <ChatKit control={chatkit.control} className="block h-full w-full" />
    </div>
  );
}
