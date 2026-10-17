"use client";

import { LogOut, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  UploadButton,
  UploadProvider,
  useUpload,
  type UploadService,
} from "@/components/upload/upload-provider";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/domain/permissions";
import { ROLE_LABELS } from "@/lib/domain/roles";
import { adminNavFor, isActive, MAIN_NAV, type NavLink } from "@/lib/nav";
import { NavIcon } from "./nav-icon";

export type ShellUser = {
  name: string;
  email: string;
  role: Role;
  /** Runs at least one region (always true for overall admins). */
  manages?: boolean;
};

/**
 * The frame around every signed-in page.
 *
 * Desktop: a sidebar with every section one click away.
 * Phone: a slim top bar and a thumb-reach tab bar; "More" opens the rest.
 */
/** What the upload sheet offers. Null for people who cannot upload. */
export type ShellUpload = {
  services: UploadService[];
  defaultServiceId: string | null;
  /** Used by preview pages to show the sheet open. */
  initiallyOpen?: boolean;
};

export function AppShell({
  user,
  upload,
  children,
  currentPath,
}: {
  user: ShellUser;
  upload: ShellUpload | null;
  children: ReactNode;
  /** Overrides the real path. Used by preview pages. */
  currentPath?: string;
}) {
  const frame = (
    <ShellFrame user={user} currentPath={currentPath}>
      {children}
    </ShellFrame>
  );
  if (!upload) return frame;
  return (
    <UploadProvider
      services={upload.services}
      defaultServiceId={upload.defaultServiceId}
      canCreateService={user.role === "admin" || user.manages === true}
      initiallyOpen={upload.initiallyOpen}
    >
      {frame}
    </UploadProvider>
  );
}

function ShellFrame({
  user,
  children,
  currentPath,
}: {
  user: ShellUser;
  children: ReactNode;
  currentPath?: string;
}) {
  const realPath = usePathname();
  const pathname = currentPath ?? realPath;
  const adminNav = adminNavFor(user.role, user.manages);

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-hairline-soft bg-canvas p-4 desktop:flex">
        <Brand />
        {/* Renders nothing for people who cannot upload. */}
        <UploadButton className="w-full" />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {MAIN_NAV.map((link) => (
            <SidebarLink key={link.href} link={link} active={isActive(pathname, link.href)} />
          ))}
        </nav>
        {adminNav.length > 0 ? (
          <nav aria-label="Admin" className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-label text-muted-soft uppercase">Admin</p>
            {adminNav.map((link) => (
              <SidebarLink key={link.href} link={link} active={isActive(pathname, link.href)} />
            ))}
          </nav>
        ) : null}
        <div className="mt-auto flex flex-col gap-2">
          <ThemeToggle />
          <UserChip user={user} />
          <SignOutButton className="justify-start px-3" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-hairline-soft bg-canvas/85 px-4 backdrop-blur desktop:hidden">
          <Brand />
          <Avatar name={user.name} />
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-5 pb-28 tablet:px-8 tablet:pt-8 desktop:pb-12">
          {children}
        </main>

        <MobileTabs pathname={pathname} adminNav={adminNav} user={user} />
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-1 text-title text-ink">
      <Logo size={36} />
      RCW Media
    </Link>
  );
}

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-md px-3 text-body-sm transition-colors",
        active
          ? "bg-surface-strong font-bold text-ink"
          : "text-muted hover:bg-surface hover:text-ink",
      )}
    >
      <NavIcon name={link.icon} size={18} className={active ? "text-primary" : undefined} />
      {link.label}
    </Link>
  );
}

function UserChip({ user }: { user: ShellUser }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface p-3">
      <Avatar name={user.name} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-body-sm font-bold text-ink">{user.name}</span>
        <span className="truncate text-caption text-muted">{ROLE_LABELS[user.role]}</span>
      </div>
    </div>
  );
}

function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className={cn(
          "flex h-10 w-full items-center gap-3 rounded-md text-body-sm text-muted transition-colors hover:bg-surface hover:text-ink",
          className,
        )}
      >
        <LogOut aria-hidden size={18} />
        Sign out
      </button>
    </form>
  );
}

function MobileTabs({
  pathname,
  adminNav,
  user,
}: {
  pathname: string;
  adminNav: NavLink[];
  user: ShellUser;
}) {
  const upload = useUpload();
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);

  // Four slots beside "More". People who can upload get the Upload button in
  // the middle, so Handoffs moves into More for them.
  const tabs = upload ? MAIN_NAV.filter((link) => link.href !== "/handoffs") : MAIN_NAV;
  const overflow = upload ? MAIN_NAV.filter((link) => link.href === "/handoffs") : [];
  const moreLinks = [...overflow, ...adminNav];
  const moreActive = moreLinks.some((link) => isActive(pathname, link.href));
  const middle = Math.ceil(tabs.length / 2);

  useEffect(() => {
    const dialog = sheet.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const tab = (link: NavLink) => {
    const active = isActive(pathname, link.href);
    return (
      <li key={link.href} className="flex-1">
        <Link
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-bold transition-colors",
            active ? "text-ink" : "text-muted-soft",
          )}
        >
          <NavIcon
            name={link.icon}
            size={22}
            className={cn("transition-transform", active && "scale-110 text-primary")}
          />
          {link.label}
        </Link>
      </li>
    );
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline-soft bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur desktop:hidden"
      >
        <ul className="flex items-center">
          {tabs.slice(0, upload ? middle : tabs.length).map(tab)}
          {upload ? (
            <li className="flex flex-1 justify-center">
              <button
                type="button"
                onClick={() => upload.open()}
                aria-label="Upload"
                className="flex h-13 w-13 -translate-y-2 items-center justify-center rounded-full bg-primary text-on-primary shadow-float transition-transform active:scale-95"
              >
                <Plus aria-hidden size={26} strokeWidth={2.5} />
              </button>
            </li>
          ) : null}
          {upload ? tabs.slice(middle).map(tab) : null}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                "flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-bold",
                moreActive ? "text-ink" : "text-muted-soft",
              )}
            >
              <Menu aria-hidden size={22} className={moreActive ? "text-primary" : undefined} />
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Bottom sheet with everything that does not fit in the tab bar. */}
      <dialog
        ref={sheet}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A tap on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) setOpen(false);
        }}
        aria-label="More"
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-xl border-0 bg-surface p-0 text-ink backdrop:bg-scrim/60 desktop:hidden"
      >
        <div className="flex flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <UserChip user={user} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-strong"
            >
              <X aria-hidden size={18} />
            </button>
          </div>
          {overflow.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2">
              {overflow.map((link) => (
                <SheetLink
                  key={link.href}
                  link={link}
                  active={isActive(pathname, link.href)}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </ul>
          ) : null}
          {adminNav.length > 0 ? (
            <nav aria-label="Admin" className="flex flex-col gap-1">
              <p className="px-3 pb-1 text-label text-muted-soft uppercase">Admin</p>
              <ul className="grid grid-cols-2 gap-2">
                {adminNav.map((link) => (
                  <SheetLink
                    key={link.href}
                    link={link}
                    active={isActive(pathname, link.href)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
            </nav>
          ) : null}
          <ThemeToggle />
          <SignOutButton className="justify-center bg-surface-soft" />
        </div>
      </dialog>
    </>
  );
}

function SheetLink({
  link,
  active,
  onNavigate,
}: {
  link: NavLink;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={link.href}
        onClick={onNavigate}
        className={cn(
          "flex h-12 items-center gap-3 rounded-md bg-surface-soft px-3 text-body-sm font-bold",
          active ? "text-primary" : "text-ink",
        )}
      >
        <NavIcon name={link.icon} size={18} />
        {link.label}
      </Link>
    </li>
  );
}
