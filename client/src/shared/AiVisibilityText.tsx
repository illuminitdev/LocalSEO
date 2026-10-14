import React from 'react';

/**
 * Renders an AI visibility observation, showing every "Not Listed" as a red "(Not Listed)".
 * Handles both the auto-generated text and older text typed in an Excel ("Ans : Not Listed").
 */
export default function AiVisibilityText({ text }: { text: string }) {
    const parts = String(text || '').split(/(\(?\s*Not Listed\s*\)?)/gi);
    return (
        <>
            {parts.map((part, i) =>
                /^\(?\s*Not Listed\s*\)?$/i.test(part) ? (
                    <span key={i} className="text-red-600 font-semibold">
                        (Not Listed)
                    </span>
                ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                )
            )}
        </>
    );
}
