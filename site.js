import { boot } from "./runtime/index.js";
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
const status = document.querySelector("#agent-status");
const base = new URL("./", import.meta.url);
try {
  const { engine } = await boot("#agent-app", {
    originUrl: base.href, sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", base).href,
  });
  engine.finalizeAnswer = finalizeItinerary;
  status.textContent = "Configure a supported model in AI model settings to plan from chat.";
} catch {
  status.textContent = "The chat agent could not start. The itinerary form is available above.";
}
