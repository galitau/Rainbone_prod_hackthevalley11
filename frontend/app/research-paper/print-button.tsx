"use client";

// The only interactive control on the research paper page; the paper itself renders on the server.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
    >
      Print or save as PDF
    </button>
  );
}
