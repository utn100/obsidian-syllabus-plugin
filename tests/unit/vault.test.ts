import { App, TFile } from "obsidian";
import { initVaultFolders } from "../../src/vault-init";
import { DEFAULT_SETTINGS } from "../../src/settings";

function makeApp(opts: {
  folderExists?: boolean;
  fileExists?: boolean;
  createFolderThrows?: string | null;
} = {}): App {
  const app = new App();
  (app as any).vault = {
    getAbstractFileByPath: jest.fn((path: string) => {
      if (opts.folderExists && !path.includes(".")) return { path };
      if (opts.fileExists && (path.endsWith(".md") || path.endsWith(".json"))) return new TFile(path, path.split("/").pop()!.replace(/\.\w+$/, ""));
      return null;
    }),
    createFolder: jest.fn(async (_path: string) => {
      if (opts.createFolderThrows) throw new Error(opts.createFolderThrows);
    }),
    create: jest.fn(async (_path: string, _content: string) => {}),
    modify: jest.fn(async (_file: TFile, _content: string) => {}),
  };
  return app;
}

describe("initVaultFolders", () => {
  it("creates all folders when none exist", async () => {
    const app = makeApp({ folderExists: false });
    await initVaultFolders(app, DEFAULT_SETTINGS);
    expect((app as any).vault.createFolder).toHaveBeenCalledWith("syllabus");
    expect((app as any).vault.createFolder).toHaveBeenCalledWith("syllabus/concepts");
    expect((app as any).vault.createFolder).toHaveBeenCalledWith("syllabus/inbox/processed");
  });

  it("does not throw when folders already exist (Obsidian throws 'already exists')", async () => {
    const app = makeApp({ createFolderThrows: "Folder already exists." });
    await expect(initVaultFolders(app, DEFAULT_SETTINGS)).resolves.not.toThrow();
  });

  it("rethrows unexpected errors", async () => {
    const app = makeApp({ createFolderThrows: "Permission denied" });
    await expect(initVaultFolders(app, DEFAULT_SETTINGS)).rejects.toThrow("Permission denied");
  });

  it("skips file creation if files already exist", async () => {
    const app = makeApp({ fileExists: true, createFolderThrows: "Folder already exists." });
    await initVaultFolders(app, DEFAULT_SETTINGS);
    expect((app as any).vault.create).not.toHaveBeenCalled();
  });

  it("respects custom meridianFolder setting", async () => {
    const app = makeApp();
    const settings = { ...DEFAULT_SETTINGS, meridianFolder: "my-learning" };
    await initVaultFolders(app, settings);
    expect((app as any).vault.createFolder).toHaveBeenCalledWith("my-learning");
    expect((app as any).vault.createFolder).toHaveBeenCalledWith("my-learning/concepts");
  });
});

describe("memory helpers", () => {
  it("extractTopicsFromPlan finds topic slugs", () => {
    const { extractTopicsFromPlan } = require("../../src/memory");
    const plan = `
## Topics by theme
### Theme 1
- **1.1. Python for DS** — prerequisites: none
- **1.2. Supervised Learning** — prerequisites: 1.1

### Theme 2
- **2.1. MDP Framework** — prerequisites: 1.2
`;
    const topics = extractTopicsFromPlan(plan);
    expect(topics).toContain("python-for-ds");
    expect(topics).toContain("supervised-learning");
    expect(topics).toContain("mdp-framework");
  });

  it("extractTopicsFromPlan includes all topics including language", () => {
    const { extractTopicsFromPlan } = require("../../src/memory");
    const plan = `
## Topics by theme
### Theme 1
- **1.1. Python Basics** — prerequisites: none
### Theme 4
- **4.1. Chinese HSK 3 Vocabulary** — prerequisites: none
`;
    const topics = extractTopicsFromPlan(plan);
    expect(topics).toContain("python-basics");
    // Language topics are now included (no hard-coded filter)
    expect(topics).toContain("chinese-hsk-3-vocabulary");
  });

  it("stripCodeFence removes markdown fences", () => {
    const { stripCodeFence } = require("../../src/memory");
    const wrapped = "```markdown\n# Hello\n```";
    expect(stripCodeFence(wrapped)).toBe("# Hello");
  });

  it("stripCodeFence is a no-op on plain text", () => {
    const { stripCodeFence } = require("../../src/memory");
    const plain = "# Hello\n\nSome content";
    expect(stripCodeFence(plain)).toBe(plain);
  });

  it("calcCapacity returns 0 with no topics", () => {
    const { calcCapacity, emptyMemory } = require("../../src/memory");
    expect(calcCapacity(emptyMemory())).toBe(0);
  });

  it("calcCapacity calculates correctly", () => {
    const { calcCapacity, emptyMemory, emptyTopic } = require("../../src/memory");
    const mem = emptyMemory();
    mem.topics["a"] = { ...emptyTopic("a"), so_what_filled: true };
    mem.topics["b"] = { ...emptyTopic("b"), so_what_filled: false };
    mem.topics["c"] = { ...emptyTopic("c"), so_what_filled: false };
    expect(calcCapacity(mem)).toBe(33.3);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const { cosineSimilarity } = require("../../src/embeddings");
    const v = [0.5, 0.5, 0.5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    const { cosineSimilarity } = require("../../src/embeddings");
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 for mismatched lengths", () => {
    const { cosineSimilarity } = require("../../src/embeddings");
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});
