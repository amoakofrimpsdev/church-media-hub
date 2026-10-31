import { describe, expect, it } from "vitest";
import {
  outstandingByPerson,
  outstandingTasks,
  type Task,
} from "@/lib/domain/assignments";
import {
  escapeHtml,
  handoffLateMessage,
  handoffReadyMessage,
  joinList,
  mention,
  serviceDayMessage,
  uploadReminderMessage,
  uploadSummaryMessage,
  type ReminderTarget,
} from "@/lib/telegram/messages";

const service = {
  name: "Sunday Service",
  date: "Sun, Oct 12, 2025",
  url: "https://app.example/services/1",
};

describe("mention", () => {
  it("tags by Telegram ID so people without a username are still notified", () => {
    expect(mention({ name: "Grace", telegramUserId: 42 })).toBe(
      '<a href="tg://user?id=42">Grace</a>',
    );
  });

  it("names someone in plain text if they have not linked Telegram", () => {
    expect(mention({ name: "Sam", telegramUserId: null })).toBe("Sam");
  });

  it("escapes names so they cannot inject formatting", () => {
    expect(mention({ name: "<b>Bob</b> & co", telegramUserId: 7 })).toBe(
      '<a href="tg://user?id=7">&lt;b&gt;Bob&lt;/b&gt; &amp; co</a>',
    );
  });
});

describe("joinList", () => {
  it.each([
    [[], ""],
    [["A"], "A"],
    [["A", "B"], "A and B"],
    [["A", "B", "C"], "A, B and C"],
  ])("joins %j as %j", (items, text) => {
    expect(joinList(items)).toBe(text);
  });
});

describe("serviceDayMessage", () => {
  const today = { ...service, time: "10:00 AM" };

  it("links to the service and escapes its name", () => {
    const message = serviceDayMessage({ ...today, name: "Youth <Night>" }, []);
    expect(message).toContain("Today: Youth &lt;Night&gt;</b>, 10:00 AM");
    expect(message).toContain('<a href="https://app.example/services/1">');
    expect(message).not.toContain("Covering today");
  });

  it("tags who is covering, with what they are uploading", () => {
    const message = serviceDayMessage(today, [
      { name: "Grace", telegramUserId: 42, categories: ["Preacher", "Baptism"] },
      { name: "Sam", telegramUserId: null, categories: [] },
    ]);
    expect(message).toContain('• <a href="tg://user?id=42">Grace</a>: Preacher and Baptism');
    expect(message).toContain("• Sam");
  });
});

describe("uploadReminderMessage", () => {
  const grace: ReminderTarget = {
    name: "Grace",
    telegramUserId: 42,
    categories: ["Preacher", "Baptism"],
  };
  const sam: ReminderTarget = { name: "Sam", telegramUserId: null, categories: ["Videos"] };

  it("tags each person with exactly what they still owe", () => {
    const message = uploadReminderMessage(service, [grace, sam]);
    expect(message).toContain('• <a href="tg://user?id=42">Grace</a>: Preacher and Baptism');
    expect(message).toContain("• Sam: Videos");
  });

  it("sends nothing when nobody owes anything", () => {
    expect(uploadReminderMessage(service, [])).toBeNull();
    expect(uploadReminderMessage(service, [{ ...grace, categories: [] }])).toBeNull();
  });

  it("leaves out people who have nothing outstanding", () => {
    const message = uploadReminderMessage(service, [grace, { ...sam, categories: [] }]);
    expect(message).not.toContain("Sam");
  });
});

describe("reminder targeting, end to end", () => {
  // Three people are assigned. Only the one who has neither uploaded nor
  // marked done should be tagged.
  const task = (profileId: string, categoryId: string, doneAt: string | null = null): Task => ({
    assignmentId: `a-${profileId}`,
    serviceId: "sunday",
    profileId,
    categoryId,
    doneAt,
  });
  const people = new Map([
    ["grace", { name: "Grace", telegramUserId: 1 }],
    ["sam", { name: "Sam", telegramUserId: 2 }],
    ["tola", { name: "Tola", telegramUserId: 3 }],
  ]);
  const categoryNames = new Map([
    ["preacher", "Preacher"],
    ["videos", "Videos"],
    ["baptism", "Baptism"],
  ]);

  const tasks = [
    task("grace", "preacher"), // uploaded, did not mark done
    task("sam", "videos", "2025-10-12T20:00:00Z"), // marked done
    task("tola", "baptism"), // nothing yet
  ];
  const uploads = [{ serviceId: "sunday", categoryId: "preacher", uploadedBy: "grace" }];

  const targets: ReminderTarget[] = outstandingByPerson(outstandingTasks(tasks, uploads)).map(
    (person) => ({
      ...(people.get(person.profileId) ?? { name: "Someone", telegramUserId: null }),
      categories: person.categoryIds.map((id) => categoryNames.get(id) ?? id),
    }),
  );

  it("tags only the person who still owes something", () => {
    const message = uploadReminderMessage(service, targets) ?? "";
    expect(message).toContain("tg://user?id=3");
    expect(message).toContain("Tola</a>: Baptism");
    expect(message).not.toContain("Grace");
    expect(message).not.toContain("Sam");
  });
});

describe("handoff messages", () => {
  const handoff = {
    categoryName: "Preacher",
    teamName: "Thumbnails",
    service,
    due: "Mon, Oct 13, 10:00 AM",
    albumUrl: "https://app.example/services/1/preacher",
    teamMembers: [{ name: "Ada", telegramUserId: 9 }],
  };

  it("tells the receiving team their category is ready, tagging its members", () => {
    const message = handoffReadyMessage(handoff);
    expect(message).toContain("<b>Preacher</b> is ready for Thumbnails");
    expect(message).toContain('<a href="tg://user?id=9">Ada</a>');
    expect(message).toContain("https://app.example/services/1/preacher");
  });

  it("falls back to the team name when nobody on it is known", () => {
    expect(handoffReadyMessage({ ...handoff, teamMembers: [] })).toContain(
      "Thumbnails team:",
    );
  });

  it("flags a late handoff that is ready by nudging the team", () => {
    const message = handoffLateMessage({ ...handoff, isReady: true });
    expect(message).toContain("<b>Late:</b> Preacher for Thumbnails");
    expect(message).toContain("Ada</a>");
  });

  it("flags a late handoff that is not ready by pointing at what is missing", () => {
    const message = handoffLateMessage({ ...handoff, isReady: false });
    expect(message).toContain("not marked ready yet");
    expect(message).toContain("https://app.example/services/1");
    expect(message).not.toContain("Ada");
  });
});

describe("escapeHtml", () => {
  it("escapes the three characters Telegram's HTML mode treats specially", () => {
    expect(escapeHtml(`a < b && c > "d"`)).toBe(`a &lt; b &amp;&amp; c &gt; "d"`);
  });
});

describe("uploadSummaryMessage", () => {
  const service = { name: "Sunday <Service>", date: "Sun, Oct 12", url: "https://app.test/services/1" };

  it("lists who uploaded what, one line each, without tagging anyone", () => {
    const message = uploadSummaryMessage(service, [
      { name: "Daniel", categoryName: "Baptism", files: "24 photos" },
      { name: "Peter", categoryName: "Preacher", files: "20 photos and 2 videos" },
    ]);
    expect(message).toBe(
      [
        "📤 Uploads for <b>Sunday &lt;Service&gt;</b>, Sun, Oct 12",
        "✅ Daniel uploaded 24 photos to Baptism",
        "✅ Peter uploaded 20 photos and 2 videos to Preacher",
        '<a href="https://app.test/services/1">Open the service</a>',
      ].join("\n"),
    );
    expect(message).not.toContain("tg://user");
  });

  it("sends nothing when nothing was uploaded", () => {
    expect(uploadSummaryMessage(service, [])).toBeNull();
  });
});

describe("messages for a photography or video group", () => {
  const service = { name: "Sunday Service", date: "Sun, Oct 12", url: "https://app.test/services/1", time: "10:00 AM" };

  it("asks the photography group for photos and the video group for videos", () => {
    expect(serviceDayMessage(service, [], "photos")).toContain("📸 <b>Today: Sunday Service</b>");
    expect(serviceDayMessage(service, [], "photos")).toContain("Upload photos here");
    expect(serviceDayMessage(service, [], "videos")).toContain("🎥 <b>Today: Sunday Service</b>");
    expect(serviceDayMessage(service, [], "videos")).toContain("Upload videos here");
    expect(serviceDayMessage(service, [])).toContain("Upload photos and videos here");
  });

  it("says which kind of upload is still owed", () => {
    const owing = [{ name: "Kofi", telegramUserId: null, categories: ["Baptism"] }];
    expect(uploadReminderMessage(service, owing, "videos")).toContain("⏰ Still to upload videos for");
    expect(uploadReminderMessage(service, owing)).toContain("⏰ Still to upload for");
  });

  it("titles the uploads list by kind", () => {
    const entries = [{ name: "Grace", categoryName: "Baptism", files: "24 photos" }];
    expect(uploadSummaryMessage(service, entries, "photos")).toContain("📸 Photos for <b>Sunday Service</b>");
    expect(uploadSummaryMessage(service, entries, "videos")).toContain("🎥 Videos for");
    expect(uploadSummaryMessage(service, entries)).toContain("📤 Uploads for");
  });
});
