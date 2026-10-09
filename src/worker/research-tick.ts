export async function researchTick(
  controls: {
    rssEnabled: boolean;
    automationEnabled: boolean;
    rssDue: boolean;
  },
  tasks: {
    research: () => Promise<unknown>;
    rss: () => Promise<unknown>;
    onError: (task: "research" | "rss") => void;
  },
) {
  // One serial dispatcher; RSS being disabled cannot disable saved schedules.
  if (controls.automationEnabled)
    try {
      await tasks.research();
    } catch {
      tasks.onError("research");
    }
  if (controls.rssEnabled && controls.rssDue)
    try {
      await tasks.rss();
    } catch {
      tasks.onError("rss");
    }
}
