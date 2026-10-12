"use client";
import { NewEdition } from "./new-edition";
import { NewsletterList } from "./newsletter-list";
import { OutlineScreen } from "./outline-screen";
import { ReadScreen } from "./read-screen";
import {
  editionStage,
  type Edition,
  type EditionSummary,
  type EditionVersion,
  type NewsletterSource,
  type SourceOption,
} from "./contracts";

type Props = {
  clientId: string;
  editions: EditionSummary[];
  edition: Edition | null;
  versions: EditionVersion[];
  sources: NewsletterSource[];
  options: SourceOption[];
  initialSourceIds: string[];
  creating: boolean;
  hasIcp: boolean;
  hasPersonalReaders: boolean;
  canSelect: boolean;
  canDraft: boolean;
  canReview: boolean;
  canPublish: boolean;
};

/** Chooses the one screen that fits where the edition stands. */
export function NewsletterPanel(props: Props) {
  if (props.creating)
    return (
      <NewEdition
        clientId={props.clientId}
        options={props.options}
        initialSourceIds={props.initialSourceIds}
        hasIcp={props.hasIcp}
        hasPersonalReaders={props.hasPersonalReaders}
      />
    );
  const current = props.edition
    ? props.versions.find((v) => v.revision === props.edition!.revision)
    : undefined;
  if (!props.edition || !current)
    return (
      <NewsletterList
        clientId={props.clientId}
        editions={props.editions}
        canCreate={props.canSelect && props.canDraft}
      />
    );
  const stage = editionStage(props.edition, current.payload);
  if (
    stage === "outline_needs_review" ||
    stage === "outline_blocked" ||
    stage === "outline_confirmed"
  )
    return (
      <OutlineScreen
        // A new version means a fresh outline, so the form state must restart.
        key={`${props.edition.id}:${props.edition.revision}`}
        clientId={props.clientId}
        edition={props.edition}
        payload={current.payload}
        sources={props.sources}
        canDraft={props.canDraft}
      />
    );
  return (
    <ReadScreen
      key={`${props.edition.id}:${props.edition.revision}:${props.edition.status}`}
      clientId={props.clientId}
      edition={props.edition}
      versions={props.versions}
      sources={props.sources}
      canDraft={props.canDraft}
      canReview={props.canReview}
      canPublish={props.canPublish}
    />
  );
}
