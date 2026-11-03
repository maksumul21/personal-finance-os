"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, Monitor, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/features/auth/actions";
import { updateThemeAction } from "@/features/settings/actions";
import { useComposer } from "@/features/transactions/components/composer";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { COLLAPSE_COOKIE, MOBILE_LEFT, MOBILE_RIGHT, NAV_GROUPS, NAV_ITEMS, SETTINGS_ITEM, isActive, type NavItem } from "./nav-config";

export interface ShellUser {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  devMode: boolean;
}


function initials(user: ShellUser) {
  const source = user.name?.trim() || user.email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * `autoRail`: in the sidebar, an expanded menu still shows as an icon rail below 1024px (tablets),
 * done in CSS so there is no layout jump on load. The mobile drawer never uses it.
 */
function NavLink({
  item,
  collapsed,
  autoRail = false,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  autoRail?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const base =
    "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const content = (
    <>
      <Icon className={cn("size-[18px] shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      {!collapsed && <span className={cn("min-w-0 flex-1 truncate", autoRail && "max-lg:hidden")}>{item.label}</span>}
      {!collapsed && !item.available && (
        <Badge variant="secondary" className={cn("h-5 shrink-0 px-1.5 text-[10px] font-medium text-muted-foreground", autoRail && "max-lg:hidden")}>
          Soon
        </Badge>
      )}
    </>
  );

  const node = item.available ? (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-card ring-1 ring-sidebar-border"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
        collapsed && "justify-center px-0",
        autoRail && "max-lg:justify-center max-lg:px-0",
      )}
    >
      {content}
    </Link>
  ) : (
    <span
      aria-disabled
      title={`${item.label} — coming in a later phase`}
      className={cn(
        base,
        "cursor-not-allowed text-muted-foreground/70",
        collapsed && "justify-center px-0",
        autoRail && "max-lg:justify-center max-lg:px-0",
      )}
    >
      {content}
    </span>
  );

  if (!collapsed) return node;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{node}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {!item.available && " (soon)"}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const change = (value: string) => {
    setTheme(value);
    void updateThemeAction({ theme: value.toUpperCase() as "LIGHT" | "DARK" | "SYSTEM" });
  };
  return (
    <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={change}>
      <DropdownMenuRadioItem value="light">
        <Sun /> Light
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon /> Dark
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <Monitor /> System
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

function UserMenu({ user, collapsed, autoRail = false }: { user: ShellUser; collapsed: boolean; autoRail?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-xl p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring",
            collapsed && "justify-center",
            autoRail && "max-lg:justify-center",
          )}
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback className="bg-gradient-to-br from-primary/90 to-primary/60 text-xs font-semibold text-primary-foreground">{initials(user)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className={cn("min-w-0 flex-1", autoRail && "max-lg:hidden")}>
              <span className="block truncate text-sm font-medium">{user.name || "Your account"}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        {!user.devMode && (
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavList({ collapsed, autoRail, onNavigate }: { collapsed: boolean; autoRail?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className={cn("flex flex-col", collapsed ? "gap-2" : "gap-4", autoRail && !collapsed && "max-lg:gap-2")}>
      {NAV_GROUPS.map((group, i) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          {collapsed ? (
            i > 0 && <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" aria-hidden />
          ) : (
            <>
              <p className={cn("px-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground/80 uppercase", autoRail && "max-lg:hidden")}>
                {group.label}
              </p>
              {autoRail && i > 0 && <div className="mx-auto mb-1 hidden h-px w-6 bg-sidebar-border max-lg:block" aria-hidden />}
            </>
          )}
          {group.hrefs.map((href) => {
            const item = NAV_ITEMS.find((n) => n.href === href)!;
            return <NavLink key={href} item={item} collapsed={collapsed} autoRail={autoRail} onNavigate={onNavigate} />;
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  user,
  initialCollapsed,
  children,
}: {
  user: ShellUser;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  const composer = useComposer();
  const navItem = (href: string) => NAV_ITEMS.find((i) => i.href === href)!;

  const bottomLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    const cls = cn(
      "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
      active ? "text-primary" : "text-muted-foreground",
      !item.available && "opacity-45",
    );
    const label = item.label.split(" ")[0];
    return item.available ? (
      <Link key={item.href} href={item.href} className={cls} aria-current={active ? "page" : undefined}>
        <Icon className="size-5" />
        {label}
      </Link>
    ) : (
      <span key={item.href} className={cls} aria-disabled title={`${item.label} — coming soon`}>
        <Icon className="size-5" />
        {label}
      </span>
    );
  };

  return (
    <div className="flex min-h-dvh">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-[68px] lg:w-[264px]",
        )}
      >
        <div className={cn("flex h-16 items-center px-5", collapsed ? "justify-center px-0" : "max-lg:justify-center max-lg:px-0")}>
          <Link href="/dashboard" aria-label="Finance OS home">
            <Logo collapsed={collapsed} textClassName="max-lg:hidden" />
          </Link>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-3">
          <NavList collapsed={collapsed} autoRail />
        </div>
        <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
          <NavLink item={SETTINGS_ITEM} collapsed={collapsed} autoRail />
          <UserMenu user={user} collapsed={collapsed} autoRail />
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className={cn("w-full justify-start gap-3 px-2.5 text-muted-foreground max-lg:hidden", collapsed && "justify-center px-0")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-xl md:hidden">
          <Link href="/dashboard" aria-label="Finance OS home">
            <Logo />
          </Link>
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <Menu />
          </Button>
        </header>

        {user.devMode && (
          <div className="border-b bg-warning-soft px-4 py-1.5 text-center text-xs text-foreground">
            Development mode: signed in as <span className="font-medium">{user.email}</span> without Supabase.
          </div>
        )}

        <main className="relative flex-1 pb-24 md:pb-10">
          {/* A faint brand glow behind the page header; purely decorative. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72 bg-[radial-gradient(70%_100%_at_50%_0%,var(--page-glow),transparent)]" />
          <div className="relative">{children}</div>
        </main>

        {/* Mobile bottom navigation */}
        <nav
          aria-label="Quick"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        >
          {MOBILE_LEFT.map((href) => bottomLink(navItem(href)))}
          <div className="flex h-16 items-center justify-center">
            <button
              onClick={() => composer.open()}
              aria-label="Add transaction"
              className="grid size-12 place-items-center rounded-2xl bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-raised ring-1 ring-primary/30 outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="size-6" />
            </button>
          </div>
          {MOBILE_RIGHT.map((href) => bottomLink(navItem(href)))}
          <button className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground" onClick={() => setDrawerOpen(true)}>
            <MoreHorizontal className="size-5" />
            More
          </button>
        </nav>

        {/* Mobile drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="w-[280px] gap-0 bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">All sections of Finance OS</SheetDescription>
            <div className="flex h-14 items-center px-4">
              <Logo />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <NavList collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="space-y-1 border-t px-3 py-3">
              <NavLink item={SETTINGS_ITEM} collapsed={false} onNavigate={() => setDrawerOpen(false)} />
              <UserMenu user={user} collapsed={false} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
