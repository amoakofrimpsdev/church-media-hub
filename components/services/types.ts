import type { HandoffStage } from "@/lib/domain/deadlines";
import type { HandoffRow } from "@/lib/handoffs";

/** Everything a service page shows, already worked out. */
export type ServiceData = {
  id: string;
  name: string;
  /** "Sun, Oct 12, 2025 · 10:00 AM" */
  dateLine: string;
  /** "Today", "3 days ago" */
  relative: string;
  totalFiles: number;

  canManage: boolean;
  canUpload: boolean;
  isAdmin: boolean;
  isViewer: boolean;

  /** Null when the Drive folders are all there. */
  folderProblem: {
    message: string;
    /** Set when an admin has to fix the Google connection first. */
    connection: "connect" | "reconnect" | null;
  } | null;
  /** Link to the service's folder in Google Drive, for admins. */
  driveUrl: string | null;

  albums: Album[];
  people: AssignedPerson[];
  /** True when at least one task has nothing uploaded and is not marked done. */
  hasOutstanding: boolean;
  /** Choices for the "Assign someone" form. Null for people who cannot assign. */
  assignOptions: {
    people: { id: string; name: string }[];
    dutyRoles: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  } | null;
  handoffs: HandoffRow[];
};

export type Album = {
  categoryId: string;
  slug: string;
  name: string;
  fileCount: number;
  /** Up to three thumbnail URLs, newest first. */
  covers: string[];
  hasFolder: boolean;
  /** Where this category is being delivered, and how that is going. */
  deliveries: { teamName: string; stage: HandoffStage }[];
};

export type AssignedPerson = {
  assignmentId: string;
  name: string;
  roleName: string;
  isMe: boolean;
  tasks: {
    categoryId: string;
    categoryName: string;
    /** done: marked done. uploaded: files in, not marked. missing: nothing yet. */
    state: "done" | "uploaded" | "missing";
  }[];
};

/** One service in the services list. */
export type ServiceSummary = {
  id: string;
  name: string;
  dateLine: string;
  relative: string;
  cover: string | null;
  /** Shown as the cover when there is no photo yet: "19", "OCT", "SUN". */
  day: string;
  month: string;
  weekday: string;
  fileCount: number;
  assigned: string[];
  missing: number;
  foldersFailed: boolean;
  /** The service's region, when the person can see more than one. */
  regionName?: string | null;
};
