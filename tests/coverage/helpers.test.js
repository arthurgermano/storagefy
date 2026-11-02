import { describe, it, expect, afterEach, vi } from "vitest";
import CrossTabChannel from "../../src/helpers/CrossTabChannel.js";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";
import { logError, logWarn, logInfo, logTrace } from "../../src/helpers/loggerHelper.js";
import { reportFailure } from "../../src/helpers/failureReport.js";

// ------------------------------------------------------------------------------------------------
// The helpers' remaining paths: the channel when the browser fails it, the cipher without Web Crypto, the debug log,
// the failure report.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.storagefyDebug = false;
  globalThis.storagefyDebugLevel = 0;
});

describe("CrossTabChannel — when things fail", () => {
  it("names itself when given no name", () => {
    const channel = new CrossTabChannel(undefined);
    expect(channel.channelName).toMatch(/^storagefy_channel_/);
    channel.close();
  });

  it("passes on a BroadcastChannel that cannot be created", () => {
    vi.stubGlobal("BroadcastChannel", class {
      constructor() {
        throw new Error("not supported");
      }
    });
    expect(() => new CrossTabChannel("x")).toThrow("not supported");
  });

  it("a listener that is not a function is refused — and stopping it does nothing", () => {
    const channel = new CrossTabChannel("x");
    expect(channel.subscribe("nope")()).toBeUndefined();
    channel.close();
  });

  it("a listener that throws is logged, not passed on", () => {
    const channel = new CrossTabChannel("x");
    const listen = vi.spyOn(channel.channel, "addEventListener");
    channel.subscribe(() => {
      throw new Error("listener bug");
    });
    const [, listener] = listen.mock.calls[0];
    expect(() => listener({ data: 1 })).not.toThrow();
    channel.close();
  });

  it("a message that cannot be sent, or a close that fails, is logged", () => {
    const channel = new CrossTabChannel("x");
    vi.spyOn(channel.channel, "postMessage").mockImplementation(() => {
      throw new Error("cannot clone");
    });
    vi.spyOn(channel.channel, "close").mockImplementation(() => {
      throw new Error("already closed");
    });
    expect(() => channel.emit(() => {})).not.toThrow();
    expect(() => channel.close()).not.toThrow();
  });
});

describe("cryptoHelper — without Web Crypto", () => {
  it("fails when encryption is used, not before", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(cryptoHelper.deriveKey("pw", "salt")).rejects.toThrow("Crypto API not available");
  });

  it("obfuscation keeps an empty name as it is", () => {
    expect(cryptoHelper.simpleObfuscate("")).toBe("");
    expect(cryptoHelper.simpleDeobfuscate("")).toBe("");
  });
});

describe("loggerHelper — debug mode", () => {
  it("logs nothing by default", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("x");
    expect(error).not.toHaveBeenCalled();
  });

  it("logs each level from the level asked up", () => {
    const calls = {
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      trace: vi.spyOn(console, "trace").mockImplementation(() => {}),
    };
    globalThis.storagefyDebug = true;
    globalThis.storagefyDebugLevel = 3;
    logError("e");
    logWarn("w");
    logInfo("i");
    logTrace("t");
    expect(calls.error).toHaveBeenCalledWith("Storagefy Error:", "e");
    expect(calls.warn).toHaveBeenCalledWith("Storagefy Warn:", "w");
    expect(calls.info).toHaveBeenCalledWith("Storagefy:", "i");
    expect(calls.trace).toHaveBeenCalledWith("Storagefy:", "t");

    globalThis.storagefyDebugLevel = 0;
    logWarn("w2");
    logInfo("i2");
    logTrace("t2");
    expect(calls.warn).toHaveBeenCalledTimes(1);
    expect(calls.info).toHaveBeenCalledTimes(1);
    expect(calls.trace).toHaveBeenCalledTimes(1);
  });
});

describe("reportFailure", () => {
  it("builds the error with its cause, and without one", () => {
    const errors = [];
    reportFailure("save", "cart", (error) => errors.push(error), new Error("full"));
    reportFailure("read", "cart", (error) => errors.push(error));
    expect(errors.map((error) => [error.message, error.cause?.message])).toEqual([
      ['Storagefy: could not save "cart"', "full"],
      ['Storagefy: could not read "cart"', undefined],
    ]);
  });
});
