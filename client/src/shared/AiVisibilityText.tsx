import React from 'react';

const RESULT = /(\(\s*(?:Not Listed|Listed|\d+(?:st|nd|rd|th) place)\s*\)|Not Listed)/gi;

/**
 * Renders an AI visibility observation with the result of each question highlighted:
 * "(Not Listed)" in red, "(2nd place)" / "(Listed)" in green.
 * Also handles older text typed in an Excel ("Ans : Not Listed").
 */
export default function AiVisibilityText({ text }: { text: string }) {
    const parts = String(text || '').split(RESULT);
    return (
        <>
            {parts.map((part, i) => {
                if (/^\(?\s*Not Listed\s*\)?$/i.test(part)) {
                    return (
                        <span key={i} className="text-red-600 font-semibold">
                            (Not Listed)
                        </span>
                    );
                }
                const ranked = part.match(/^\(\s*(Listed|\d+(?:st|nd|rd|th) place)\s*\)$/i);
                if (ranked) {
                    return (
                        <span key={i} className="text-emerald-600 font-semibold">
                            ({ranked[1]})
                        </span>
                    );
                }
                return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
        </>
    );
}
