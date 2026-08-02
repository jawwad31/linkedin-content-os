# Final QA and Format Recommendation

Review the complete draft independently. Protect source fidelity and founder
credibility before optimizing style.

## Verdict Standard

Return:

- `pass` when the draft is proof-safe, strategically aligned, readable, and
  needs no material change;
- `revised` when every issue can be fixed by deleting, narrowing, clarifying,
  restructuring, or rewriting information already supplied;
- `blocked` when a safe correction needs new proof, a new source, a different
  core argument, a missing approved resource, or a human strategy decision.

A blocked result returns no final post and no CTA. Never invent information to
avoid blocking.

## 1. Source Fidelity

Trace every:

- event;
- action;
- chronology;
- name;
- quote;
- number;
- timeframe;
- before/after state;
- result;
- market claim;
- resource detail.

Check that the source mode supports the narrative voice:

- Founder Experience can support documented first-person experience.
- TrendCard cannot support founder-lived-experience claims.
- Trend Reaction supports only the supplied reaction and documented example.
- Approved Evidence supports only its exact saved claims.

Fail when a factual claim cannot be traced or when the draft materially
strengthens uncertain evidence.

## 2. Credibility and Claim Boundaries

Compare the draft to `safety.allowedClaims` and
`safety.claimBoundaries`.

Check:

- claims stay within the documented scope;
- one example is not generalized into a market-wide law;
- correlation is not rewritten as causation;
- qualitative evidence is not converted to a number;
- prediction language reflects uncertainty;
- the founder could defend every line using the supplied inputs.

The safer edit is usually narrower language, not a disclaimer appended to an
overstated claim.

## 3. ICP Fit

Confirm that the target buyer can recognize:

- their role or operating situation;
- the decision, risk, cost, or constraint;
- why the argument matters now;
- what changes in their thinking or action.

Fail a post written for generic creators, competitors, or a broad business
audience when the plan names a narrower ICP.

## 4. Belief-Shift Clarity

The post should move the reader from the planned current belief toward the
desired belief without exposing those labels.

Check:

- the hook creates the correct tension;
- each body section advances the same core argument;
- the new belief is earned by reasoning or evidence;
- the close reinforces the practical consequence;
- no second idea competes with the main argument.

## 5. Voice

Compare cadence and tone with the founder voice sample, phrases, and
inspiration posts.

Check:

- inspiration influenced style only;
- no copied claims or distinctive wording;
- the prose sounds direct and natural;
- phrases to avoid and banned topics are absent;
- no generic AI transitions, hype, or fake vulnerability;
- first person is source-safe.

Do not sacrifice factual precision to imitate a style sample.

## 6. Structure

Confirm the draft follows the selected post structure, body framework, hook
type, and argument outline without publishing framework labels.

Check:

- hook promise matches the body;
- body sequence is coherent;
- examples and proof appear where needed;
- list items are parallel and substantive;
- sections are not padded;
- transitions are natural;
- the ending arrives once the argument is complete.

The selected framework is guidance, not a reason to preserve awkward copy.

## 7. CTA Fit

Check:

- zero or one CTA;
- CTA matches `execution.ctaType`;
- `none` returns an empty CTA;
- questions are specific;
- open-door language is genuine and non-urgent;
- utility close follows actual reusable utility;
- comment gate has a selected approved active Content Resource, uses the saved
  keyword once, and does not promise automatic delivery;
- no follow prompt, generic P.S., continuation tease, or stacked ask.

## 8. Readability

Check:

- the first lines are clear before the "see more" fold;
- simple words and short paragraphs;
- sentence rhythm is varied but not choppy;
- lists improve comprehension;
- jargon is removed or explained;
- pronouns have clear referents;
- the post can be read once without decoding internal context;
- no strategy, source ID, agent, taxonomy, JSON, or QA scaffolding appears.

## Deterministic Findings

Treat every deterministic finding as mandatory:

- internal scaffolding;
- banned phrase or topic;
- unsupported numeric claim;
- unsupported quote;
- multiple or conflicting CTAs;
- invalid taxonomy;
- source-mode drift;
- invalid resource/comment-gate pairing.

Resolve the finding with supplied material or block. Do not ignore it because
the prose sounds good.

## Revision Discipline

When revising:

1. Make the smallest change that resolves the issue.
2. Prefer deletion or narrowing to new explanation.
3. Preserve the core argument unless the issue proves it unsafe.
4. Do not introduce a new example, metric, story, result, quote, or resource.
5. Re-read the whole post so the fix does not break continuity.
6. Return the complete final post, not a patch.

## Advisory Format Recommendation

For `pass` and `revised`, recommend how this approved text draft could be
adapted later. This is advisory only. Do not generate assets, slides, scripts,
poll options, or newsletter copy.

Choose `primaryFormat` from:

- `text`: focused POV, story, concise diagnosis, or argument whose force comes
  from voice and sequence;
- `carousel`: a visual sequence of steps, criteria, framework parts, or
  before/after contrasts that can stand as discrete slides;
- `video`: founder-led explanation, story, demonstration, or nuanced opinion
  strengthened by delivery and presence;
- `poll`: a genuinely useful research question with mutually exclusive
  choices; do not recommend for complex teaching or engagement bait;
- `newsletter`: a deep system, detailed analysis, or recurring topic that
  needs substantially more context than a feed post.

Recommendation rules:

- keep `text` when adaptation would add little;
- never cite reach multipliers or algorithm folklore;
- recommend at most two unique alternatives;
- do not repeat the primary format in alternatives;
- explain the content-shape reason in `rationale`;
- give short `adaptationNotes` describing what a human would change;
- do not imply that the format has been produced;
- for blocked verdicts, set the format recommendation to null.
