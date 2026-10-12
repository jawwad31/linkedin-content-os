"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import {
  generateNewsletter,
  saveNewsletter,
  transitionNewsletter,
} from "./actions";
import type {
  Edition,
  EditionInput,
  NewsletterSource,
  Plan,
  PlanFact,
} from "./contracts";

type Section = EditionInput["sections"][number];

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);

export function OutlineScreen({
  clientId,
  edition,
  payload,
  sources,
  canDraft,
}: {
  clientId: string;
  edition: Edition;
  payload: EditionInput;
  sources: NewsletterSource[];
  canDraft: boolean;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>(payload.sections);
  const [plan, setPlan] = useState<Plan | undefined>(payload.plan);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newHeading, setNewHeading] = useState("");
  const [newPoints, setNewPoints] = useState("");
  const [newFacts, setNewFacts] = useState<string[]>([]);

  const confirmed = edition.outline_revision === edition.revision;
  const ledger = plan?.factLedger ?? [];
  const titleOf = (id: string) =>
    String(
      sources.find((s) => s.source_id === id)?.snapshot.title ?? "Source",
    );
  const selections = sources.map((s) => ({
    id: s.source_id,
    type: s.source_type,
    reuseConfirmed: false,
  }));
  const current = (): EditionInput => ({
    ...payload,
    sections,
    plan,
    article: undefined,
    claims: undefined,
  });

  const edit = (next: Section[]) => {
    setSections(next);
    setDirty(true);
  };
  const sectionUpdate = (i: number, patch: Partial<Section>) =>
    edit(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const planUpdate = (patch: Partial<Plan>) => {
    setPlan({ ...(plan as Plan), ...patch });
    setDirty(true);
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...sections];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    edit(next);
  };
  // Sources that only the removed section held move to its neighbour, so none is left unplaced.
  const remove = (i: number) => {
    const rest = sections.filter((_, j) => j !== i);
    const kept = new Set(rest.flatMap((s) => s.sourceIds));
    const orphans = sections[i].sourceIds.filter((id) => !kept.has(id));
    if (orphans.length) {
      const target = Math.min(i, rest.length - 1);
      rest[target] = {
        ...rest[target],
        sourceIds: [...rest[target].sourceIds, ...orphans].slice(0, 8),
      };
      setMessage(
        `A source that only that section used moved to "${rest[target].heading}".`,
      );
    }
    edit(rest);
  };
  const addSection = () => {
    const facts = ledger.filter((f) => newFacts.includes(f.factId));
    const sourceIds = [...new Set(facts.flatMap((f) => f.sourceIds))].slice(0, 8);
    if (!newHeading.trim() || !sourceIds.length || sections.length >= 8) return;
    edit([
      ...sections,
      {
        heading: newHeading.trim().slice(0, 300),
        sourceIds,
        commentary: "",
        body: "",
        sectionId: `SEC${String(sections.length + 1).padStart(2, "0")}`,
        keyPoints: lines(newPoints),
        factIds: facts.map((f) => f.factId),
      },
    ]);
    setAdding(false);
    setNewHeading("");
    setNewPoints("");
    setNewFacts([]);
  };

  const work = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setMessage("");
      try {
        await fn();
      } catch {
        setMessage("Could not complete this action. Refresh and try again.");
      }
    });
  const fail = (m: string) => {
    setMessage(m);
    router.refresh();
  };

  const regenerate = () =>
    work(async () => {
      setMessage("Planning the outline… this takes 20 to 60 seconds.");
      const r = await generateNewsletter(
        clientId,
        edition.id,
        edition.revision,
        crypto.randomUUID(),
        "plan",
      );
      if (!r.ok) return fail(r.message);
      router.refresh();
    });
  const save = () =>
    work(async () => {
      setMessage("Saving the outline…");
      const r = await saveNewsletter(
        clientId,
        edition.id,
        edition.revision,
        crypto.randomUUID(),
        current(),
        selections,
      );
      if (!r.ok) return fail(r.message);
      setDirty(false);
      setMessage("Outline saved.");
      router.refresh();
    });
  /** Save any edits, confirm the outline, then write and check the edition in one go. */
  const confirmAndDraft = () =>
    work(async () => {
      let revision = edition.revision;
      if (dirty) {
        setMessage("Saving the outline…");
        const saved = await saveNewsletter(
          clientId,
          edition.id,
          revision,
          crypto.randomUUID(),
          current(),
          selections,
        );
        if (!saved.ok) return fail(saved.message);
        revision = saved.revision;
      }
      if (!confirmed || dirty) {
        setMessage("Confirming the outline…");
        const c = await transitionNewsletter(
          clientId,
          edition.id,
          revision,
          "confirm_outline",
        );
        if (!c.ok) return fail(c.message);
        revision = c.revision;
      }
      setMessage(
        "Writing the edition and checking it… this can take a minute or two.",
      );
      const d = await generateNewsletter(
        clientId,
        edition.id,
        revision,
        crypto.randomUUID(),
        "draft",
      );
      if (!d.ok) return fail(d.message);
      router.refresh();
    });

  const status = (
    <p role="status" aria-live="polite" className="text-small text-muted-foreground">
      {message}
    </p>
  );

  /* ---- no outline yet, or the material was not enough ---- */
  if (!plan || plan.status !== "ready") {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader
          breadcrumb={[
            { label: "Newsletter", href: `/client/${clientId}/newsletter` },
            { label: payload.title },
          ]}
        />
        <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-white p-5">
          {!plan ? (
            <p className="text-small">
              This edition has no outline yet. Virel will propose one from the
              sources you chose, and nothing is written until you confirm it.
            </p>
          ) : (
            <>
              <p className="text-small font-medium">
                {plan.status === "blocked"
                  ? "Virel could not plan this edition."
                  : "These sources are not enough for an honest edition yet."}
              </p>
              {plan.statusNote ? (
                <p className="text-small">{plan.statusNote}</p>
              ) : null}
              {[...(plan.researchGaps ?? []), ...(plan.openQuestions ?? [])]
                .length ? (
                <ul className="list-disc pl-5 text-small text-muted-foreground">
                  {[
                    ...(plan.researchGaps ?? []),
                    ...(plan.openQuestions ?? []),
                  ].map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {canDraft ? (
              <Button variant="brand" disabled={busy} onClick={regenerate}>
                {plan ? "Try the outline again" : "Plan outline"}
              </Button>
            ) : null}
            <Link
              href={`/client/${clientId}/newsletter?new=true`}
              className="text-small text-link underline"
            >
              Choose different sources
            </Link>
          </div>
          {status}
        </div>
      </div>
    );
  }

  /* ---- a ready outline to review ---- */
  const allUnused = plan.unusedSourceIds ?? [];
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: "Newsletter", href: `/client/${clientId}/newsletter` },
          { label: payload.title },
        ]}
        description={
          confirmed && !dirty
            ? "Outline confirmed. The draft did not finish; draft it again below."
            : "Review the outline. Change anything you like, then confirm it and Virel writes the edition."
        }
        action={<Badge variant="info">Outline</Badge>}
      />

      <section className="flex flex-col gap-3 rounded-card border border-border-subtle bg-white p-5">
        <h2 className="text-card-title font-semibold">The idea</h2>
        <dl className="grid gap-3 text-small sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">For</dt>
          <dd>{plan.audience?.description}</dd>
          <dt className="text-muted-foreground">Main point</dt>
          <dd>{plan.thesis}</dd>
          <dt className="text-muted-foreground">Why now</dt>
          <dd>{plan.whyNow}</dd>
          <dt className="text-muted-foreground">Reader leaves with</dt>
          <dd>{plan.readerTransformation}</dd>
        </dl>
        <fieldset className="flex flex-col gap-2" disabled={busy || !canDraft}>
          <legend className="mb-1 text-small font-medium">Headline</legend>
          {[...new Set([plan.recommendedTitle, ...(plan.titleOptions ?? [])])]
            .filter((t): t is string => !!t)
            .map((t) => (
              <label key={t} className="flex min-h-[38px] items-start gap-2 text-small">
                <input
                  type="radio"
                  name="title"
                  className="mt-1"
                  checked={plan.recommendedTitle === t}
                  onChange={() => planUpdate({ recommendedTitle: t })}
                />
                {t}
              </label>
            ))}
          <Input
            aria-label="Or write your own headline"
            placeholder="Or write your own headline"
            maxLength={300}
            value={
              (plan.titleOptions ?? []).includes(plan.recommendedTitle ?? "")
                ? ""
                : (plan.recommendedTitle ?? "")
            }
            onChange={(e) =>
              planUpdate({
                recommendedTitle: e.target.value || plan.titleOptions?.[0],
              })
            }
          />
        </fieldset>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-card-title font-semibold">
          Sections · {sections.length}
        </h2>
        {sections.map((s, i) => (
          <fieldset
            key={`${s.sectionId ?? i}-${i}`}
            disabled={busy || !canDraft}
            className="flex flex-col gap-3 rounded-card border border-border-subtle bg-white p-4"
          >
            <legend className="px-1 font-mono text-caption uppercase tracking-wide text-muted-foreground">
              Section {i + 1}
            </legend>
            <label className="flex flex-col gap-1.5 text-small font-medium">
              Heading
              <Input
                value={s.heading}
                maxLength={300}
                onChange={(e) => sectionUpdate(i, { heading: e.target.value })}
              />
            </label>
            {s.purpose || s.readerQuestion ? (
              <p className="text-small text-muted-foreground">
                {s.readerQuestion ? `${s.readerQuestion} ` : ""}
                {s.purpose}
              </p>
            ) : null}
            <label className="flex flex-col gap-1.5 text-small font-medium">
              What it covers (one point per line)
              <Textarea
                className="min-h-28"
                value={(s.keyPoints ?? []).join("\n")}
                onChange={(e) =>
                  sectionUpdate(i, { keyPoints: lines(e.target.value) })
                }
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
              {(s.factIds ?? []).map((id) => (
                <Badge key={id} variant="neutral">
                  {id}
                </Badge>
              ))}
              <span>
                {s.sourceIds.map(titleOf).join(" + ")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Move section ${i + 1} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" /> Up
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={i === sections.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move section ${i + 1} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" /> Down
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={sections.length <= 1}
                onClick={() => remove(i)}
                aria-label={`Remove section ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </fieldset>
        ))}

        {canDraft && sections.length < 8 ? (
          adding ? (
            <fieldset
              disabled={busy}
              className="flex flex-col gap-3 rounded-card border border-dashed border-border-default bg-white p-4"
            >
              <legend className="px-1 text-small font-medium">
                Add a section from the facts Virel has
              </legend>
              <Input
                aria-label="Section heading"
                placeholder="Section heading"
                value={newHeading}
                maxLength={300}
                onChange={(e) => setNewHeading(e.target.value)}
              />
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-control border border-border-subtle p-3">
                {ledger
                  .filter((f) => f.writingPermission !== "omit")
                  .map((f: PlanFact) => (
                    <label key={f.factId} className="flex min-h-[38px] items-start gap-2 text-small">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={newFacts.includes(f.factId)}
                        onChange={(e) =>
                          setNewFacts(
                            e.target.checked
                              ? [...newFacts, f.factId]
                              : newFacts.filter((id) => id !== f.factId),
                          )
                        }
                      />
                      <span>
                        <span className="font-mono text-caption text-muted-foreground">
                          {f.factId}
                        </span>{" "}
                        {f.claim}
                      </span>
                    </label>
                  ))}
              </div>
              <Textarea
                aria-label="What it covers"
                placeholder="What it covers (one point per line)"
                value={newPoints}
                onChange={(e) => setNewPoints(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!newHeading.trim() || !newFacts.length}
                  onClick={addSection}
                >
                  Add section
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </fieldset>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => setAdding(true)}
              disabled={busy || !ledger.length}
            >
              <Plus className="h-3.5 w-3.5" /> Add a section
            </Button>
          )
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-border-subtle bg-white p-5">
        <h2 className="text-card-title font-semibold">How it ends</h2>
        <label className="flex flex-col gap-1.5 text-small font-medium">
          Closing takeaway
          <Textarea
            disabled={busy || !canDraft}
            value={plan.closingTakeaway ?? ""}
            onChange={(e) => planUpdate({ closingTakeaway: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-medium">
          One call to action
          <Input
            disabled={busy || !canDraft}
            value={plan.primaryCta ?? ""}
            maxLength={1000}
            onChange={(e) => planUpdate({ primaryCta: e.target.value })}
          />
        </label>
      </section>

      {allUnused.length || plan.openQuestions?.length ? (
        <section className="flex flex-col gap-2 rounded-card border border-warning/40 bg-warning/10 p-4 text-small">
          <h2 className="font-medium">Worth a look before you confirm</h2>
          <ul className="list-disc pl-5">
            {allUnused.map((id) => (
              <li key={id}>
                “{titleOf(id)}” did not fit the outline. It stays attached to
                the last section and counts as used once the edition is
                written.
              </li>
            ))}
            {(plan.openQuestions ?? []).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-3">
        {status}
        {canDraft ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="brand" disabled={busy} onClick={confirmAndDraft}>
              {confirmed && !dirty ? "Draft edition" : "Confirm outline"}
            </Button>
            <Button variant="secondary" disabled={busy || !dirty} onClick={save}>
              Save changes
            </Button>
            <Button variant="ghost" disabled={busy} onClick={regenerate}>
              Regenerate outline
            </Button>
          </div>
        ) : null}
        <p className="text-caption text-muted-foreground">
          Confirming saves this outline and then writes and checks the edition
          in one go. It takes a minute or two.
        </p>
      </div>

      <details className="rounded-card border border-border-subtle bg-white p-4">
        <summary className="cursor-pointer text-small font-medium">
          Advanced · facts Virel will write from
        </summary>
        <ul className="mt-3 flex flex-col gap-3 text-small">
          {ledger.map((f) => (
            <li key={f.factId} className="flex flex-col gap-0.5">
              <span>
                <span className="font-mono text-caption text-muted-foreground">
                  {f.factId}
                </span>{" "}
                {f.claim}
              </span>
              <span className="text-caption text-muted-foreground">
                {f.sourceIds.map(titleOf).join(" + ")} · {f.evidenceType} ·{" "}
                {f.confidence} confidence · {f.writingPermission.replaceAll("_", " ")}
                {f.scopeAndQualifiers ? ` · ${f.scopeAndQualifiers}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
