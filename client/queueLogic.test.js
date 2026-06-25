import { describe, it, expect } from "vitest";

function priorityRank(priority) {
  if (priority === "Emergency") return 0;
  if (priority === "Urgent") return 1;
  return 2;
}

function sortQueue(a, b) {
  const pa = priorityRank(a.urgency);
  const pb = priorityRank(b.urgency);
  if (pa !== pb) return pa - pb;
  return new Date(a.createdAt) - new Date(b.createdAt);
}

function estimateWait(position, avgConsult, doctorDelay, urgency) {
  const priorityAdj =
    urgency === "Emergency" ? -avgConsult : urgency === "Urgent" ? -2 : 0;

  return Math.max(0, position * avgConsult + doctorDelay + priorityAdj);
}

describe("QueueCare AI queue logic", () => {
  it("places emergency patients before normal patients", () => {
    const queue = [
      { token: "T-001", urgency: "Normal", createdAt: "2026-06-25T10:00:00Z" },
      { token: "T-002", urgency: "Emergency", createdAt: "2026-06-25T10:05:00Z" }
    ].sort(sortQueue);

    expect(queue[0].token).toBe("T-002");
  });

  it("preserves FIFO order for same priority patients", () => {
    const queue = [
      { token: "T-002", urgency: "Normal", createdAt: "2026-06-25T10:05:00Z" },
      { token: "T-001", urgency: "Normal", createdAt: "2026-06-25T10:00:00Z" }
    ].sort(sortQueue);

    expect(queue[0].token).toBe("T-001");
  });

  it("calculates wait time from real queue position and average consultation", () => {
    expect(estimateWait(3, 7, 0, "Normal")).toBe(21);
  });

  it("reduces wait time for urgent patients", () => {
    expect(estimateWait(2, 7, 0, "Urgent")).toBe(12);
  });

  it("fast-tracks emergency patients without negative wait time", () => {
    expect(estimateWait(0, 7, 0, "Emergency")).toBe(0);
  });

  it("adds doctor delay into wait time", () => {
    expect(estimateWait(2, 7, 5, "Normal")).toBe(19);
  });
});