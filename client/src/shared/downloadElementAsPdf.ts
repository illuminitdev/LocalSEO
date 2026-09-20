import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

const COLOR_PROPS = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'textDecorationColor',
    'columnRuleColor',
    'caretColor',
    'fill',
    'stroke'
] as const;

function cssPropName(prop: string) {
    return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function isModernColor(value: string) {
    return /oklch|oklab|color-mix|lab\(|lch\(/i.test(value);
}

function safeColor(value: string, fallback: string) {
    const v = String(value || '').trim();
    if (!v || v === 'rgba(0, 0, 0, 0)' || v === 'transparent' || isModernColor(v)) {
        return fallback;
    }
    return v;
}

/**
 * Inline resolved RGB colors onto the clone so PDF capture never reads
 * Tailwind v4 `oklch()` / `oklab()` values from stylesheets.
 */
function inlineComputedColors(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
    const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>('*'))];
    const cloneNodes = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>('*'))];
    const len = Math.min(sourceNodes.length, cloneNodes.length);

    for (let i = 0; i < len; i++) {
        const src = sourceNodes[i];
        const dst = cloneNodes[i];
        if (!src || !dst) continue;

        const computed = window.getComputedStyle(src);

        for (const prop of COLOR_PROPS) {
            const cssName = cssPropName(prop);
            const value = computed.getPropertyValue(cssName);
            if (!value || value === 'rgba(0, 0, 0, 0)' || isModernColor(value)) continue;
            dst.style.setProperty(cssName, value);
        }

        dst.style.color = safeColor(computed.color, '#0f172a');
        dst.style.backgroundColor = safeColor(computed.backgroundColor, 'transparent');
        dst.style.borderTopColor = safeColor(computed.borderTopColor, 'transparent');
        dst.style.borderRightColor = safeColor(computed.borderRightColor, 'transparent');
        dst.style.borderBottomColor = safeColor(computed.borderBottomColor, 'transparent');
        dst.style.borderLeftColor = safeColor(computed.borderLeftColor, 'transparent');

        if (dst.style.cssText && isModernColor(dst.style.cssText)) {
            dst.style.cssText = dst.style.cssText
                .replace(/oklch\([^)]*\)/gi, '#0f172a')
                .replace(/oklab\([^)]*\)/gi, '#0f172a')
                .replace(/color-mix\([^)]*\)/gi, '#0f172a');
        }
    }
}

/** Capture an element to a multi-page A4 PDF, hiding `.pdf-hide` nodes during capture. */
export async function downloadElementAsPdf(elementId: string, filename: string) {
    const el = document.getElementById(elementId);
    if (!el) throw new Error('Report content not found');

    const hidden: HTMLElement[] = [];
    el.querySelectorAll('.pdf-hide').forEach((node) => {
        const html = node as HTMLElement;
        if (html.style.display === 'none') return;
        hidden.push(html);
        html.dataset.pdfPrevDisplay = html.style.display;
        html.style.display = 'none';
    });

    try {
        const canvas = await html2canvas(el, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (_doc, clonedEl) => {
                if (clonedEl instanceof HTMLElement) {
                    inlineComputedColors(el, clonedEl);
                }
            }
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = margin;
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;

        while (heightLeft > 0) {
            position = margin - (imgHeight - heightLeft);
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            heightLeft -= pageHeight - margin * 2;
        }

        const safe = filename.replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 60);
        pdf.save(`${safe || 'zappsites-report'}.pdf`);
    } finally {
        hidden.forEach((html) => {
            html.style.display = html.dataset.pdfPrevDisplay || '';
            delete html.dataset.pdfPrevDisplay;
        });
    }
}
