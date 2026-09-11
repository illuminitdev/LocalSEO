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

/**
 * Inline computed RGB/RGBA colors onto the clone so PDF capture never reads
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
            const value = computed.getPropertyValue(
                prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
            );
            if (value && value !== 'rgba(0, 0, 0, 0)' && !value.includes('oklch') && !value.includes('oklab')) {
                dst.style.setProperty(
                    prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
                    value
                );
            }
        }
        // Browsers usually resolve oklch → rgb in getComputedStyle; prefer those.
        dst.style.color = computed.color;
        dst.style.backgroundColor = computed.backgroundColor;
        dst.style.borderTopColor = computed.borderTopColor;
        dst.style.borderRightColor = computed.borderRightColor;
        dst.style.borderBottomColor = computed.borderBottomColor;
        dst.style.borderLeftColor = computed.borderLeftColor;
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
        const margin = 10;
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
