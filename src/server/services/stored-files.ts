import "server-only";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getStorage } from "@/lib/storage";
import {
  cleanFileName,
  detectDocumentType,
  DOCUMENT_TYPES_HINT,
  MAX_DOCUMENT_BYTES,
  type DocumentType,
} from "@/lib/storage/documents";

/**
 * Shared handling of uploaded documents (customer and employee documents, leave attachments): validation by the
 * file's real bytes, "store first, then record" with cleanup when the database write fails, and quiet removal.
 */

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/** Validates size and detects the real type from the bytes; returns the cleaned name and type. */
export function checkDocument(file: UploadedFile): { name: string; type: DocumentType } {
  if (file.bytes.byteLength === 0) throw new ValidationError("Choose a file to upload.");
  if (file.bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new ValidationError("Files must be 10 MB or smaller.");
  const name = cleanFileName(file.name);
  const type = detectDocumentType(file.bytes, name);
  if (!type) throw new ValidationError(`Upload a ${DOCUMENT_TYPES_HINT} file.`);
  return { name, type };
}

/** Puts the bytes in storage, then runs `record` (the database write); removes the file again if that fails. */
export async function storeThenRecord<T>(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  record: () => Promise<T>,
): Promise<T> {
  const storage = getStorage();
  await storage.put(key, bytes, contentType);
  try {
    return await record();
  } catch (error) {
    await storage
      .delete(key)
      .catch((cleanupError: unknown) => logger.warn("Orphaned uploaded file", { key, cleanupError }));
    throw error;
  }
}

/** The stored bytes, or NotFound (logged) when the file is missing from storage. */
export async function readStored(key: string, entity: string): Promise<Uint8Array> {
  const body = await getStorage().get(key);
  if (!body) {
    logger.error("Stored file missing", { key, entity });
    throw new NotFoundError(entity);
  }
  return body;
}

/** Deletes a file that is no longer referenced; a failure only leaves an orphan, which is logged. */
export async function deleteStoredQuietly(key: string): Promise<void> {
  await getStorage()
    .delete(key)
    .catch((error: unknown) => logger.warn("Could not delete stored file", { key, error }));
}
