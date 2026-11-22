import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { AgentNetwork, validateNetwork } from "./runtime/kernel.js";
import { Engine } from "./runtime/engine.js";
import { finalizeItinerary, registerActions } from "./gallery-actions.js";
import { createBrowserModel, loadBrowserModel } from "./browser-model.js";
import { planRoute, venue } from "./route.mjs";
import { deleteByokProfile, loadTabByokSetup, saveTabByokSetup, upsertByokProfile } from "./runtime/byok.js";

test("quiet and step-free itinerary includes dwell time and return walk", () => {
  const route = planRoute({ minutes: 45, stepFree: true, quiet: true, preferred: ["textiles", "sound"] });
  assert.deepEqual(route.visits.map(stop => stop.id), ["paper", "textiles"]);
  assert.equal(route.totalMinutes, 45);
  assert.equal(route.path.at(0), venue.start);
  assert.equal(route.path.at(-1), venue.start);
  assert.deepEqual(route.missedPreferred, ["sound"]);
});

test("a short visit reports that no preferred exhibit fits", () => {
  const route = planRoute({ minutes: 10, preferred: ["light"] });
  assert.equal(route.totalMinutes, 0);
  assert.deepEqual(route.visits, []);
  assert.deepEqual(route.missedPreferred, ["light"]);
  assert.throws(() => planRoute({ minutes: 0 }), RangeError);
  assert.throws(() => planRoute({ minutes: 45, preferred: ["unknown"] }), RangeError);
});

test("the reference kernel validates the published front agent and specialist", async () => {
  const manifest = JSON.parse(await readFile(new URL("./agent-manifest.json", import.meta.url), "utf8"));
  const entry = manifest.networks[0];
  const config = JSON.parse(await readFile(new URL(entry.hocon, import.meta.url), "utf8"));
  const network = new AgentNetwork(config, entry.name);
  const { errors } = validateNetwork(network);
  assert.deepEqual(errors, []);
  assert.equal(network.findFrontMan(), entry.front_man);
  assert.ok(network.getAgentSpec("route_specialist"));
});

test("the reference engine dispatches a model tool call and receives the itinerary", async () => {
  const manifest = JSON.parse(await readFile(new URL("./agent-manifest.json", import.meta.url), "utf8"));
  const entry = manifest.networks[0];
  const config = JSON.parse(await readFile(new URL(entry.hocon, import.meta.url), "utf8"));
  const base = "https://gallery.example";
  const scope = { base, network: entry.name };
  const engine = new Engine({ originUrl: base });
  engine.finalizeAnswer = finalizeItinerary;
  registerActions({ register: definition => engine.actions.register(scope, definition) });
  let calls = 0;
  let receipt;
  // Only the model response is simulated. Tool binding, validation and execution use the real runtime.
  engine.top = {
    base, manifest, network: new AgentNetwork(config, entry.name),
    llm: { async chat({ messages, tools }) {
      assert.ok(tools.some(tool => tool.function.name === "website_plan_visit"));
      if (++calls === 1) {
        return { content: "", toolCalls: [{ id: "route", type: "function", function: {
          name: "website_plan_visit",
          arguments: JSON.stringify({ minutes: 45, quiet: true, stepFree: true, preferred: ["sound", "textiles"] }),
        } }] };
      }
      receipt = JSON.parse(messages.find(message => message.role === "tool").content);
      return { content: "Wrong route: Sound Lab, 30 minutes.", toolCalls: [] };
    } },
  };
  const reply = await engine.run("Plan a 45-minute quiet, step-free visit.");
  assert.equal(calls, 2);
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.result.totalMinutes, 45);
  assert.deepEqual(receipt.result.missedPreferred, ["sound"]);
  assert.equal(reply, receipt.result.itinerary);
  assert.match(reply, /Entrance → Paper Works → Textile Archive → Paper Works → Entrance/);
  assert.match(reply, /Outside this itinerary: Sound Lab/);
  assert.match(reply, /45 minutes/);
});

test("the browser model asks for a missing budget and dispatches a tool after clarification", async () => {
  const tool = { function: { name: "website_plan_visit" } };
  const initial = { role: "user", content: "I need a quiet step-free visit and want Textile Archive." };
  let rounds = 0;
  const model = createBrowserModel(async messages => {
    const request = JSON.parse(messages[1].content);
    assert.equal(request.messages[0], initial.content);
    assert.equal(request.minutes, 45);
    rounds++;
    return JSON.stringify({
      minutes: 30, stepFree: false, quiet: false, preferred: [],
    });
  });
  const prompt = await model.chat({ messages: [initial], tools: [tool] });
  assert.equal(prompt.content, "How many minutes do you have for the visit?");
  assert.equal(rounds, 0);
  const turn = await model.chat({
    messages: [initial, { role: "assistant", content: prompt.content }, { role: "user", content: "45 minutes." }],
    tools: [tool],
  });
  assert.deepEqual(JSON.parse(turn.toolCalls[0].function.arguments), {
    minutes: 45, stepFree: true, quiet: true, preferred: ["textiles"],
  });
});

test("on-device inference reports when the browser has no WebGPU", async () => {
  await assert.rejects(loadBrowserModel(), /WebGPU-compatible browser/);
});

test("a deleted provider cannot be restored by another tab's saved session", () => {
  const names = ["localStorage", "sessionStorage"];
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  try {
    for (const name of names) {
      const data = new Map();
      Object.defineProperty(globalThis, name, { configurable: true, value: {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
      } });
    }
    const { profile: first } = upsertByokProfile({
      key: "fixture-one", router: "https://one.example/v1", model: "first",
    });
    saveTabByokSetup(first);
    upsertByokProfile({ key: "fixture-two", router: "https://two.example/v1", model: "second" });
    assert.equal(loadTabByokSetup().id, first.id);
    deleteByokProfile(first.id);
    assert.equal(loadTabByokSetup().key, "");
    assert.equal(loadTabByokSetup().key, "");
  } finally {
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]);
      else delete globalThis[name];
    });
  }
});
