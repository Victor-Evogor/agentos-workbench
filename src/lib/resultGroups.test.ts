import test from "node:test";
import assert from "node:assert/strict";
import { groupResultsByDocumentId } from "./resultGroups";

test("groupResultsByDocumentId groups hits by document id in insertion order", () => {
  const grouped = groupResultsByDocumentId([
    { documentId: "doc-a", value: "first-a" },
    { documentId: "doc-b", value: "first-b" },
    { documentId: "doc-a", value: "second-a" },
  ]);

  assert.deepEqual(Array.from(grouped.keys()), ["doc-a", "doc-b"]);
  assert.deepEqual(grouped.get("doc-a"), [
    { documentId: "doc-a", value: "first-a" },
    { documentId: "doc-a", value: "second-a" },
  ]);
  assert.deepEqual(grouped.get("doc-b"), [
    { documentId: "doc-b", value: "first-b" },
  ]);
});

test("groupResultsByDocumentId returns an empty map for empty input", () => {
  const grouped = groupResultsByDocumentId([]);
  assert.equal(grouped.size, 0);
});
