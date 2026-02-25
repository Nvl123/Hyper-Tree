import { toPng } from 'html-to-image';

/**
 * Export the entire tree canvas to PNG and trigger download.
 */
export async function exportTreeAsPng() {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  // Temporarily reset transform for a clean capture
  const originalTransform = canvas.style.transform;
  canvas.style.transform = 'none';

  // Wait for reflow
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const dataUrl = await toPng(canvas, {
      backgroundColor: '#0f1117',
      pixelRatio: 2,
      filter: (node) => {
        // Exclude the SVG connections from being filtered (include everything)
        return true;
      },
    });

    const link = document.createElement('a');
    link.download = `hypertree-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export failed. Please try again.');
  } finally {
    canvas.style.transform = originalTransform;
  }
}
