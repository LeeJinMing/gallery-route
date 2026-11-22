import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { finalizeItinerary, registerActions } from "./gallery-actions.js";
import { Engine } from "./runtime/engine.js";
import { AgentNetwork, validateNetwork } from "./runtime/kernel.js";
import { LlmClient } from "./runtime/llm.js";

// Exercise the published graph and actual tool dispatcher against a local model.
const model = process.argv[2] ?? "Qwen3-4B";
const endpoint = "http://127.0.0.1:5184/v1";
const base = "http://127.0.0.1:5181";
const manifest = JSON.parse(await readFile(new URL("./agent-manifest.json", import.meta.url), "utf8"));
const entry = manifest.networks[0];
const json = JSON.parse(await readFile(new URL(entry.hocon, import.meta.url), "utf8"));
const network = new AgentNetwork(json, entry.name);
assert.deepEqual(validateNetwork(network).errors, []);
const engine = new Engine({ originUrl: base, modelOverride: model });
engine.finalizeAnswer = finalizeItinerary;
const receipts = [];
registerActions({
  register(definition) {
    engine.actions.register({ base, network: entry.name }, definition, input => {
      const result = definition.execute(input);
      receipts.push({ input, result });
      return result;
    });
  },
});
engine.top = {
  base, manifest, network,
  llm: new LlmClient({ baseUrl: endpoint, apiKey: "local-runcheck", trace: engine.trace }),
};

const reply = await engine.run(
  "I have 45 minutes for a quiet, step-free visit. I'd like to see Textile Archive and Sound Lab. "
  + "Use the route tool and tell me which exhibits fit.",
);
const receipt = receipts.find(({ input }) => input.minutes === 45 && input.stepFree && input.quiet
  && input.preferred?.includes("textiles") && input.preferred?.includes("sound"));
assert.ok(receipt, `No tool call captured all visitor constraints. Received: ${JSON.stringify(receipts.map(({ input }) => input))}. Reply: ${reply}`);
assert.equal(receipt.result.totalMinutes, 45);
assert.deepEqual(receipt.result.missedPreferred, ["sound"]);
assert.equal(reply.replace(/^\s*<\/think>\s*/i, "").trim(), receipt.result.itinerary,
  "The model answer did not match the route tool receipt.");
assert.ok(engine.trace.events.some(event => event.kind === "model_call" && event.phase === "end" && event.verifiedReal));
console.log(JSON.stringify({ model, receipt, reply }, null, 2));
