// The extracted document, as stored in a read-along's doc.json.

/** A printed word and its box(es) on the page: [x0, y0, x1, y1] in points; two boxes when hyphenated across lines. */
export interface PrintedWord { text: string; boxes: [number, number, number, number][] }

export interface DocBlock {
  id: number;
  page: number;
  bbox: [number, number, number, number];
  text: string;    // as printed
  speech: string;  // what is said
  size: number;
  bold: boolean;
  kind: 'p' | 'h' | 'cap';
  keep: boolean;
  reason: string;  // why it's skipped
  words: PrintedWord[];
}

export interface Doc { title: string; pages: [number, number][]; blocks: DocBlock[] }

/** A block as read from the PDF, before deciding what's read. */
export interface RawBlock {
  page: number;
  bbox: [number, number, number, number];
  lines: string[];
  text: string;
  size: number;
  bold: boolean;
  words: PrintedWord[];
}
