import type { CategoriesData } from "@/components/admin/categories-view";
import type { PeopleData } from "@/components/admin/people-view";
import type { ScheduleData } from "@/components/admin/schedule-view";
import type { SharesData } from "@/components/admin/shares-view";
import type { TeamsData } from "@/components/admin/teams-view";
import type { DashboardData } from "@/components/dashboard/types";
import type { AlbumData } from "@/components/gallery/album-view";
import type { GalleryData } from "@/components/gallery/gallery-view";
import type { GalleryItem } from "@/components/gallery/types";
import type { ServiceData, ServiceSummary } from "@/components/services/types";
import type { ShareData } from "@/components/share/share-view";
import type { ShellUpload, ShellUser } from "@/components/shell/app-shell";
import type { HandoffRow } from "@/lib/handoffs";

/**
 * Sample data for the preview pages (/preview/…), which exist only in local
 * development. They render the real screens without signing in or a database,
 * so the design can be seen and adjusted. Photos are placeholders from
 * picsum.photos; nothing here is real church data.
 */

const photo = (seed: string, size = 400) =>
  `https://picsum.photos/seed/rcw-${seed}/${size}/${size}`;

export const previewUser: ShellUser = {
  name: "Ama Owusu",
  email: "ama.owusu@example.com",
  role: "admin",
};

const handoff = (overrides: Partial<HandoffRow>): HandoffRow => ({
  id: "h1",
  serviceId: "s1",
  serviceName: "Sunday Service",
  serviceStartsAt: "2025-10-12T17:00:00Z",
  categoryName: "Preacher",
  categorySlug: "preacher",
  teamName: "Thumbnails",
  dueAt: "2025-10-13T17:00:00Z",
  stage: "ready",
  deliveredLate: false,
  receivedAt: null,
  canConfirm: true,
  ...overrides,
});

export const previewDashboard: DashboardData = {
  firstName: "Ama",
  role: "admin",
  greeting: "Good afternoon",
  today: "Wednesday, October 15",
  googleProblem: null,
  viewerWithoutTeam: false,
  canManage: true,
  canUpload: true,
  focus: {
    id: "s1",
    name: "Sunday Service",
    dateLine: "Sun, Oct 12, 2025 · 10:00 AM",
    relative: "3 days ago",
    when: "recent",
    covers: [photo("a"), photo("b"), photo("c"), photo("d")],
    fileCount: 184,
    assigned: ["Grace Mensah", "Sam Boateng", "Kofi Asante"],
    tasksDone: 2,
    tasksTotal: 4,
    missing: 1,
  },
  myTasks: [
    {
      assignmentId: "a1",
      categoryId: "c1",
      categoryName: "Fellowship",
      serviceId: "s1",
      serviceName: "Sunday Service",
      dateLine: "Sun, Oct 12, 2025",
      nothingUploaded: true,
    },
    {
      assignmentId: "a1",
      categoryId: "c2",
      categoryName: "Baptism",
      serviceId: "s1",
      serviceName: "Sunday Service",
      dateLine: "Sun, Oct 12, 2025",
      nothingUploaded: false,
    },
  ],
  handoffs: [
    handoff({ id: "h1", stage: "late", categoryName: "Videos", categorySlug: "videos", teamName: "Website" }),
    handoff({ id: "h2", stage: "ready", categoryName: "Baptism", categorySlug: "baptism", teamName: "Social Media" }),
    handoff({ id: "h3", stage: "waiting", categoryName: "Fellowship", categorySlug: "fellowship", teamName: "Social Media", canConfirm: false }),
  ],
  lateHandoffs: 1,
  recentUploads: ["e", "f", "g", "h", "i", "j", "k", "l"].map((seed, index) => ({
    id: seed,
    thumbUrl: photo(seed),
    fileName: `IMG_41${index}.jpg`,
    isVideo: index === 2,
    href: "/preview/dashboard",
    caption: ["Preacher · Grace", "Baptism · Grace", "Videos · Sam", "Fellowship · Kofi"][index % 4],
  })),
  upcoming: [
    {
      id: "s2",
      name: "Midweek Prayer",
      dateLine: "Wed, Oct 15, 2025 · 7:30 PM",
      relative: "Today",
      assigned: ["Sam Boateng"],
      missing: 0,
      foldersFailed: false,
    },
    {
      id: "s3",
      name: "Sunday Service",
      dateLine: "Sun, Oct 19, 2025 · 10:00 AM",
      relative: "In 4 days",
      assigned: ["Grace Mensah", "Sam Boateng", "Kofi Asante", "Ama Owusu", "Tola Adeyemi"],
      missing: 5,
      foldersFailed: false,
    },
    {
      id: "s4",
      name: "Baptism Sunday",
      dateLine: "Sun, Oct 26, 2025 · 10:00 AM",
      relative: "In 11 days",
      assigned: [],
      missing: 0,
      foldersFailed: false,
    },
  ],
  analytics: {
    totalFiles: 12940,
    totalBytes: 412 * 1024 ** 3,
    last30Days: 1284,
    previous30Days: 1071,
    photos: 2310,
    videos: 46,
    weekly: [
      ["Aug 24", 212], ["Aug 31", 264], ["Sep 7", 198], ["Sep 14", 305],
      ["Sep 21", 0], ["Sep 28", 341], ["Oct 5", 287], ["Oct 12", 184],
    ].map(([label, files]) => ({
      weekStart: String(label),
      label: String(label),
      files: Number(files),
    })),
    byCategory: [
      { name: "Preacher", files: 902 },
      { name: "Fellowship", files: 731 },
      { name: "Baptism", files: 512 },
      { name: "Videos", files: 46 },
    ],
    byPerson: [
      { name: "Grace Mensah", files: 1104 },
      { name: "Kofi Asante", files: 688 },
      { name: "Sam Boateng", files: 352 },
      { name: "Ama Owusu", files: 47 },
    ],
    handoffs: {
      settled: 31,
      onTime: 26,
      late: 5,
      onTimeRate: 26 / 31,
      medianHoursToDeliver: 19,
    },
  },
};

/** A brand-new workspace: nothing created, Google not connected. */
export const previewEmptyDashboard: DashboardData = {
  ...previewDashboard,
  greeting: "Good morning",
  googleProblem: "not_connected",
  focus: null,
  myTasks: [],
  handoffs: [],
  lateHandoffs: 0,
  recentUploads: [],
  upcoming: [],
  analytics: null,
};

const CATEGORIES = [
  { id: "c1", name: "Baptism" },
  { id: "c2", name: "Preacher" },
  { id: "c3", name: "Fellowship" },
  { id: "c4", name: "Videos" },
];

export const previewUpload: ShellUpload = {
  defaultServiceId: "s1",
  services: [
    { id: "s1", name: "Sunday Service", dateLine: "Sun, Oct 12", relative: "3 days ago", categories: CATEGORIES },
    { id: "s2", name: "Midweek Prayer", dateLine: "Wed, Oct 15", relative: "Today", categories: CATEGORIES },
    { id: "s3", name: "Sunday Service", dateLine: "Sun, Oct 19", relative: "In 4 days", categories: CATEGORIES },
  ],
};

// ── Part 2 screens ──────────────────────────────────────────────────────────

export const previewService: ServiceData = {
  id: "s1",
  name: "Sunday Service",
  dateLine: "Sun, Oct 12, 2025 · 10:00 AM",
  relative: "3 days ago",
  totalFiles: 184,
  canManage: true,
  canUpload: true,
  isAdmin: true,
  isViewer: false,
  folderProblem: null,
  driveUrl: "https://drive.google.com/",
  albums: [
    {
      categoryId: "c1",
      slug: "baptism",
      name: "Baptism",
      fileCount: 42,
      covers: [photo("m"), photo("n"), photo("o")],
      hasFolder: true,
      deliveries: [{ teamName: "Social Media", stage: "ready" }],
    },
    {
      categoryId: "c2",
      slug: "preacher",
      name: "Preacher",
      fileCount: 96,
      covers: [photo("p"), photo("q"), photo("r")],
      hasFolder: true,
      deliveries: [{ teamName: "Thumbnails", stage: "delivered" }],
    },
    {
      categoryId: "c3",
      slug: "fellowship",
      name: "Fellowship",
      fileCount: 0,
      covers: [],
      hasFolder: true,
      deliveries: [{ teamName: "Social Media", stage: "waiting" }],
    },
    {
      categoryId: "c4",
      slug: "videos",
      name: "Videos",
      fileCount: 46,
      covers: [photo("s"), photo("t")],
      hasFolder: true,
      deliveries: [{ teamName: "Website", stage: "late" }],
    },
  ],
  people: [
    {
      assignmentId: "a1",
      name: "Grace Mensah",
      roleName: "Photographer",
      isMe: false,
      tasks: [
        { categoryId: "c2", categoryName: "Preacher", state: "done" },
        { categoryId: "c1", categoryName: "Baptism", state: "done" },
      ],
    },
    {
      assignmentId: "a2",
      name: "Sam Boateng",
      roleName: "Videographer",
      isMe: false,
      tasks: [{ categoryId: "c4", categoryName: "Videos", state: "uploaded" }],
    },
    {
      assignmentId: "a3",
      name: "Kofi Asante",
      roleName: "Photographer",
      isMe: false,
      tasks: [{ categoryId: "c3", categoryName: "Fellowship", state: "missing" }],
    },
  ],
  hasOutstanding: true,
  assignOptions: {
    people: [
      { id: "p1", name: "Grace Mensah" },
      { id: "p2", name: "Sam Boateng" },
    ],
    dutyRoles: [
      { id: "r1", name: "Photographer" },
      { id: "r2", name: "Videographer" },
    ],
    categories: CATEGORIES,
  },
  handoffs: previewDashboard.handoffs,
};

const summary = (overrides: Partial<ServiceSummary>): ServiceSummary => ({
  id: "s1",
  name: "Sunday Service",
  dateLine: "Sun, Oct 12, 2025 · 10:00 AM",
  relative: "3 days ago",
  cover: photo("a"),
  day: "12",
  month: "OCT",
  weekday: "SUN",
  fileCount: 184,
  assigned: ["Grace Mensah", "Sam Boateng", "Kofi Asante"],
  missing: 0,
  foldersFailed: false,
  ...overrides,
});

export const previewServiceList = {
  upcoming: [
    summary({ id: "s2", name: "Midweek Prayer", dateLine: "Wed, Oct 15, 2025 · 7:30 PM", relative: "Today", cover: null, day: "15", weekday: "WED", fileCount: 0, assigned: ["Sam Boateng"] }),
    summary({ id: "s3", dateLine: "Sun, Oct 19, 2025 · 10:00 AM", relative: "In 4 days", cover: null, day: "19", fileCount: 0, missing: 5, assigned: ["Grace Mensah", "Sam Boateng", "Kofi Asante", "Ama Owusu"] }),
    summary({ id: "s4", name: "Baptism Sunday", dateLine: "Sun, Oct 26, 2025 · 10:00 AM", relative: "In 11 days", cover: null, day: "26", fileCount: 0, assigned: [] }),
  ],
  past: [
    summary({ missing: 1 }),
    summary({ id: "s5", name: "Midweek Prayer", dateLine: "Wed, Oct 8, 2025 · 7:30 PM", relative: "7 days ago", cover: photo("u"), fileCount: 38, assigned: ["Sam Boateng"] }),
    summary({ id: "s6", dateLine: "Sun, Oct 5, 2025 · 10:00 AM", relative: "10 days ago", cover: photo("v"), fileCount: 287 }),
    summary({ id: "s7", name: "Youth Night", dateLine: "Fri, Oct 3, 2025 · 7:00 PM", relative: "12 days ago", cover: photo("w"), fileCount: 121, assigned: ["Kofi Asante"] }),
    summary({ id: "s8", dateLine: "Sun, Sep 28, 2025 · 10:00 AM", relative: "17 days ago", cover: photo("x"), fileCount: 341 }),
  ],
};

const galleryItems: GalleryItem[] = Array.from({ length: 23 }, (_, index) => ({
  id: `g${index}`,
  fileName: `IMG_${4100 + index}.jpg`,
  isVideo: index % 7 === 3,
  sizeBytes: (index % 7 === 3 ? 180 : 6) * 1024 * 1024,
  caption: "Preacher · Sunday Service · Sun, Oct 12, 2025",
  uploadedBy: "Grace Mensah",
  urls: {
    small: photo(`g${index}`),
    large: photo(`g${index}`, 1200),
    download: "#",
    view: "#",
  },
}));

export const previewAlbum: AlbumData = {
  serviceId: "s1",
  serviceName: "Sunday Service",
  categoryId: "c2",
  categoryName: "Preacher",
  dateLine: "Sun, Oct 12, 2025",
  items: galleryItems,
  canUpload: true,
  canDelete: true,
  canShare: true,
};

export const previewGallery: GalleryData = {
  filters: { categoryId: "c2", serviceId: null, from: null, to: null, page: 1 },
  categories: CATEGORIES,
  services: [
    { id: "s1", label: "Sun, Oct 12, 2025 · Sunday Service" },
    { id: "s5", label: "Wed, Oct 8, 2025 · Midweek Prayer" },
  ],
  items: galleryItems,
  hasNextPage: true,
  canDelete: true,
  canShare: true,
};

// ── Admin screens ───────────────────────────────────────────────────────────

const TEAMS = [
  { id: "t2", name: "Thumbnails" },
  { id: "t3", name: "Social Media" },
  { id: "t4", name: "Website" },
];

export const previewCategories: CategoriesData = {
  hasReceivingTeams: true,
  categories: [
    { id: "c1", name: "Baptism", isActive: true, deliveries: [{ teamId: "t3", teamName: "Social Media", deadlineHours: 48 }], availableTeams: [TEAMS[0], TEAMS[2]] },
    { id: "c2", name: "Preacher", isActive: true, deliveries: [{ teamId: "t2", teamName: "Thumbnails", deadlineHours: 24 }, { teamId: "t4", teamName: "Website", deadlineHours: 72 }], availableTeams: [TEAMS[1]] },
    { id: "c3", name: "Fellowship", isActive: true, deliveries: [{ teamId: "t3", teamName: "Social Media", deadlineHours: 48 }], availableTeams: [TEAMS[0], TEAMS[2]] },
    { id: "c4", name: "Videos", isActive: true, deliveries: [{ teamId: "t4", teamName: "Website", deadlineHours: 72 }], availableTeams: [TEAMS[0], TEAMS[1]] },
    { id: "c5", name: "Worship", isActive: true, deliveries: [], availableTeams: TEAMS },
    { id: "c6", name: "Kids Church", isActive: false, deliveries: [], availableTeams: TEAMS },
  ],
};

const person = (id: string, name: string) => ({ id, name });
const ALL_PEOPLE = [
  person("p1", "Ama Owusu"),
  person("p2", "Grace Mensah"),
  person("p3", "Sam Boateng"),
  person("p4", "Kofi Asante"),
  person("p5", "Tola Adeyemi"),
  person("p6", "Ada Nwosu"),
];

export const previewTeams: TeamsData = {
  teams: [
    { id: "t1", name: "Media", kind: "media", members: ALL_PEOPLE.slice(0, 4), candidates: ALL_PEOPLE.slice(4), receives: [] },
    { id: "t2", name: "Thumbnails", kind: "receiving", members: [ALL_PEOPLE[4]], candidates: ALL_PEOPLE.slice(0, 4), receives: ["Preacher"] },
    { id: "t3", name: "Social Media", kind: "receiving", members: [ALL_PEOPLE[5], ALL_PEOPLE[3]], candidates: ALL_PEOPLE.slice(0, 3), receives: ["Baptism", "Fellowship"] },
    { id: "t4", name: "Website", kind: "receiving", members: [], candidates: ALL_PEOPLE, receives: [] },
  ],
};

export const previewPeople: PeopleData = {
  teams: [],
  invites: [
    { email: "new.volunteer@example.com", role: "member", teamName: "Media" },
    { email: "pastor.james@example.com", role: "viewer", teamName: "Website" },
  ],
  people: [
    { id: "p1", name: "Ama Owusu", email: "ama.owusu@example.com", role: "admin", active: true, isSelf: true, teams: ["Media"], telegramLinked: true },
    { id: "p2", name: "Grace Mensah", email: "grace.mensah@example.com", role: "member", active: true, isSelf: false, teams: ["Media"], telegramLinked: true },
    { id: "p3", name: "Sam Boateng", email: "sam.boateng@example.com", role: "member", active: true, isSelf: false, teams: ["Media"], telegramLinked: false },
    { id: "p4", name: "Kofi Asante", email: "kofi.asante@example.com", role: "member", active: true, isSelf: false, teams: ["Media", "Social Media"], telegramLinked: true },
    { id: "p5", name: "Tola Adeyemi", email: "tola.adeyemi@example.com", role: "viewer", active: true, isSelf: false, teams: ["Thumbnails"], telegramLinked: false },
    { id: "p6", name: "Ada Nwosu", email: "ada.nwosu@example.com", role: "viewer", active: true, isSelf: false, teams: [], telegramLinked: false },
    { id: "p7", name: "Yaw Darko", email: "yaw.darko@example.com", role: "member", active: false, isSelf: false, teams: [], telegramLinked: false },
  ],
};

export const previewSchedule: ScheduleData = {
  regions: [{ id: "g1", name: "Main" }],
  series: [
    { id: "r1", name: "Sunday Service", weekday: 0, timeLabel: "10:00 AM", repeatLabel: "Every Sunday", startLabel: null, active: true, regionName: null },
    { id: "r2", name: "Women's Midweek", weekday: 3, timeLabel: "7:30 PM", repeatLabel: "Every other Wednesday", startLabel: "from Wed, Oct 15", active: true, regionName: null },
    { id: "r4", name: "Men's Midweek", weekday: 3, timeLabel: "7:30 PM", repeatLabel: "Every other Wednesday", startLabel: "from Wed, Oct 22", active: true, regionName: null },
    { id: "r3", name: "Youth Night", weekday: 5, timeLabel: "7:00 PM", repeatLabel: "Every Friday", startLabel: null, active: false, regionName: null },
  ],
  jobs: {
    lastRanLabel: "Wed, Oct 15, 12:15 PM",
    stale: false,
    lastResult: {
      servicesCreated: 1,
      foldersFixed: 0,
      servicesAnnounced: 1,
      reminders: 1,
      readyNotices: 0,
      lateNotices: 1,
      telegramLinked: true,
      driveAccessRemoved: 0,
      uploadsClosed: 0,
      failed: [],
    },
  },
};

// ── Share links ─────────────────────────────────────────────────────────────

export const previewShares: SharesData = {
  links: [
    { id: "l1", label: "Pastor James", covers: "Every Baptism album", url: "https://example.com/s/abc", status: "active", expiry: "Expires in 26 days", allowDownload: true, viewCount: 7, lastViewed: "Wed, Oct 15, 9:40 AM", createdBy: "Ama Owusu" },
    { id: "l2", label: "Elder Mary (anniversary)", covers: "Everything from Sunday Service, Sun, Oct 12, 2025", url: "https://example.com/s/def", status: "active", expiry: "Expires in 3 days", allowDownload: true, viewCount: 0, lastViewed: null, createdBy: "Ama Owusu" },
    { id: "l3", label: "Church office screen", covers: "The whole gallery", url: "https://example.com/s/ghi", status: "active", expiry: "Never expires", allowDownload: false, viewCount: 112, lastViewed: "Wed, Oct 15, 11:02 AM", createdBy: "Ama Owusu" },
    { id: "l4", label: "Visiting speaker", covers: "Preacher from Sunday Service, Sun, Sep 28, 2025", url: "https://example.com/s/jkl", status: "expired", expiry: "Expired", allowDownload: true, viewCount: 4, lastViewed: "Tue, Sep 30, 4:15 PM", createdBy: "Ama Owusu" },
  ],
};

export const previewShare: ShareData = {
  token: "preview",
  title: "Baptism",
  subtitle: "From every service",
  totalFiles: 148,
  allowDownload: true,
  categories: [],
  activeCategory: null,
  items: galleryItems.map((item) => ({ ...item, caption: "Baptism · Sunday Service · Sun, Oct 12, 2025", uploadedBy: null })),
  page: 1,
  hasNextPage: true,
};
