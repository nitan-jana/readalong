// A PDF page image with boxes drawn over it in PDF-point coordinates. Used by the app (blocks to review)
// and the player (highlights).
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import type { Page } from '../types';

/** Position a box given in points as percentages of the page, so it scales with the image. */
export function boxStyle(page: Page, x0: number, y0: number, x1: number, y1: number, pad = 0): CSSProperties {
  return {
    left: `${((x0 - pad) / page.w) * 100}%`,
    top: `${((y0 - pad) / page.h) * 100}%`,
    width: `${((x1 - x0 + 2 * pad) / page.w) * 100}%`,
    height: `${((y1 - y0 + 2 * pad) / page.h) * 100}%`,
  };
}

/** Page coordinates (points) of a pointer event on a page element. */
export function pointOnPage(page: Page, el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  return { x: ((clientX - r.left) / r.width) * page.w, y: ((clientY - r.top) / r.height) * page.h };
}

interface Props extends HTMLAttributes<HTMLDivElement> {
  page: Page;
  index: number;
  eager?: boolean;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function PdfPage({ page, index, eager, children, className, style, ref, ...rest }: Props) {
  return (
    <div ref={ref} className={`pg ${className ?? ''}`} style={{ aspectRatio: `${page.w} / ${page.h}`, ...style }} {...rest}>
      <img src={page.src} alt={`Page ${index + 1}`} loading={eager ? 'eager' : 'lazy'} />
      {children}
    </div>
  );
}
