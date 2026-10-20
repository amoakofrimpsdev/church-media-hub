import { describe, expect, it } from "vitest";
import { parseEmailList } from "@/lib/domain/roles";

describe("pasting many email addresses", () => {
  it("takes one per line, or separated by commas, semicolons or spaces", () => {
    expect(
      parseEmailList("ama@gmail.com\nKofi@Gmail.com, grace@yahoo.com; sam@gmail.com  tola@gmail.com"),
    ).toEqual({
      emails: ["ama@gmail.com", "kofi@gmail.com", "grace@yahoo.com", "sam@gmail.com", "tola@gmail.com"],
      invalid: [],
    });
  });

  it("accepts addresses copied from an email app, with names", () => {
    expect(parseEmailList("Ama Owusu <ama@gmail.com>, Kofi Asante <kofi@gmail.com>").emails).toEqual([
      "ama@gmail.com",
      "kofi@gmail.com",
    ]);
  });

  it("drops repeats and reports what is not an address", () => {
    expect(parseEmailList("ama@gmail.com AMA@gmail.com not-an-email mailto:sam@gmail.com")).toEqual({
      emails: ["ama@gmail.com", "sam@gmail.com"],
      invalid: ["not-an-email"],
    });
  });

  it("is empty for nothing", () => {
    expect(parseEmailList("  \n ")).toEqual({ emails: [], invalid: [] });
    expect(parseEmailList(null)).toEqual({ emails: [], invalid: [] });
  });
});
