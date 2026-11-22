const webLLM = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.89/lib/index.js";
const toolName = "website_plan_visit";
const exhibits = ["paper", "sound", "textiles", "light"];
const exhibitNames = {
  paper: /\bpaper works\b/i,
  sound: /\bsound lab\b/i,
  textiles: /\btextile archive\b/i,
  light: /\blight studio\b/i,
};
const requestSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    minutes: { type: "integer", minimum: 0, maximum: 180 },
    stepFree: { type: "boolean" },
    quiet: { type: "boolean" },
    preferred: { type: "array", items: { type: "string", enum: exhibits } },
  },
  required: ["minutes", "stepFree", "quiet", "preferred"],
};
const prompt = [
  "Extract the visit preferences from the visitor messages into JSON.",
  "Carry forward earlier facts if the visitor only supplies a missing detail.",
  "Copy the supplied time budget in minutes.",
  "stepFree is true for a step-free route or no stairs. quiet is true for a quiet route or no noise.",
  "Preferred exhibit IDs: Paper Works is paper, Sound Lab is sound, Textile Archive is textiles, Light Studio is light.",
  "Include requested exhibits even if a preference may conflict. Never select additional exhibits. Default booleans to false.",
].join(" ");

function answer(content) {
  return { content, toolCalls: [], finishReason: "stop" };
}

function explicitMinutes(requests) {
  for (const text of requests.toReversed()) {
    const duration = [...text.matchAll(/(?:^|[^\d.-])(\d{1,3})\s*(?:minutes?|mins?)\b/gi)].at(-1);
    if (duration) return Number(duration[1]);
    if (/^\s*\d{1,3}[.!]?\s*$/.test(text)) return parseInt(text, 10);
  }
  return undefined;
}

function explicitFlag(requests, enable, disable) {
  for (const text of requests.toReversed()) {
    if (disable.test(text)) return false;
    if (enable.test(text)) return true;
  }
  return undefined;
}

function explicitPreferences(requests, inferred) {
  const preferred = new Set(inferred);
  for (const text of requests) {
    for (const [id, name] of Object.entries(exhibitNames)) {
      const mention = name.exec(text);
      if (!mention) continue;
      const before = text.slice(0, mention.index);
      if (/\b(?:skip|avoid|exclude|drop)\s+(?:the\s+)?$/i.test(before)) preferred.delete(id);
      else preferred.add(id);
    }
  }
  return [...preferred];
}

export function createBrowserModel(generate) {
  return {
    baseUrl: "browser://webllm",
    mock: false,
    async chat({ messages, tools, signal }) {
      signal?.throwIfAborted();
      const tool = messages.findLast(message => message.role === "tool" && message.name === toolName);
      if (tool) {
        const receipt = JSON.parse(tool.content);
        return answer(receipt.status === "succeeded"
          ? receipt.result.itinerary
          : "I could not calculate a route with those preferences. Check the time budget or use the form.");
      }
      if (!tools?.some(entry => entry.function.name === toolName)) {
        return answer("The route tool is unavailable. Use the itinerary form above.");
      }
      const requests = messages.filter(message => message.role === "user" && typeof message.content === "string")
        .slice(-4).map(message => message.content);
      const minutes = explicitMinutes(requests);
      if (minutes === undefined) return answer("How many minutes do you have for the visit?");
      if (minutes < 1 || minutes > 180) return answer("Please give a whole-minute budget from 1 to 180.");
      const parsed = JSON.parse(await generate([
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ messages: requests, minutes }) },
      ], requestSchema, signal));
      signal?.throwIfAborted();
      if (typeof parsed?.stepFree !== "boolean" || typeof parsed.quiet !== "boolean"
          || !Array.isArray(parsed.preferred) || parsed.preferred.some(id => !exhibits.includes(id))) {
        return answer("Please give a whole-minute budget from 1 to 180 and the exhibit names you want to see.");
      }
      const stepFree = explicitFlag(requests, /\bstep[ -]free\b|\bno stairs\b/i,
        /\b(?:no need for|don't need)\s+(?:a\s+)?step[ -]free\b|\bstairs are (?:fine|okay)\b/i);
      const quiet = explicitFlag(requests, /\bquiet\b|\bno noise\b/i,
        /\b(?:no need for|don't need)\s+(?:a\s+)?quiet\b|\bnoise is (?:fine|okay)\b/i);
      const args = {
        minutes, stepFree: stepFree ?? parsed.stepFree, quiet: quiet ?? parsed.quiet,
        preferred: explicitPreferences(requests, parsed.preferred),
      };
      return {
        content: "",
        toolCalls: [{
          id: crypto.randomUUID(), type: "function",
          function: { name: toolName, arguments: JSON.stringify(args) },
        }],
        finishReason: "tool_calls",
      };
    },
  };
}

export async function loadBrowserModel(onProgress) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("A WebGPU-compatible browser and GPU are required for on-device chat.");
  const variant = adapter.features.has("shader-f16") ? "q4f16" : "q4f32";
  const model = `Qwen2.5-1.5B-Instruct-${variant}_1-MLC`;
  const { CreateMLCEngine } = await import(webLLM);
  const engine = await CreateMLCEngine(model, { initProgressCallback: onProgress });
  return createBrowserModel(async (messages, schema, signal) => {
    const interrupt = () => engine.interruptGenerate();
    signal?.addEventListener("abort", interrupt, { once: true });
    try {
      signal?.throwIfAborted();
      const result = await engine.chat.completions.create({
        model, messages, temperature: 0, max_tokens: 128,
        response_format: { type: "json_object", schema: JSON.stringify(schema) },
      });
      if (!result.choices[0]?.message.content) throw new Error("The model returned no route request.");
      return result.choices[0].message.content;
    } finally {
      signal?.removeEventListener("abort", interrupt);
    }
  });
}
