import { BellRing, FolderCheck, Images, UploadCloud } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Logo } from "@/components/ui/logo";

const ERRORS: Record<string, { title: string; body: string }> = {
  not_invited: {
    title: "That Google account has not been invited",
    body: "Ask a media team admin to invite the email address you signed in with, then try again.",
  },
  no_access: {
    title: "Your access has been turned off",
    body: "Ask a media team admin if you think this is a mistake.",
  },
  sign_in_failed: {
    title: "Sign-in did not finish",
    body: "Nothing was changed. Try again.",
  },
};

const FEATURES = [
  {
    icon: UploadCloud,
    title: "Upload from your phone",
    body: "Pick everything at once. It goes straight to the church Drive.",
  },
  {
    icon: FolderCheck,
    title: "Folders made for you",
    body: "Every service gets its folders, sorted by category.",
  },
  {
    icon: BellRing,
    title: "Nobody chased by hand",
    body: "Reminders and handoffs happen in the team's Telegram.",
  },
  {
    icon: Images,
    title: "Find any photo",
    body: "Search every service by category and date.",
  },
];

export function LoginView({
  errorKey,
  next,
}: {
  errorKey?: string;
  /** Where to return after signing in. */
  next?: string;
}) {
  const message = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <main className="relative flex min-h-dvh flex-1 overflow-hidden">
      {/* A soft wash of the brand blue behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_10%_0%,var(--color-primary-soft),transparent_70%)]"
      />

      <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-10 px-6 py-10 desktop:grid-cols-2 desktop:gap-16 desktop:px-10">
        <div className="stagger flex flex-col gap-8">
          <div className="flex items-center gap-3 text-title text-ink">
            <Logo size={44} />
            RCW Media
          </div>

          <div className="flex flex-col gap-4">
            <h1 className="text-hero text-ink tablet:text-[3.5rem]">
              Every service,
              <br />
              <span className="text-primary">in one place.</span>
            </h1>
            <p className="max-w-md text-body text-ink-soft">
              Where the media team uploads photos and videos, sees who is
              covering what, and hands content to the teams that need it.
            </p>
          </div>

          {message ? (
            <div role="alert" className="flex max-w-md flex-col gap-1 rounded-lg bg-danger-soft p-4">
              <p className="text-title text-danger">{message.title}</p>
              <p className="text-body-sm text-ink-soft">{message.body}</p>
            </div>
          ) : null}

          <div className="flex max-w-sm flex-col gap-3">
            <GoogleSignInButton next={next} />
            <p className="text-caption text-muted">
              Invite only. Use the Google account an admin invited.
            </p>
          </div>

          <ul className="grid max-w-xl gap-x-6 gap-y-5 tablet:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <feature.icon aria-hidden size={18} />
                </span>
                <span className="flex flex-col">
                  <span className="text-body-sm font-bold text-ink">{feature.title}</span>
                  <span className="text-caption text-muted">{feature.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* The brand panel: the logo on the blue of its own ring. Decorative. */}
        <div
          aria-hidden
          className="theme-brand relative hidden aspect-square animate-rise items-center justify-center overflow-hidden rounded-xl shadow-float desktop:flex"
        >
          <div className="absolute h-[78%] w-[78%] rounded-full border border-hairline" />
          <div className="absolute h-[94%] w-[94%] rounded-full border border-hairline-soft opacity-60" />
          <Logo size={340} className="shadow-float ring-8 ring-white/25" />
        </div>
      </div>
    </main>
  );
}
