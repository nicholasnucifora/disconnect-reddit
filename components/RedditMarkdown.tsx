"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { visit } from "unist-util-visit";
import type { Root, Text, InlineCode } from "mdast";

const SPOILER_PREFIX = "RDSPOILER:";

// Remark plugin: converts >!text!< into inlineCode nodes tagged for spoiler rendering
function remarkSpoiler() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const regex = />!([\s\S]+?)!</g;
      const parts: (Text | InlineCode)[] = [];
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) });
        }
        parts.push({ type: "inlineCode", value: `${SPOILER_PREFIX}${match[1]}` });
        lastIndex = match.index + match[0].length;
      }

      if (parts.length === 0) return;

      if (lastIndex < node.value.length) {
        parts.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      (parent.children as unknown[]).splice(index, 1, ...parts);
    });
  };
}

function SpoilerText({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      data-comment-no-collapse="true"
      onClick={() => setRevealed((r) => !r)}
      title={revealed ? "Click to hide" : "Click to reveal spoiler"}
      className={`cursor-pointer rounded px-0.5 transition-colors ${
        revealed
          ? "bg-gray-700 text-gray-200"
          : "bg-gray-600 text-gray-600 select-none hover:bg-gray-500"
      }`}
    >
      {text}
    </span>
  );
}

interface RedditMarkdownProps {
  children: string;
  className?: string;
}

export default function RedditMarkdown({ children, className }: RedditMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkSpoiler]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {c}
            </a>
          ),
          h1: ({ children: c }) => <p className="font-bold text-base">{c}</p>,
          h2: ({ children: c }) => <p className="font-bold">{c}</p>,
          h3: ({ children: c }) => <p className="font-semibold">{c}</p>,
          blockquote: ({ children: c }) => (
            <blockquote className="my-4 rounded-r-lg border-l-4 border-emerald-400/70 bg-emerald-500/10 px-4 py-3 text-gray-300 not-italic [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              {c}
            </blockquote>
          ),
          pre: ({ children: c }) => (
            <pre className="bg-gray-800 rounded p-3 overflow-x-auto my-2 text-sm">
              {c}
            </pre>
          ),
          code: ({ children: c, className: cn }) => {
            const text = String(c);
            // Spoiler nodes injected by remarkSpoiler
            if (text.startsWith(SPOILER_PREFIX)) {
              return <SpoilerText text={text.slice(SPOILER_PREFIX.length)} />;
            }
            // Block code (inside <pre>): just pass through with language class
            if (cn?.startsWith("language-")) {
              return <code className={cn}>{c}</code>;
            }
            // Inline code
            return (
              <code className="text-amber-300 bg-gray-800 px-1 rounded">
                {c}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
