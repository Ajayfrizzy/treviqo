"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function DocumentActions({ id, ready }: { id: string; ready: boolean }) {
  const router = useRouter(); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [link, setLink] = useState<string | null>(null);
  async function request(action: "access" | "delete") {
    setBusy(true); setError(""); setLink(null);
    try {
      const response = await fetch(`/api/documents/${id}${action === "access" ? "/access" : ""}`, { method: action === "access" ? "POST" : "DELETE" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Request could not complete.");
      if (action === "delete") { router.replace("/documents?deleted=1"); router.refresh(); }
      else { setLink(result.url); setBusy(false); }
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); setBusy(false); router.refresh(); }
  }
  return <div className="document-actions">{error && <p role="alert" className="form-message">{error}</p>}
    {ready && <button disabled={busy} onClick={() => void request("access")}>Open / download</button>}
    {link && <div role="status"><p>Your private download link is ready. It expires in 60 seconds.</p><a className="button-link" href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Download document</a></div>}
    {!confirm ? <button className="secondary" disabled={busy} onClick={() => { setConfirm(true); setLink(null); }}>Delete document</button> : <div className="delete-confirm"><h2>Delete this document?</h2><p>The stored file will be removed. This cannot be undone.</p><button disabled={busy} onClick={() => void request("delete")}>Confirm deletion</button><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>Keep document</button></div>}
    {busy && <p role="status">Please wait…</p>}
  </div>;
}
