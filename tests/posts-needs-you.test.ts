import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { NeedsYouPanel, postTitle, reviewStatusLine } from "@/features/posts/needs-you-panel";
import { PostReviewActions } from "@/features/posts/review/post-review-actions";
import { PublishHandoff } from "@/features/posts/review/publish-handoff";
import type { ReviewPost } from "@/features/posts/review/queries";

const CLIENT = "00000000-0000-4000-8000-0000000000c1";

const post = (overrides: Partial<ReviewPost>): ReviewPost => ({
  id: "p1",
  contentIdeaId: null,
  finalPost: "We lost two clients in the same quarter.\n\nBoth left in the first 60 days.",
  hook: "We lost two clients in the same quarter.",
  body: "Both left in the first 60 days.",
  buyerBeliefShift: null,
  proofNotes: null,
  riskNotes: null,
  ctaIntent: null,
  formatRecommendation: null,
  qaWarnings: [],
  sourceContextUsed: null,
  status: "review",
  draftVersion: 1,
  approvedDraftVersion: null,
  editNote: null,
  approvedAt: null,
  publishedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  idea: null,
  ...overrides,
});

describe("post titles and status lines", () => {
  it("uses the hook as the title and shortens a long one", () => {
    expect(postTitle(post({}))).toBe("We lost two clients in the same quarter.");
    expect(postTitle({ hook: "x".repeat(150), finalPost: "y" })).toHaveLength(101);
    expect(postTitle({ hook: null, finalPost: "   " })).toBe("Untitled post");
  });

  it("says what each post needs", () => {
    expect(reviewStatusLine(post({}))).toBe("Draft ready");
    expect(reviewStatusLine(post({ qaWarnings: ["a", "b"] as never }))).toBe("Draft ready · 2 QA notes");
    expect(reviewStatusLine(post({ qaWarnings: ["a"] as never }))).toBe("Draft ready · 1 QA note");
    expect(reviewStatusLine(post({ draftVersion: 3 }))).toBe("Edited · needs approval");
    expect(reviewStatusLine(post({ status: "needs_edit" }))).toBe("Edits requested");
  });
});

describe("NeedsYouPanel", () => {
  const render = (props: Partial<Parameters<typeof NeedsYouPanel>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(NeedsYouPanel, { clientId: CLIENT, posts: [], drafting: [], canReview: true, ...props }),
    );

  it("says plainly when nothing needs anyone", () => {
    expect(render()).toContain("Nothing needs you right now");
  });

  it("groups review, ready to publish and in progress, with counts", () => {
    const html = render({
      posts: [
        post({ id: "newer", createdAt: "2026-10-05T00:00:00Z", hook: "Newer draft" }),
        post({ id: "older", createdAt: "2026-10-01T00:00:00Z", hook: "Older draft" }),
        post({ id: "ready", status: "approved", draftVersion: 2, approvedDraftVersion: 2, hook: "Approved one" }),
        post({ id: "done", status: "published", hook: "Already published" }),
        post({ id: "no", status: "rejected", hook: "Rejected one" }),
      ],
      drafting: [{ slotId: "s1", title: "Pricing signals", date: "2026-10-08" }],
    });

    expect(html).toContain("Review");
    expect(html).toContain("· 2");
    expect(html).toContain("Ready to publish");
    expect(html).toContain("Approved version 2");
    expect(html).toContain("In progress");
    expect(html).toContain("Drafting · Oct 8");
    expect(html).not.toContain("Already published");
    expect(html).not.toContain("Rejected one");
    // Reviewing next goes to the post that has waited longest.
    expect(html).toContain(`/client/${CLIENT}/posts/older/review`);
    expect(html.indexOf("Older draft")).toBeLessThan(html.indexOf("Newer draft"));
  });

  it("hides Review next post from someone who cannot review", () => {
    expect(render({ posts: [post({})], canReview: false })).not.toContain("Review next post");
    expect(render({ posts: [post({})], canReview: true })).toContain("Review next post");
  });
});

describe("review decision bar", () => {
  const render = (props: Partial<Parameters<typeof PostReviewActions>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(PostReviewActions, {
        clientId: CLIENT,
        postId: "p1",
        status: "review",
        version: 3,
        canReview: true,
        canRedraft: false,
        ...props,
      }),
    );

  it("names the exact version to approve and offers edit, request edits and reject", () => {
    const html = render();
    expect(html).toContain("Approve version 3");
    expect(html).toContain("Request edits");
    expect(html).toContain("Reject");
    expect(html).toContain(`/client/${CLIENT}/posts/p1/edit`);
    expect(html).toContain("Approval applies to version 3 only.");
  });

  it("tells a user without the Review capability who can grant it", () => {
    const html = render({ canReview: false });
    expect(html).toContain("You cannot approve posts. Ask an account admin to add the Review capability.");
    expect(html).not.toContain("Approve version");
  });

  it("only offers Redraft after edits were requested", () => {
    expect(render({ canRedraft: true })).not.toContain("Redraft");
    expect(render({ canRedraft: true, status: "needs_edit" })).toContain("Redraft");
  });
});

describe("publish handoff", () => {
  const render = (canPublish: boolean) =>
    renderToStaticMarkup(
      createElement(PublishHandoff, { clientId: CLIENT, postId: "p1", text: "Body", version: 4, canPublish }),
    );

  it("walks through the three manual steps and never posts for you", () => {
    const html = render(true);
    expect(html).toContain("Publish version 4 on LinkedIn");
    expect(html).toContain("1. Copy the approved text");
    expect(html).toContain("2. Post it on LinkedIn");
    expect(html).toContain("3. Record the post");
    expect(html).toContain("Virel does not post for you");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("dims Mark as published and says who can grant it without the Publish capability", () => {
    const html = render(false);
    expect(html).toContain("Ask an account admin to add the Publish capability.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Mark as published/);
  });
});
