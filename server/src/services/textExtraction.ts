import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { badRequest, HttpError } from '../utils/httpError.js';

/** File formats we can pull text out of. */
export type ResumeFormat = 'pdf' | 'docx';

/** Largest upload we accept, in bytes. Resumes are a page or two of text. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Shortest extraction we will treat as a real resume. A PDF that is just
 * scanned images parses fine but yields almost nothing, and that should be a
 * clear error rather than an empty analysis three phases later.
 */
const MIN_EXTRACTED_CHARS = 100;

/**
 * Upper bound on stored text. Well past any real resume, but it stops a
 * pathological file from bloating the row and, later, the LLM prompt.
 */
const MAX_EXTRACTED_CHARS = 100_000;

/**
 * Identify the format from the file's leading bytes rather than its extension
 * or the browser-supplied Content-Type, both of which the client controls and
 * can get wrong or lie about.
 */
export function detectFormat(buffer: Buffer): ResumeFormat {
  // "%PDF-"
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf';
  }

  // DOCX is a ZIP container, so it starts with a local file header "PK\x03\x04".
  if (buffer.subarray(0, 4).toString('latin1') === 'PK\x03\x04') {
    return 'docx';
  }

  // Legacy .doc is an OLE2 compound file — a common mistake worth naming.
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    throw badRequest(
      'This looks like an old .doc file. Please save it as .docx or PDF and try again.',
    );
  }

  throw badRequest('Unsupported file. Please upload a PDF or DOCX resume.');
}

/**
 * Collapse the ragged whitespace that PDF extraction produces — trailing
 * spaces on every line, runs of blank lines from page breaks — so the stored
 * text is compact and the later LLM prompt is not mostly padding.
 */
function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

/**
 * Pull plain text out of an uploaded resume.
 *
 * Parser failures are translated into 400s: a corrupt or password-protected
 * file is the user's problem to fix, not a server bug, and should not surface
 * as a 500.
 */
export async function extractResumeText(buffer: Buffer): Promise<{
  format: ResumeFormat;
  text: string;
}> {
  const format = detectFormat(buffer);

  let raw: string;
  try {
    raw = format === 'pdf' ? await extractFromPdf(buffer) : await extractFromDocx(buffer);
  } catch (err: unknown) {
    if (err instanceof HttpError) throw err;
    // eslint-disable-next-line no-console
    console.error(`Failed to parse ${format} upload:`, err);
    throw badRequest(
      'That file could not be read. If it is password-protected or damaged, try re-exporting it.',
    );
  }

  const text = normalizeWhitespace(raw);

  if (text.length < MIN_EXTRACTED_CHARS) {
    throw badRequest(
      'Almost no text could be read from that file. If it is a scanned image, ' +
        'please upload a text-based PDF or DOCX instead.',
    );
  }

  return { format, text: text.slice(0, MAX_EXTRACTED_CHARS) };
}
