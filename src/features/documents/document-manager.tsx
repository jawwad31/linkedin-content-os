"use client";

import { useState, useTransition } from "react";
import {
  FileText,
  Upload,
  Archive,
  Trash2,
  Eye,
  CheckCircle,
  AlertCircle,
  FileCode,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { EffectiveClientRole } from "@/lib/access/roles";
import { canRoleManageClientSetup } from "@/lib/access/roles";

import {
  DOCUMENT_PURPOSES,
  DOCUMENT_PURPOSE_LABELS,
  type ClientDocument,
  type DocumentPurpose,
} from "./schemas";
import {
  uploadDocumentAction,
  archiveDocumentAction,
  deleteDocumentAction,
} from "./actions";

interface DocumentManagerProps {
  clientId: string;
  role: EffectiveClientRole;
  documents: ClientDocument[];
}

export function DocumentManager({
  clientId,
  role,
  documents: initialDocs,
}: DocumentManagerProps) {
  const [documents, setDocuments] = useState(initialDocs);
  const [selectedPurpose, setSelectedPurpose] = useState<string>("all");
  const [previewDoc, setPreviewDoc] = useState<ClientDocument | null>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFilename, setUploadFilename] = useState("");
  const [uploadContent, setUploadContent] = useState("");
  const [uploadPurpose, setUploadPurpose] =
    useState<DocumentPurpose>("source_material");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const isAdmin = canRoleManageClientSetup(role);

  const filteredDocs = documents.filter((doc) => {
    if (selectedPurpose !== "all" && doc.purpose !== selectedPurpose) return false;
    return true;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
      setUploadError("Only .md and .txt files are supported.");
      return;
    }

    setUploadFilename(file.name);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadContent(text ?? "");
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleSaveUpload = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!uploadFilename.trim() || !uploadContent.trim()) {
      setUploadError("Filename and content are required.");
      return;
    }

    startTransition(async () => {
      const res = await uploadDocumentAction(clientId, {
        filename: uploadFilename.trim(),
        contentText: uploadContent,
        purpose: uploadPurpose,
      });

      if (res.error) {
        setUploadError(res.error);
      } else {
        setIsUploadOpen(false);
        setUploadFilename("");
        setUploadContent("");
        window.location.reload();
      }
    });
  };

  const handleArchive = (doc: ClientDocument) => {
    if (!confirm(`Archive ${doc.filename}?`)) return;

    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status: "archived" } : d)),
    );

    startTransition(async () => {
      await archiveDocumentAction(clientId, doc.id);
    });
  };

  const handleDelete = (doc: ClientDocument) => {
    if (!confirm(`Delete ${doc.filename}? This cannot be undone.`)) return;

    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));

    startTransition(async () => {
      await deleteDocumentAction(clientId, doc.id);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small font-semibold text-muted-foreground mr-1">
            Purpose:
          </span>
          <button
            type="button"
            onClick={() => setSelectedPurpose("all")}
            className={cn(
              "rounded-full px-3 py-1 text-caption font-medium transition-colors",
              selectedPurpose === "all"
                ? "bg-near-black text-white"
                : "bg-surface-container-low text-muted-foreground hover:bg-surface-container",
            )}
          >
            All ({documents.length})
          </button>
          {DOCUMENT_PURPOSES.map((purpose) => {
            const count = documents.filter((d) => d.purpose === purpose).length;
            return (
              <button
                key={purpose}
                type="button"
                onClick={() => setSelectedPurpose(purpose)}
                className={cn(
                  "rounded-full px-3 py-1 text-caption font-medium transition-colors",
                  selectedPurpose === purpose
                    ? "bg-near-black text-white"
                    : "bg-surface-container-low text-muted-foreground hover:bg-surface-container",
                )}
              >
                {DOCUMENT_PURPOSE_LABELS[purpose].split(" ")[0]} ({count})
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className={cn(buttonVariants({ variant: "brand" }), "gap-2 self-start")}
        >
          <Upload className="h-4 w-4" />
          Upload Document (.md / .txt)
        </button>
      </div>

      {/* Upload Form Modal */}
      {isUploadOpen && (
        <Card className="border-2 border-brand-orange/40 bg-surface-container-lowest shadow-md">
          <CardHeader>
            <CardTitle className="text-card-title flex items-center gap-2">
              <FileCode className="h-5 w-5 text-brand-orange" />
              Upload Supporting Document
            </CardTitle>
            <p className="text-caption text-muted-foreground">
              Add Markdown briefs, case study notes, or raw transcripts. Content is
              securely isolated to this workspace and indexed for relevant draft retrieval.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveUpload} className="flex flex-col gap-4">
              {uploadError && (
                <div className="rounded-md bg-danger/10 p-3 text-small text-danger-strong">
                  {uploadError}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-small font-medium">Select File</label>
                <input
                  type="file"
                  accept=".md,.txt"
                  onChange={handleFileUpload}
                  className="rounded-md border border-border-grey bg-white p-2 text-small"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-small font-medium">Filename *</label>
                  <Input
                    value={uploadFilename}
                    onChange={(e) => setUploadFilename(e.target.value)}
                    placeholder="e.g. quarterly-case-study.md"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-small font-medium">Purpose</label>
                  <select
                    value={uploadPurpose}
                    onChange={(e) =>
                      setUploadPurpose(e.target.value as DocumentPurpose)
                    }
                    className="rounded-md border border-border-grey bg-white px-3 py-2 text-small"
                  >
                    {DOCUMENT_PURPOSES.map((p) => (
                      <option
                        key={p}
                        value={p}
                        disabled={
                          (p === "reader_download" || p === "profile_reference") &&
                          !isAdmin
                        }
                      >
                        {DOCUMENT_PURPOSE_LABELS[p]}
                        {(p === "reader_download" || p === "profile_reference") &&
                        !isAdmin
                          ? " (Admin only)"
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-small font-medium">Document Text (.md / .txt)</label>
                <Textarea
                  value={uploadContent}
                  onChange={(e) => setUploadContent(e.target.value)}
                  placeholder="Paste or edit markdown text here..."
                  rows={8}
                  className="font-mono text-caption"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-grey">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className={cn(buttonVariants({ variant: "outline" }))}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={cn(buttonVariants({ variant: "brand" }))}
                  disabled={isPending}
                >
                  {isPending ? "Indexing..." : "Upload & Index"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Safe Preview Modal */}
      {previewDoc && (
        <Card className="border-2 border-brand-purple/30 bg-surface-container-lowest shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-card-title">{previewDoc.filename}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">v{previewDoc.version}</Badge>
                <Badge variant="neutral">
                  {DOCUMENT_PURPOSE_LABELS[previewDoc.purpose]}
                </Badge>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPreviewDoc(null)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Close
            </button>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border-grey bg-surface-container-low p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-mono text-caption text-foreground">
                {previewDoc.contentText}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      {filteredDocs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-grey p-8 text-center text-muted-foreground">
          <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p className="font-medium">No documents uploaded</p>
          <p className="text-caption mt-1">
            Upload markdown or text files to provide factual proof and source material
            for drafting.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredDocs.map((doc) => (
            <Card
              key={doc.id}
              className={cn(
                "flex flex-col justify-between transition-shadow hover:shadow-sm",
                doc.status === "archived" && "opacity-60 bg-muted/20",
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-brand-orange" />
                    <span className="font-semibold text-small truncate max-w-xs">
                      {doc.filename}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-caption">
                      v{doc.version}
                    </Badge>
                    {doc.status === "ready" && (
                      <Badge variant="success" className="gap-1 text-caption">
                        <CheckCircle className="h-3 w-3" /> Ready
                      </Badge>
                    )}
                    {doc.status === "archived" && (
                      <Badge variant="neutral" className="text-caption">
                        Archived
                      </Badge>
                    )}
                    {doc.status === "failed" && (
                      <Badge variant="danger" className="gap-1 text-caption">
                        <AlertCircle className="h-3 w-3" /> Failed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pb-3">
                <span className="text-caption text-muted-foreground">
                  Purpose: <strong>{DOCUMENT_PURPOSE_LABELS[doc.purpose]}</strong>
                </span>
                <span className="text-caption text-muted-foreground font-mono truncate">
                  Hash: {doc.contentHash.slice(0, 16)}... ({Math.round(doc.fileSizeBytes / 1024)} KB)
                </span>

                <div className="mt-2 flex items-center justify-between border-t border-border-grey pt-2.5">
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(doc)}
                    className="inline-flex items-center gap-1 text-caption font-medium text-brand-orange hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>

                  <div className="flex items-center gap-2">
                    {doc.status !== "archived" && (
                      <button
                        type="button"
                        onClick={() => handleArchive(doc)}
                        className="text-caption text-muted-foreground hover:text-warning-strong p-1"
                        title="Archive version"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(doc)}
                        className="text-caption text-muted-foreground hover:text-danger-strong p-1"
                        title="Delete document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
