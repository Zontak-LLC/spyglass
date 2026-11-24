import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CLIENT } from "../src/web/client.js";
import { boardPage } from "../src/web/index.js";

// Pinned so that a change to the page script text is seen.
const CLIENT_SHA256 = "ee37e16d69a7f0f74a1adfdcad7b90b25c880cdd47190be77b0b81c404236f13";
const CLIENT_LENGTH = 16170;
const PAGE_SHA256 = "621bd18b6c3c8612bb5ffa03e0084927f72179f62299639a4e71ea4bf4f895c7";
const PAGE_LENGTH = 27005;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the page script text", () => {
  it("is byte-for-byte what it was", () => {
    expect({ hash: sha256(CLIENT), length: CLIENT.length }).toEqual({ hash: CLIENT_SHA256, length: CLIENT_LENGTH });
  });

  it("is the same inside the served board page", () => {
    const page = boardPage();
    expect({ hash: sha256(page), length: page.length }).toEqual({ hash: PAGE_SHA256, length: PAGE_LENGTH });
  });
});
