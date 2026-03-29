import { readFileSync } from "node:fs";

export function readUserScriptSource() {
  return readFileSync(new URL("../userscript/convoglide.user.js", import.meta.url), "utf8");
}

export function buildInjectedUserScript(maxMessageNodes) {
  const source = readUserScriptSource();
  if (!Number.isFinite(maxMessageNodes) || maxMessageNodes <= 0) {
    return source;
  }

  return [
    `localStorage.setItem("convoglide:max-message-nodes", "${Math.floor(maxMessageNodes)}");`,
    source,
  ].join("\n");
}
