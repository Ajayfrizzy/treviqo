"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function DocumentActions({ id, ready }: { id: string; ready: boolean }) {
  const router = useRouter(); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [link, setLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!link || !expiresAt) return;
    const invalidate = () => { if (Date.now() >= expiresAt) { setLink(null); setExpired(true); } };
    const timer = setTimeout(invalidate, Math.max(0, expiresAt - Date.now()));
    window.addEventListener("focus", invalidate);
    return () => { clearTimeout(timer); window.removeEventListener("focus", invalidate); };
  }, [link, expiresAt]);
  async function request(action: "access" | "delete") {
    const startedAt = Date.now();
    setBusy(true); setError(""); setLink(null); setExpired(false);
    try {
      const response = await fetch(`/api/documents/${id}${action === "access" ? "/access" : ""}`, { method: action === "access" ? "POST" : "DELETE" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Request could not complete.");
      if (action === "delete") { router.replace("/documents?deleted=1"); router.refresh(); }
      else { setExpiresAt(startedAt + Math.min(60, result.expiresIn) * 1000 - 2000); setLink(result.url); setBusy(false); }
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); setBusy(false); router.refresh(); }
  }
  return <div className="document-actions">{error && <p role="alert" className="form-message">{error}</p>}
    {ready && <button disabled={busy} onClick={() => void request("access")}>Open / download</button>}
    {expired && <p role="status">Your download link expired. Choose Open / download for a new private link.</p>}
    {link && <div role="status"><p>Your private download link is ready. It expires shortly. If the storage page reports an error, return here and request a new link.</p><a className="button-link" href={link} onClick={event => { if (!expiresAt || Date.now() >= expiresAt) { event.preventDefault(); setLink(null); setExpired(true); } }} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Download document</a></div>}
    {!confirm ? <button className="secondary" disabled={busy} onClick={() => { setConfirm(true); setLink(null); }}>Delete document</button> : <div className="delete-confirm"><h2>Delete this document?</h2><p>The stored file will be removed. This cannot be undone.</p><button disabled={busy} onClick={() => void request("delete")}>Confirm deletion</button><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>Keep document</button></div>}
    {busy && <p role="status">Please wait…</p>}
  </div>;
}
