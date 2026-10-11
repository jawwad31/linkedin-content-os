"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  generateNewsletter,
  saveNewsletter,
  transitionNewsletter,
  exportNewsletter,
} from "./actions";
import {
  exportEdition,
  hasPrivateEvidenceLink,
  type Edition,
  type EditionInput,
  type EditionVersion,
  type NewsletterSource,
  type SourceOption,
} from "./contracts";
import { isPublicWebUrl } from "@/features/research/web-research/contracts";

type Props = {
  clientId: string;
  editions: Edition[];
  edition: Edition | null;
  versions: EditionVersion[];
  sources: NewsletterSource[];
  options: SourceOption[];
  initialSourceIds: string[];
  canSelect: boolean;
  canDraft: boolean;
  canReview: boolean;
  canPublish: boolean;
};
const fieldClass =
  "w-full rounded-control border border-border-grey bg-white px-3 py-2 text-small";
export function NewsletterPanel(props: Props) {
  const router = useRouter();
  const version = props.versions.find(
    (v) => v.revision === props.edition?.revision,
  );
  const [selected, setSelected] = useState<SourceOption[]>(
    props.edition
      ? []
      : props.options.filter((o) => props.initialSourceIds.includes(o.id)),
  );
  const [payload, setPayload] = useState<EditionInput>(
    version?.payload ?? {
      title: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
      reader: "",
      depth: "standard",
      sections: props.options
        .filter((o) => props.initialSourceIds.includes(o.id))
        .map((o) => ({
          heading: o.title,
          sourceIds: [o.id],
          commentary: "",
          body: "",
        })),
    },
  );
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [publication, setPublication] = useState({
    url: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, startTransition] = useTransition();
  const createKey = useRef<string | null>(null);
  const editable = props.canDraft && props.edition?.status !== "published";
  const sources = props.edition
    ? props.sources.map((s) => ({
        id: s.source_id,
        type: s.source_type,
        reuseConfirmed: false,
      }))
    : selected;
  const update = (next: EditionInput) => {
    setPayload(next);
    setDirty(true);
    setAcknowledged(false);
  };
  const sectionUpdate = (
    index: number,
    patch: Partial<EditionInput["sections"][number]>,
  ) =>
    update({
      ...payload,
      sections: payload.sections.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      ),
    });
  const perform = (
    operation: () => Promise<{ ok: boolean; id?: string; message?: string }>,
  ) =>
    startTransition(async () => {
      setMessage("");
      try {
        const result = await operation();
        if (!result.ok) {
          setMessage(result.message ?? "Action failed. Refresh and try again.");
          return;
        }
        setMessage("Saved. Refreshing the edition…");
        setAcknowledged(false);
        router.push(
          `/client/${props.clientId}/newsletter?edition=${result.id}`,
        );
        router.refresh();
      } catch {
        setMessage("Could not complete this action. Refresh and try again.");
      }
    });
  const transition = (action: Parameters<typeof transitionNewsletter>[3]) => {
    if (!props.edition) return;
    perform(() =>
      transitionNewsletter(
        props.clientId,
        props.edition!.id,
        props.edition!.revision,
        action,
        publication,
      ),
    );
  };
  const choose = (option: SourceOption, checked: boolean) => {
    setSelected(
      checked
        ? [...selected, option]
        : selected.filter((s) => s.id !== option.id),
    );
    update({
      ...payload,
      sections: checked
        ? [
            ...payload.sections,
            {
              heading: option.title,
              sourceIds: [option.id],
              commentary: "",
              body: "",
            },
          ]
        : payload.sections
            .map((s) => ({
              ...s,
              sourceIds: s.sourceIds.filter((id) => id !== option.id),
            }))
            .filter((s) => s.sourceIds.length),
    });
  };
  const shownSections = payload.sections.length
    ? payload.sections
    : selected.map((o) => ({
        heading: o.title,
        sourceIds: [o.id],
        commentary: "",
        body: "",
      }));
  const actualPayload = { ...payload, sections: shownSections };
  const locked = busy || !editable;
  const approved =
    props.edition?.status === "approved" &&
    props.edition.approved_revision === props.edition.revision;
  const canCopy = (approved || props.edition?.status === "published") && !dirty;
  const copy = async (download: boolean) => {
    if (!props.edition) return;
    const approvedText = await exportNewsletter(
      props.clientId,
      props.edition.id,
      props.edition.revision,
    );
    if (!approvedText.ok) {
      setMessage(approvedText.message);
      return;
    }
    const text = approvedText.text;
    if (hasPrivateEvidenceLink(text)) {
      setMessage(
        "Remove private evidence links from the edition before export.",
      );
      return;
    }
    try {
      if (download) {
        const href = URL.createObjectURL(
          new Blob([text], { type: "text/plain;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = href;
        a.download = "newsletter-edition.txt";
        a.click();
        URL.revokeObjectURL(href);
      } else await navigator.clipboard.writeText(text);
      setMessage(
        download
          ? "Text file exported."
          : "Approved text copied. Paste it into the LinkedIn newsletter editor.",
      );
    } catch {
      setMessage("Copy is unavailable in this browser. Use Export text.");
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Weekly editions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {props.canSelect && props.canDraft ? (
            <Link
              className="text-small font-medium text-link underline"
              href={`/client/${props.clientId}/newsletter?new=true`}
            >
              New edition
            </Link>
          ) : null}
          {!props.editions.length ? (
            <p className="text-small text-muted-foreground">
              No editions yet. Choose the sources that are worth sharing this
              week.
            </p>
          ) : null}
          {props.editions.map((e) => (
            <Link
              aria-current={e.id === props.edition?.id ? "page" : undefined}
              className="rounded-control border border-border-grey p-3 text-small aria-[current=page]:bg-surface-container"
              key={e.id}
              href={`/client/${props.clientId}/newsletter?edition=${e.id}`}
            >
              <span className="block font-medium">
                {e.id === props.edition?.id
                  ? payload.title
                  : new Date(e.created_at).toLocaleDateString()}
              </span>
              <span className="text-caption text-muted-foreground">
                {e.status} · version {e.revision}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
      <div className="min-w-0 space-y-6">
        <div role="status" aria-live="polite" className="text-small">
          {busy ? "Working… This may take a few minutes." : message}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {props.edition
                ? `Edition · version ${props.edition.revision} · ${props.edition.status}`
                : "Plan a newsletter edition"}
            </CardTitle>
            <p className="text-small text-muted-foreground">
              Choose useful material, arrange the sections, then confirm the
              outline. Newsletter editions do not count toward your monthly post
              allocation.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {!props.edition && props.canSelect && props.canDraft ? (
              <fieldset disabled={locked}>
                <legend className="mb-2 text-small font-medium">
                  Select approved sources (up to eight)
                </legend>
                <div className="max-h-80 space-y-3 overflow-y-auto rounded-control border border-border-grey p-3">
                  <p className="text-caption text-muted-foreground">
                    Ready Content Bank entries and the 100 most recent approved
                    findings. Research remains a dated reference.
                  </p>
                  {!props.options.length ? (
                    <p className="text-small text-muted-foreground">
                      Add a ready Content Bank entry or approve a research
                      finding first.
                    </p>
                  ) : null}
                  {props.options.map((o) => {
                    const chosen = selected.find((s) => s.id === o.id);
                    const needsReuse = !["unused", "reference"].includes(
                      o.usageStatus,
                    );
                    return (
                      <div key={o.id} className="space-y-1">
                        <label className="flex items-start gap-2 text-small">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={!!chosen}
                            disabled={
                              !chosen &&
                              (selected.length >= 8 ||
                                (needsReuse && !o.allowReuse))
                            }
                            onChange={(e) => choose(o, e.target.checked)}
                          />
                          <span>
                            {o.title}
                            <span className="block text-caption text-muted-foreground">
                              {o.type.replaceAll("_", " ")} · {o.usageStatus} ·{" "}
                              {o.usageCount} prior use(s)
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
                                      ? {
                                          ...s,
                                          reuseConfirmed: e.target.checked,
                                        }
                                      : s,
                                  ),
                                )
                              }
                            />
                            I deliberately select this reusable entry for
                            another edition.
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            <label className="block space-y-1 text-small font-medium">
              Edition title
              <Input
                disabled={locked}
                value={payload.title}
                maxLength={300}
                onChange={(e) => update({ ...payload, title: e.target.value })}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-small font-medium">
                From
                <Input
                  type="date"
                  disabled={locked}
                  value={payload.startDate}
                  onChange={(e) =>
                    update({ ...payload, startDate: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-small font-medium">
                Through
                <Input
                  type="date"
                  disabled={locked}
                  value={payload.endDate}
                  onChange={(e) =>
                    update({ ...payload, endDate: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="block space-y-1 text-small font-medium">
              Intended reader
              <Input
                disabled={locked}
                value={payload.reader}
                maxLength={1000}
                onChange={(e) => update({ ...payload, reader: e.target.value })}
              />
            </label>
            <label className="block space-y-1 text-small font-medium">
              Depth
              <select
                className={fieldClass}
                disabled={locked}
                value={payload.depth}
                onChange={(e) =>
                  update({
                    ...payload,
                    depth: e.target.value as EditionInput["depth"],
                  })
                }
              >
                <option value="concise">Concise</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
              </select>
              <span className="block text-caption font-normal text-muted-foreground">
                Length follows the value of the selected material. There is no
                news quota.
              </span>
            </label>
            {shownSections.map((s, i) => (
              <fieldset
                key={s.sourceIds.join(",")}
                disabled={locked}
                className="space-y-3 rounded-control border border-border-grey p-4"
              >
                <legend className="px-1 text-small font-semibold">
                  Section {i + 1}
                </legend>
                <label className="block space-y-1 text-small">
                  Heading
                  <Input
                    value={s.heading}
                    maxLength={300}
                    onChange={(e) =>
                      sectionUpdate(i, { heading: e.target.value })
                    }
                  />
                </label>
                <p className="text-caption text-muted-foreground">
                  {s.sourceIds
                    .map((id) =>
                      String(
                        props.sources.find((x) => x.source_id === id)?.snapshot
                          .title ??
                          props.options.find((o) => o.id === id)?.title ??
                          "Selected source",
                      ),
                    )
                    .join(" + ")}
                </p>
                <label className="block space-y-1 text-small">
                  Your commentary (optional)
                  <Textarea
                    value={s.commentary}
                    maxLength={4000}
                    onChange={(e) =>
                      sectionUpdate(i, { commentary: e.target.value })
                    }
                  />
                  <span className="text-caption text-muted-foreground">
                    Leave blank when you have no personal interpretation. AI
                    must not invent it.
                  </span>
                </label>
                <label className="block space-y-1 text-small">
                  Draft text
                  <Textarea
                    className="min-h-44"
                    value={s.body}
                    maxLength={14000}
                    onChange={(e) => sectionUpdate(i, { body: e.target.value })}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {s.sourceIds.length > 1 ? (
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() =>
                        update({
                          ...payload,
                          sections: shownSections.flatMap((section, index) =>
                            index === i
                              ? section.sourceIds.map((id, j) => ({
                                  ...section,
                                  heading: String(
                                    props.sources.find(
                                      (source) => source.source_id === id,
                                    )?.snapshot.title ??
                                      props.options.find(
                                        (option) => option.id === id,
                                      )?.title ??
                                      section.heading,
                                  ),
                                  sourceIds: [id],
                                  body: j === 0 ? section.body : "",
                                }))
                              : [section],
                          ),
                        })
                      }
                    >
                      Separate sources into sections
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={i === 0 || locked}
                    onClick={() => {
                      const sections = [...shownSections];
                      [sections[i - 1], sections[i]] = [
                        sections[i],
                        sections[i - 1],
                      ];
                      update({ ...payload, sections });
                    }}
                  >
                    Move up
                  </Button>
                  <label className="text-caption">
                    Combine into{" "}
                    <select
                      aria-label={`Combine section ${i + 1}`}
                      className={fieldClass}
                      value=""
                      onChange={(e) => {
                        const target = Number(e.target.value);
                        if (!e.target.value) return;
                        update({
                          ...payload,
                          sections: shownSections
                            .map((section, index) =>
                              index === target
                                ? {
                                    ...section,
                                    sourceIds: [
                                      ...section.sourceIds,
                                      ...s.sourceIds,
                                    ],
                                    commentary: [
                                      section.commentary,
                                      s.commentary,
                                    ]
                                      .filter(Boolean)
                                      .join("\n\n"),
                                    body: [section.body, s.body]
                                      .filter(Boolean)
                                      .join("\n\n"),
                                  }
                                : section,
                            )
                            .filter((_, index) => index !== i),
                        });
                      }}
                    >
                      <option value="">Keep separate</option>
                      {shownSections.map((_, j) =>
                        j !== i ? (
                          <option key={j} value={j}>
                            Section {j + 1}
                          </option>
                        ) : null,
                      )}
                    </select>
                  </label>
                </div>
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-3">
              {editable && (props.edition || props.canSelect) ? (
                <Button
                  disabled={
                    busy ||
                    !shownSections.length ||
                    selected.some(
                      (s) =>
                        !["unused", "reference"].includes(s.usageStatus) &&
                        !s.reuseConfirmed,
                    )
                  }
                  onClick={() => {
                    createKey.current ??= crypto.randomUUID();
                    perform(() =>
                      saveNewsletter(
                        props.clientId,
                        props.edition?.id ?? null,
                        props.edition?.revision ?? null,
                        createKey.current!,
                        actualPayload,
                        sources,
                      ),
                    );
                  }}
                >
                  Save {props.edition ? "new version" : "edition"}
                </Button>
              ) : null}
              {props.edition && editable ? (
                <>
                  <Button
                    variant="outline"
                    disabled={busy || dirty}
                    onClick={() => transition("confirm_outline")}
                  >
                    Confirm saved outline
                  </Button>
                  <Button
                    disabled={
                      busy ||
                      dirty ||
                      props.edition.outline_revision !== props.edition.revision
                    }
                    onClick={() =>
                      perform(() =>
                        generateNewsletter(
                          props.clientId,
                          props.edition!.id,
                          props.edition!.revision,
                          crypto.randomUUID(),
                          "draft",
                        ),
                      )
                    }
                  >
                    Draft confirmed edition
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      busy || dirty || shownSections.some((s) => !s.body.trim())
                    }
                    onClick={() =>
                      perform(() =>
                        generateNewsletter(
                          props.clientId,
                          props.edition!.id,
                          props.edition!.revision,
                          crypto.randomUUID(),
                          "qa",
                        ),
                      )
                    }
                  >
                    Run QA on saved version
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || dirty}
                    onClick={() => transition("archive")}
                  >
                    Archive edition
                  </Button>
                </>
              ) : null}
            </div>
            {dirty ? (
              <p className="text-caption text-muted-foreground">
                Unsaved changes. Save a new version before checks, approval or
                copying.
              </p>
            ) : null}
          </CardContent>
        </Card>
        {props.edition ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Evidence and source history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-small text-muted-foreground">
                  These private records support review. Copy/export includes
                  only the edition text.
                </p>
                {props.sources.map((s) => (
                  <details
                    key={s.source_id}
                    className="rounded-control border border-border-grey p-3"
                  >
                    <summary className="cursor-pointer text-small font-medium">
                      {String(s.snapshot.title ?? "Selected source")}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-caption">
                      {JSON.stringify(s.snapshot, null, 2)}
                    </pre>
                    {s.source_type === "research_finding" &&
                    Array.isArray(s.snapshot.sources)
                      ? s.snapshot.sources.map((link, i) =>
                          typeof link?.url === "string" &&
                          isPublicWebUrl(link.url) ? (
                            <a
                              key={i}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 block break-all text-caption text-link underline"
                            >
                              {String(link.title ?? link.url)}
                            </a>
                          ) : null,
                        )
                      : null}
                    <p className="mt-2 text-caption">
                      Saved source hash: {s.content_hash}
                    </p>
                    {s.usageHistory?.length ? (
                      <ul className="my-3 space-y-1 text-caption">
                        {s.usageHistory.map((use) => (
                          <li key={use.id}>
                            {use.channel.replaceAll("_", " ")} · {use.status} ·{" "}
                            {new Date(use.created_at).toLocaleDateString()}{" "}
                            {use.newsletter_id ? (
                              <Link
                                className="text-link underline"
                                href={`/client/${props.clientId}/newsletter?edition=${use.newsletter_id}`}
                              >
                                Open edition
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Link
                      className="text-caption text-link underline"
                      href={`/client/${props.clientId}/${s.source_type === "research_finding" ? "research?tab=briefings" : "content-bank"}`}
                    >
                      Open source
                    </Link>
                  </details>
                ))}
                {version?.evidence ? (
                  <details>
                    <summary className="cursor-pointer text-small">
                      Context provenance
                    </summary>
                    <pre className="whitespace-pre-wrap break-words text-caption">
                      {JSON.stringify(version.evidence, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Checks and human review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-small">
                  QA is advisory. Human approval applies only to version{" "}
                  {props.edition.revision}.
                </p>
                {version?.qa ? (
                  <>
                    <p className="text-small font-medium">
                      {version.qa.verdict.replaceAll("_", " ")}
                    </p>
                    <ul className="list-disc space-y-2 pl-5 text-small">
                      {version.qa.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                    <p className="whitespace-pre-wrap text-small">
                      {version.qa.proofNotes}
                    </p>
                  </>
                ) : (
                  <p className="text-small text-muted-foreground">
                    Run QA on the saved draft before approval.
                  </p>
                )}
                {props.canReview && props.edition.status !== "published" ? (
                  <>
                    <label className="flex items-start gap-2 text-small">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        disabled={busy || dirty || !version?.qa}
                      />
                      I reviewed this version, its source facts and every
                      warning.
                    </label>
                    <div className="flex gap-3">
                      <Button
                        disabled={
                          busy || dirty || !version?.qa || !acknowledged
                        }
                        onClick={() => transition("approve")}
                      >
                        Approve version {props.edition.revision}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || dirty}
                        onClick={() => transition("reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Manual publication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-small text-muted-foreground">
                  Copy the approved version into LinkedIn’s newsletter editor.
                  After publishing there, record its link and date here.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    disabled={!canCopy || busy}
                    onClick={() => copy(false)}
                  >
                    Copy approved text
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canCopy || busy}
                    onClick={() => copy(true)}
                  >
                    Export text
                  </Button>
                </div>
                {props.edition.status === "published" ? (
                  <p className="text-small">
                    Published {props.edition.published_on}:{" "}
                    <a
                      href={props.edition.publication_url!}
                      rel="noopener noreferrer"
                      target="_blank"
                      className="break-all text-link underline"
                    >
                      Open LinkedIn edition
                    </a>
                  </p>
                ) : props.canPublish ? (
                  <>
                    <label className="block space-y-1 text-small">
                      LinkedIn edition URL
                      <Input
                        type="url"
                        disabled={busy || !approved || dirty}
                        value={publication.url}
                        onChange={(e) =>
                          setPublication({
                            ...publication,
                            url: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block space-y-1 text-small">
                      Publication date
                      <Input
                        type="date"
                        disabled={busy || !approved || dirty}
                        value={publication.date}
                        onChange={(e) =>
                          setPublication({
                            ...publication,
                            date: e.target.value,
                          })
                        }
                      />
                    </label>
                    <Button
                      disabled={busy || !approved || dirty || !publication.url}
                      onClick={() => transition("publish")}
                    >
                      Mark manually published
                    </Button>
                  </>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Version history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {props.versions.map((v) => (
                  <details key={v.revision}>
                    <summary className="cursor-pointer text-small">
                      Version {v.revision} ·{" "}
                      {new Date(v.created_at).toLocaleString()}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-small">
                      {exportEdition(v.payload)}
                    </pre>
                  </details>
                ))}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
