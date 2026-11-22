import { boot, Engine } from "./runtime/index.js";
import { loadBrowserModel } from "./browser-model.js";
import { planRoute, venue } from "./route.mjs";
import { exhibits, finalizeItinerary } from "./gallery-actions.js";

const planner = document.querySelector("#planner");
const result = document.querySelector("#result");
const exhibitFields = document.querySelector("#exhibits");
const names = new Map(venue.stops.map(stop => [stop.id, stop.name]));

for (const stop of exhibits) {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "preferred";
  checkbox.value = stop.id;
  label.append(checkbox, ` ${stop.name} · ${stop.minutes} min`);
  exhibitFields.append(label);
}

function displayRoute(route) {
  const title = document.createElement("h3");
  title.textContent = route.visits.length
    ? `${route.totalMinutes} of ${route.budgetMinutes} min · ${route.visits.length} exhibits`
    : "No exhibit fits these constraints";
  const details = document.createElement("p");
  details.textContent = route.visits.length
    ? `Walk: ${route.path.map(id => names.get(id)).join(" → ")}`
    : "Try adding time or adjusting your preferences.";
  const visits = document.createElement("p");
  visits.textContent = route.visits.length
    ? `Visit: ${route.visits.map(stop => stop.name).join(", ")}.`
    : "";
  const missed = document.createElement("p");
  missed.textContent = route.missedPreferred.length
    ? `Outside this itinerary: ${route.missedPreferred.map(id => names.get(id)).join(", ")}.`
    : "";
  result.replaceChildren(title, details, ...[visits, missed].filter(node => node.textContent));
}

planner.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(planner);
  displayRoute(planRoute({
    minutes: Number(data.get("minutes")),
    stepFree: data.has("stepFree"),
    quiet: data.has("quiet"),
    preferred: data.getAll("preferred"),
  }));
});
const base = new URL("./", import.meta.url);
const options = { originUrl: base.href, sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", base).href };
const localForm = document.querySelector("#device-chat");
const request = localForm.querySelector("textarea");
const ask = localForm.querySelector("button");
const deviceStatus = document.querySelector("#device-status");
const conversation = document.querySelector("#conversation");
const device = new Engine(options);
let deviceReady;

function addMessage(label, text) {
  const item = document.createElement("li");
  const heading = document.createElement("strong");
  heading.textContent = label;
  item.append(heading, " ", text);
  conversation.append(item);
}

localForm.addEventListener("submit", async event => {
  event.preventDefault();
  const question = request.value.trim();
  if (!question || ask.disabled) return;
  addMessage("You", question);
  ask.disabled = request.disabled = true;
  deviceStatus.textContent = "Preparing on-device inference…";
  try {
    deviceReady ??= Promise.all([
      device.loadTop(),
      loadBrowserModel(({ progress }) => {
        deviceStatus.textContent = `Preparing model: ${Math.round(progress * 100)}%`;
      }),
    ]).then(([, llm]) => {
      device.top.llm = llm;
      device.finalizeAnswer = finalizeItinerary;
    }).catch(error => {
      deviceReady = undefined;
      throw error;
    });
    await deviceReady;
    deviceStatus.textContent = "Planning on this device…";
    addMessage("Visit planner", await device.run(question));
    deviceStatus.textContent = "Processed on this device.";
    request.value = "";
  } catch (error) {
    deviceStatus.textContent = `On-device chat unavailable: ${error.message} The itinerary form above is ready to use.`;
  } finally {
    ask.disabled = request.disabled = false;
  }
});

const provider = document.querySelector(".card details");
provider.addEventListener("toggle", async () => {
  if (!provider.open || provider.dataset.booted) return;
  provider.dataset.booted = "true";
  const status = document.querySelector("#agent-status");
  try {
    const { engine } = await boot("#agent-app", options);
    engine.finalizeAnswer = finalizeItinerary;
    status.textContent = "Configure a supported model in AI model settings.";
  } catch {
    delete provider.dataset.booted;
    status.textContent = "The external provider interface could not start.";
  }
});
