"use client";

import { useState } from "react";

interface TimerBannerProps {
  limitMinutes: number;
  secondsSpent: number;
}

export default function TimerBanner({
  limitMinutes,
  secondsSpent,
}: TimerBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const limitSeconds = limitMinutes * 60;
  const ratio = Math.min(secondsSpent / limitSeconds, 1);
  const percentage = Math.round(ratio * 100);
  const secondsRemaining = Math.max(limitSeconds - secondsSpent, 0);
  const minutesRemaining = Math.floor(secondsRemaining / 60);
  const isOver = secondsSpent >= limitSeconds;
  const isWarning = !isOver && ratio >= 0.8;

  const barColor = isOver
    ? "bg-red-500"
    : isWarning
    ? "bg-yellow-400"
    : "bg-indigo-500";

  const label = isOver
    ? "Time's up"
    : minutesRemaining === 1
    ? "1 min remaining"
    : `${minutesRemaining} min remaining`;

  return (
    <>
      {/* Slim banner bar */}
      <div
        className="fixed top-0 left-0 right-0 z-40 bg-gray-900 border-b border-gray-800"
        role="status"
        aria-label="Reading time tracker"
      >
        <div className="flex items-center justify-between px-4 py-1 text-xs text-gray-400">
          <span>{label}</span>
          <span>{percentage}%</span>
        </div>
        <div className="h-1 w-full bg-gray-800">
          <div
            className={`h-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Full-screen overlay when time is up and not dismissed */}
      {isOver && !dismissed && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Time's up"
        >
          <div className="text-center max-w-sm px-6">
            <p className="text-5xl mb-4">⏰</p>
            <h2 className="text-3xl font-bold text-gray-100 mb-2">
              Time&rsquo;s up
            </h2>
            <p className="text-gray-400 mb-6">
              You&rsquo;ve reached your {limitMinutes}-minute reading limit.
              Time to take a break.
            </p>
            <button
              onClick={() => setDismissed(true)}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
            >
              Dismiss and continue anyway
            </button>
          </div>
        </div>
      )}
    </>
  );
}
