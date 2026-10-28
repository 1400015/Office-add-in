import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
async function loadOfficeService() {
  const mod = await import("../src/services/OfficeService");
  return {
    getHost: mod.getHost,
    getPlatform: mod.getPlatform,
    isOfficeReady: mod.isOfficeReady,
    isOllamaCompatible: mod.isOllamaCompatible,
    insertTextAtSelection: mod.insertTextAtSelection,
  };
}

type OfficeService = Awaited<ReturnType<typeof loadOfficeService>>;

let svc: OfficeService;

type MockOffice = {
  context: {
    host: number;
    platform: number;
  };
  onReady: (cb: (info: unknown) => void) => void;
  HostType: Record<string, number>;
  PlatformType: Record<string, number>;
};

let office: MockOffice | undefined;

function installOffice(host: string, platform: string): void {
  office = {
    context: { host: 0, platform: 0 },
    onReady: (cb) => cb({}),
    HostType: { Word: 1, Excel: 2, PowerPoint: 3, Unknown: 0 },
    PlatformType: {
      PC: 1,
      Mac: 2,
      iOS: 3,
      Android: 4,
      Universal: 5,
      OfficeOnline: 6,
    },
  };
  office.context.host = office.HostType[host]!;
  office.context.platform = office.PlatformType[platform]!;
  vi.stubGlobal("Office", office);
}

function installWordRun(): void {
  vi.stubGlobal("Word", {
    InsertLocation: { end: "end" },
    run: async (cb: (ctx: unknown) => Promise<unknown>) => {
      const ctx = {
        document: {
          getSelection: () => ({
            text: "hello world",
            load: () => {},
            insertText: () => {},
          }),
        },
        sync: async () => {},
      };
      return cb(ctx);
    },
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.unstubAllGlobals();
  svc = await loadOfficeService();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isOfficeReady", () => {
  it("returns false when Office is undefined", () => {
    expect(svc.isOfficeReady()).toBe(false);
  });

  it("returns true when Office.context is set", () => {
    installOffice("Word", "PC");
    expect(svc.isOfficeReady()).toBe(true);
  });
});

describe("getHost", () => {
  it("returns unknown when Office is not available", () => {
    expect(svc.getHost()).toBe("unknown");
  });

  it("maps Word host", () => {
    installOffice("Word", "PC");
    expect(svc.getHost()).toBe("word");
  });

  it("maps Excel host", () => {
    installOffice("Excel", "PC");
    expect(svc.getHost()).toBe("excel");
  });

  it("maps PowerPoint host", () => {
    installOffice("PowerPoint", "PC");
    expect(svc.getHost()).toBe("powerpoint");
  });

  it("maps unknown host value", () => {
    installOffice("Unknown", "PC");
    expect(svc.getHost()).toBe("unknown");
  });
});

describe("getPlatform", () => {
  it("returns desktop for PC", () => {
    installOffice("Word", "PC");
    expect(svc.getPlatform()).toBe("desktop");
  });

  it("returns desktop for Mac", () => {
    installOffice("Word", "Mac");
    expect(svc.getPlatform()).toBe("desktop");
  });

  it("returns web for OfficeOnline", () => {
    installOffice("Word", "OfficeOnline");
    expect(svc.getPlatform()).toBe("web");
  });

  it("returns unknown when Office is not available", () => {
    expect(svc.getPlatform()).toBe("unknown");
  });
});

describe("isOllamaCompatible", () => {
  it("returns true when host is unknown (not inside Office)", () => {
    expect(svc.isOllamaCompatible()).toBe(true);
  });

  it("returns true on desktop", () => {
    installOffice("Word", "PC");
    expect(svc.isOllamaCompatible()).toBe(true);
  });

  it("returns false on web", () => {
    installOffice("Word", "OfficeOnline");
    expect(svc.isOllamaCompatible()).toBe(false);
  });
});

describe("insertTextAtSelection", () => {
  it("throws for non-Word hosts", async () => {
    installOffice("Excel", "PC");
    await expect(svc.insertTextAtSelection("text")).rejects.toThrow(
      /not supported in excel/i
    );
  });

  it("inserts text at selection in Word", async () => {
    installOffice("Word", "PC");
    installWordRun();
    await expect(
      svc.insertTextAtSelection("inserted")
    ).resolves.toBeUndefined();
  });
});
