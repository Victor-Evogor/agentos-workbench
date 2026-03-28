export interface DocumentScopedResult {
  documentId: string;
}

export function groupResultsByDocumentId<T extends DocumentScopedResult>(
  results: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const result of results) {
    const existing = groups.get(result.documentId);
    if (existing) {
      existing.push(result);
    } else {
      groups.set(result.documentId, [result]);
    }
  }

  return groups;
}
