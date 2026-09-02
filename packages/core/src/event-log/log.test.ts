import type { RuntimeEvent } from "@ao/shared";
import { describe, expect, it } from "vitest";
import { EventLog, parseEventLog } from "./log.js";

function stageStarted(stageId: string): RuntimeEvent {
  return {
    type: "stage.started",
    runId: "run_placeholder",
    seq: -1,
    payload: { stageId, taskCount: 1, tokensUsed: 0, criteriaMet: [] },
  };
}

describe("EventLog.append", () => {
  it("assigns strictly increasing seq regardless of what the caller supplied", () => {
    const log = new EventLog("run_a1");
    const e1 = log.append(stageStarted("s1"));
    const e2 = log.append(stageStarted("s2"));
    expect(e1.seq).toBe(0);
    expect(e2.seq).toBe(1);
    expect(e1.runId).toBe("run_a1");
  });

  it("after(seq) returns only strictly newer events", () => {
    const log = new EventLog("run_a1");
    log.append(stageStarted("s1"));
    log.append(stageStarted("s2"));
    log.append(stageStarted("s3"));
    const caughtUp = log.after(0);
    expect(caughtUp.map((e) => e.seq)).toEqual([1, 2]);
  });
});

describe("EventLog serialize / fromSerialized", () => {
  it("round-trips every event exactly", () => {
    const log = new EventLog("run_a1");
    log.append(stageStarted("s1"));
    log.append(stageStarted("s2"));
    const restored = EventLog.fromSerialized("run_a1", log.serialize());
    expect(restored.all()).toEqual(log.all());
  });

  it("continues the seq sequence after a restore, rather than restarting it", () => {
    const log = new EventLog("run_a1");
    log.append(stageStarted("s1"));
    log.append(stageStarted("s2"));
    const restored = EventLog.fromSerialized("run_a1", log.serialize());
    const next = restored.append(stageStarted("s3"));
    expect(next.seq).toBe(2);
  });

  it("serializes an empty log as an empty string", () => {
    expect(new EventLog("run_a1").serialize()).toBe("");
  });
});

describe("parseEventLog — crash tolerance", () => {
  it("keeps every complete line and silently drops a truncated trailing line", () => {
    const log = new EventLog("run_a1");
    log.append(stageStarted("s1"));
    log.append(stageStarted("s2"));
    const complete = log.serialize();
    const truncated = complete + '{"type":"stage.started","runId":"run_a1","seq":2,"payload":{"stageId":"s3"'; // cut mid-write, no trailing newline

    const parsed = parseEventLog(truncated);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.droppedLines).toBe(0); // the truncated tail isn't counted as a violation
  });

  it("counts a genuinely malformed (non-trailing) line as dropped", () => {
    const log = new EventLog("run_a1");
    log.append(stageStarted("s1"));
    const withGarbage = log.serialize() + "not json at all\n" + log.serialize();
    const parsed = parseEventLog(withGarbage);
    expect(parsed.droppedLines).toBe(1);
    expect(parsed.events).toHaveLength(2);
  });

  it("never throws on arbitrary truncation of a real log, at every byte offset", () => {
    const log = new EventLog("run_a1");
    for (let i = 0; i < 5; i++) log.append(stageStarted(`s${String(i)}`));
    const text = log.serialize();
    for (let i = 0; i <= text.length; i++) {
      expect(() => parseEventLog(text.slice(0, i))).not.toThrow();
    }
  });
});
