"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { generateNewsletter, saveNewsletter } from "./actions";
import type { EditionInput, SourceOption } from "./contracts";

export type ReaderChoice = "icp" | "personal" | "both";
/** What the planner is told about who the edition is for. The detail is read from the business profile. */
const READER_TEXT: Record<ReaderChoice, string> = {
  icp: "The business's primary ideal customer, as described in the business profile",
  personal:
    "The founder's personal readers, as described in the personal profile",
  both: "Primary: the business's ideal customer. Secondary: the founder's personal readers. Both are described in the profile",
};
const GROUPS: { kind: SourceOption["kind"]; label: string }[] = [
  { kind: "experience", label: "Content Bank · Experiences" },
  { kind: "trend_reaction", label: "Content Bank · Trend reactions" },
  { kind: "resource", label: "Content Bank · Resources" },
];
const today = () => new Date().toISOString().slice(0, 10);
const MAX_SOURCES = 8;

export function NewEdition({
  clientId,
  options,
  initialSourceIds,
  hasIcp,
  hasPersonalReaders,
}: {
  clientId: string;
  options: SourceOption[];
  initialSourceIds: string[];
  hasIcp: boolean;
  hasPersonalReaders: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<SourceOption[]>(
    options.filter((o) => initialSourceIds.includes(o.id)),
  );
  const [reader, setReader] = useState<ReaderChoice>("icp");
  const [depth, setDepth] = useState<EditionInput["depth"]>("standard");
  const [from, setFrom] = useState(today());
  const [through, setThrough] = useState(today());
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const createKey = useRef<string | null>(null);
  const readerChoices: [ReaderChoice, string][] = [
    ["icp", "Your ideal customer"],
    ...(hasPersonalReaders
      ? ([["personal", "Your personal readers"]] as [ReaderChoice, string][])
      : []),
    ...(hasIcp && hasPersonalReaders
      ? ([["both", "Both"]] as [ReaderChoice, string][])
      : []),
  ];
  const reuseMissing = selected.some(
    (s) =>
      !["unused", "reference"].includes(s.usageStatus) && !s.reuseConfirmed,
  );
  const ready =
    name.trim().length >= 3 &&
    selected.length > 0 &&
    !reuseMissing &&
    through >= from;

  const toggle = (option: SourceOption, checked: boolean) =>
    setSelected(
      checked
        ? [...selected, option]
        : selected.filter((s) => s.id !== option.id),
    );

  const draft = () =>
    startTransition(async () => {
      setMessage("Saving your sources…");
      try {
        createKey.current ??= crypto.randomUUID();
        const payload: EditionInput = {
          title: name.trim(),
          startDate: from,
          endDate: through,
          reader: READER_TEXT[reader],
          depth,
          // A placeholder outline, one section per source. The planner replaces it.
          sections: selected.map((s) => ({
            heading: s.title.slice(0, 300),
            sourceIds: [s.id],
            commentary: "",
            body: "",
          })),
        };
        const saved = await saveNewsletter(
          clientId,
          null,
          null,
          createKey.current,
          payload,
          selected.map(({ id, type, reuseConfirmed }) => ({
            id,
            type,
            reuseConfirmed,
          })),
        );
        if (!saved.ok) {
          setMessage(saved.message);
          return;
        }
        setMessage("Planning the outline… this takes 20 to 60 seconds.");
        const planned = await generateNewsletter(
          clientId,
          saved.id,
          saved.revision,
          crypto.randomUUID(),
          "plan",
        );
        // The edition exists either way. If planning failed it opens with a button to try again.
        router.push(`/client/${clientId}/newsletter?edition=${saved.id}`);
        if (!planned.ok) setMessage(planned.message);
        router.refresh();
      } catch {
        setMessage("Could not complete this action. Refresh and try again.");
      }
    });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="New edition"
        description="Choose what this edition draws on. Virel proposes an outline for you to confirm before anything is written."
      />
      <label className="flex flex-col gap-1.5 text-small font-medium">
        Edition name
        <Input
          value={name}
          maxLength={300}
          disabled={busy}
          placeholder="November edition"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-1 text-small font-medium">Who it is for</legend>
        {readerChoices
          .map(([value, label]) => (
            <label key={value} className="flex min-h-[38px] items-center gap-2 text-small">
              <input
                type="radio"
                name="reader"
                checked={reader === value}
                onChange={() => setReader(value)}
              />
              {label}
            </label>
          ))}
        <p className="text-caption text-muted-foreground">
          Read from your business profile in Settings. Change it there and the
          next edition follows.
          {hasIcp ? "" : " Your ideal customer is not filled in yet, so the outline will be more generic."}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-1 text-small font-medium">
          Sources (up to {MAX_SOURCES})
        </legend>
        <div className="flex flex-col gap-4 rounded-card border border-border-subtle bg-white p-4">
          {!options.length ? (
            <p className="text-small text-muted-foreground">
              Add a ready Content Bank entry first. A research finding becomes
              a source once you save it to the Content Bank.
            </p>
          ) : null}
          {GROUPS.map((group) => {
            const items = options.filter((o) => o.kind === group.kind);
            if (!items.length) return null;
            return (
              <div key={group.kind} className="flex flex-col gap-2">
                <p className="font-mono text-caption uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                {items.map((o) => {
                  const chosen = selected.find((s) => s.id === o.id);
                  const needsReuse = !["unused", "reference"].includes(
                    o.usageStatus,
                  );
                  return (
                    <div key={o.id} className="flex flex-col gap-1">
                      <label className="flex min-h-[38px] items-start gap-2 text-small">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!!chosen}
                          disabled={
                            !chosen &&
                            (selected.length >= MAX_SOURCES ||
                              (needsReuse && !o.allowReuse))
                          }
                          onChange={(e) => toggle(o, e.target.checked)}
                        />
                        <span>
                          {o.title}
                          <span className="block text-caption text-muted-foreground">
                            {o.usageStatus === "unused" ||
                            o.usageStatus === "reference"
                              ? "Not used yet"
                              : `${o.usageStatus.replaceAll("_", " ")} · ${o.usageCount} prior use${o.usageCount === 1 ? "" : "s"}`}
                          </span>
                        </span>
                      </label>
                      {chosen && needsReuse ? (
                        <label className="ml-6 flex items-start gap-2 text-caption">
                          <input
                            type="checkbox"
                            checked={chosen.reuseConfirmed}
                            onChange={(e) =>
                              setSelected(
                                selected.map((s) =>
                                  s.id === o.id
                                    ? { ...s, reuseConfirmed: e.target.checked }
                                    : s,
                                ),
                              )
                            }
                          />
                          I deliberately use this reusable entry again.
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </fieldset>

      <details className="rounded-card border border-border-subtle bg-white p-4">
        <summary className="cursor-pointer text-small font-medium">
          Advanced
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Length
            <select
              disabled={busy}
              value={depth}
              onChange={(e) =>
                setDepth(e.target.value as EditionInput["depth"])
              }
              className="h-[38px] w-full rounded-control border border-border-grey bg-white px-3 text-small text-near-black outline-none"
            >
              <option value="concise">Concise (about 700 words)</option>
              <option value="standard">Standard (about 1,100 words)</option>
              <option value="deep">Deep (about 1,600 words)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Material from
            <Input
              type="date"
              disabled={busy}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium">
            Through
            <Input
              type="date"
              disabled={busy}
              value={through}
              onChange={(e) => setThrough(e.target.value)}
            />
          </label>
        </div>
        <p className="mt-3 text-caption text-muted-foreground">
          Length follows the value of the material. There is no news quota.
          Editions do not count toward your monthly post allocation.
        </p>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-small text-muted-foreground">
          {busy
            ? message
            : message ||
              `${selected.length} ${selected.length === 1 ? "source" : "sources"} chosen. Planning takes 20 to 60 seconds.`}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/client/${clientId}/newsletter`}
            className="inline-flex h-[38px] items-center px-3 text-small text-muted-foreground underline"
          >
            Cancel
          </Link>
          <Button variant="brand" disabled={!ready || busy} onClick={draft}>
            Draft edition
          </Button>
        </div>
      </div>
    </div>
  );
}
