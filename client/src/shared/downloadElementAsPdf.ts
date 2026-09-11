import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
            logging: false
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
