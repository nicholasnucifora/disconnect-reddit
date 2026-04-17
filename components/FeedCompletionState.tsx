"use client";

interface FeedCompletionStateProps {
  title: string;
  description: string;
  note?: string;
}

export default function FeedCompletionState({
  title,
  description,
  note,
}: FeedCompletionStateProps) {
  return (
    <div className="mx-auto max-w-xl py-14">
      <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/12 via-gray-900 to-gray-950 px-6 py-8 text-center shadow-[0_0_0_1px_rgba(16,185,129,0.05)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-500/12 text-3xl text-emerald-300">
          {"\u2713"}
        </div>
        <p className="mb-3 inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
          Done For Today
        </p>
        <h2 className="text-2xl font-semibold text-gray-100">{title}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-300">{description}</p>
        {note && <p className="mt-4 text-xs uppercase tracking-[0.18em] text-gray-500">{note}</p>}
      </div>
    </div>
  );
}
