# Shared: Rules of the Virel app

**Applies to:** Planning, Writing and QA. These rules come from how the app stores and publishes newsletters. They apply on top of the skill and win over it where they conflict.

## 1. What you receive

- `edition_request`: the edition name (`topic`), the reader the human chose (`reader_segment`), the requested length and the dates covered.
- `profile`: the account's business profile. The reader, voice, banned topics and approved proof come from here. There are no preset audience profiles and no house voice.
- `selected_sources`: sources chosen by the human, each with an alias `source_id` (S01, S02, ...), a `source_kind` and the stored `text`. Use only these. `source_kind` is one of:
  - `author_experience`: the author's own supplied experience (a Content Bank experience entry).
  - `trend_reaction`: the author's reaction to a trend (a Content Bank trend reaction).
  - `resource`: a guide, template or checklist the author owns (a Content Bank resource).
  - `research_finding`: an approved public research finding, with dated public links.

## 2. Voice and first person

- `author_experience` and `trend_reaction` entries are the author's own words. The writer may use "I" for them, and only for what those entries say. Do not extend them with details the entry does not contain.
- Never write first-person experience from any other source, and never invent a test, client, result or conversation.
- Ledger items from author entries use `evidence_type` `anecdote` with `writing_permission` `allowed`. Treat them as the author's testimony, not as independent evidence of an industry fact.

## 3. Sources and the outline

- Every selected source must appear in at least one outline section (through the sources of the facts that section uses). If a source cannot support anything, still place it in the most relevant section and list it in `open_questions` so the human can decide.
- A section may use facts from several sources, and a source may serve several sections.
- Send `status` `needs_selection` or `research_gap` (not an outline) when the selected material cannot sustain an honest issue. Explain in `status_note` what is missing, in plain words.
- Dated references stay dated. Older research is not "newly announced".

## 4. Links, evidence and offers

- Reader text may contain only public links that appear in the selected sources (a research finding's public source links, or a resource's approved public `deliveryUrl`). No other link.
- Private evidence, file names, storage addresses, signed or tokenised URLs, manifests, source ids, fact ids and internal labels never appear in reader text. Facts are cited by publisher or title, not by `F01` or `S01`.
- Do not offer a download, template, call or guide unless the selected material contains it with an approved public delivery method. Never promise automatic delivery. Virel does not send the newsletter.
- Do not promise a count (for example "5 steps") that the article does not deliver.

## 5. Length

`target_word_count` follows the requested depth: concise about 700 words, standard about 1,100, deep about 1,600. Length follows the value of the material. There is no news quota and no padding to reach a number.

## 6. Formatting for LinkedIn

The article is pasted into the LinkedIn newsletter editor, so its layout has to survive a paste. These rules win over any style advice in the skills.

- Start with one `#` title. Use `##` for each section heading and `###` only when a section truly needs a sub-heading.
- Put a blank line between every heading, paragraph and list. Never run two blocks together.
- Paragraphs are one to four sentences. Never a wall of text, and never one sentence per line all the way through.
- Use a bullet or numbered list only for a real sequence or checklist, with each item on its own line.
- No tables, no HTML, no code blocks, no horizontal rules, no emoji headers, no bold used as decoration. Bold is for a rare key term.
- Put links inline as `[readable text](url)`, never as a bare address in the middle of a sentence.
- Finish with the one call to action on its own line. Do not add a "Sources" appendix unless the plan asks for one.

## 7. Output

Return exactly the JSON the response schema asks for, nothing else. Use the aliases (`S01`, `F01`) only inside the JSON, never in reader text. The article is plain Markdown: headings, paragraphs, bullet lists, links in `[text](url)` form, no HTML.

## 8. QA is advice

QA never approves or publishes. The human approves one exact version. When editing is needed, QA lists targeted fixes and routes them to `writing` or `planning`; it does not rewrite the edition.
