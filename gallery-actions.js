import { planRoute, venue } from "./route.mjs";

export const exhibits = venue.stops.filter(stop => stop.id !== venue.start);

export function finalizeItinerary(answer, receipts) {
  const route = receipts.findLast(entry => entry.name === "plan_visit");
  return route?.receipt.result.itinerary ?? answer;
}

export function registerActions(actions, { expose = false } = {}) {
  actions.register({
    name: "plan_visit",
    description: "Calculate and return an itinerary that returns to the Entrance.",
    effect: "read",
    availability: expose ? "bridge" : "local-only",
    callerOrigins: expose ? ["*"] : [],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["minutes"],
      properties: {
        minutes: { type: "integer", minimum: 1, maximum: 180 },
        stepFree: { type: "boolean" },
        quiet: { type: "boolean" },
        preferred: {
          type: "array",
          maxItems: exhibits.length,
          items: { type: "string", enum: exhibits.map(stop => stop.id) },
        },
      },
    },
    execute: input => {
      const route = planRoute(input);
      const names = new Map(venue.stops.map(stop => [stop.id, stop.name]));
      const walk = route.path.map(id => names.get(id)).join(" → ");
      const visits = route.visits.map(stop => stop.name).join(", ");
      const missed = route.missedPreferred.map(id => names.get(id)).join(", ");
      const itinerary = [
        route.visits.length
          ? `Total: ${route.totalMinutes} minutes. Visit: ${visits}. Walk: ${walk}.`
          : "No exhibit fits these constraints.",
        missed ? `Outside this itinerary: ${missed}.` : "",
      ].filter(Boolean).join(" ");
      return { itinerary, ...route };
    },
  });
}
