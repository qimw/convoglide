export const MAIN_CONVERSATION_RESPONSE_RE = /\/backend-api\/conversation\/[0-9a-f-]+(?:\?|$)/i;

export function isMainConversationResponseUrl(url) {
  return MAIN_CONVERSATION_RESPONSE_RE.test(String(url || ""));
}

export function pickMainConversationEventFromEvents(events) {
  const list = Array.isArray(events) ? events : [];
  return list.find((event) => isMainConversationResponseUrl(event?.url)) || null;
}
