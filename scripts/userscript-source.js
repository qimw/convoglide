import { readFileSync } from "node:fs";

export function readUserScriptSource() {
  return readFileSync(new URL("../userscript/convoglide.user.js", import.meta.url), "utf8");
}

export function buildInjectedUserScript(maxMessageNodes, options = {}) {
  const source = readUserScriptSource();
  const steps = [];

  if (Number.isFinite(maxMessageNodes) && maxMessageNodes > 0) {
    steps.push(`localStorage.setItem("convoglide:max-message-nodes", "${Math.floor(maxMessageNodes)}");`);
  }
  if (Number.isFinite(options.bootstrapTurnWindow) && options.bootstrapTurnWindow > 0) {
    steps.push(
      `localStorage.setItem("convoglide:bootstrap-turn-window", "${Math.floor(options.bootstrapTurnWindow)}");`,
    );
  }

  if (!steps.length) {
    return source;
  }

  return [...steps, source].join("\n");
}
