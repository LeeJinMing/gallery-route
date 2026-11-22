// Synthetic venue used to demonstrate route planning without collecting visitor data.
export const venue = {
  name: "Meridian Design Museum",
  start: "lobby",
  stops: [
    { id: "lobby", name: "Entrance", minutes: 0, quiet: true },
    { id: "paper", name: "Paper Works", minutes: 12, quiet: true },
    { id: "sound", name: "Sound Lab", minutes: 18, quiet: false },
    { id: "textiles", name: "Textile Archive", minutes: 15, quiet: true },
    { id: "light", name: "Light Studio", minutes: 20, quiet: false },
  ],
  links: [
    { from: "lobby", to: "paper", minutes: 3, stepFree: true, quiet: true },
    { from: "lobby", to: "sound", minutes: 2, stepFree: true, quiet: false },
    { from: "paper", to: "textiles", minutes: 6, stepFree: true, quiet: true },
    { from: "paper", to: "light", minutes: 2, stepFree: false, quiet: true },
    { from: "textiles", to: "light", minutes: 4, stepFree: true, quiet: true },
    { from: "sound", to: "light", minutes: 3, stepFree: true, quiet: false },
  ],
};

export function planRoute({ minutes, stepFree = false, quiet = false, preferred = [] }) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
    throw new RangeError("Choose a whole number of minutes from 1 to 180.");
  }
  const exhibits = venue.stops.filter(stop => stop.id !== venue.start);
  if (preferred.some(id => !exhibits.some(stop => stop.id === id))) {
    throw new RangeError("A preferred exhibit does not exist.");
  }
  const eligible = exhibits.filter(stop => !quiet || stop.quiet);
  const quietStops = new Set(venue.stops.filter(stop => stop.quiet).map(stop => stop.id));
  const edges = venue.links.filter(link => (!stepFree || link.stepFree)
    && (!quiet || (link.quiet && quietStops.has(link.from) && quietStops.has(link.to))));

  function shortestPath(from, to) {
    const pending = [{ id: from, minutes: 0, path: [from] }];
    const visited = new Set();
    while (pending.length) {
      pending.sort((a, b) => a.minutes - b.minutes);
      const current = pending.shift();
      if (visited.has(current.id)) continue;
      if (current.id === to) return current;
      visited.add(current.id);
      for (const edge of edges) {
        const next = edge.from === current.id ? edge.to : edge.to === current.id ? edge.from : null;
        if (next && !visited.has(next)) {
          pending.push({ id: next, minutes: current.minutes + edge.minutes, path: [...current.path, next] });
        }
      }
    }
    return null;
  }

  let best = { visits: [], path: [venue.start], totalMinutes: 0, preferredCount: 0 };
  function search(from, remaining, visits, path, elapsed, score) {
    const back = shortestPath(from, venue.start);
    if (!back || elapsed + back.minutes > minutes) return;
    const totalMinutes = elapsed + back.minutes;
    if (score > best.preferredCount || (score === best.preferredCount
      && (visits.length > best.visits.length || (visits.length === best.visits.length
        && totalMinutes < best.totalMinutes)))) {
      best = { visits, path: [...path, ...back.path.slice(1)], totalMinutes, preferredCount: score };
    }
    for (const next of remaining) {
      const leg = shortestPath(from, next.id);
      if (!leg) continue;
      search(next.id, remaining.filter(stop => stop.id !== next.id), [...visits, next],
        [...path, ...leg.path.slice(1)], elapsed + leg.minutes + next.minutes,
        score + Number(preferred.includes(next.id)));
    }
  }
  search(venue.start, eligible, [], [venue.start], 0, 0);
  return { ...best, stepFree, quiet, budgetMinutes: minutes,
    missedPreferred: [...new Set(preferred)].filter(id => !best.visits.some(stop => stop.id === id)) };
}
