"use client";

import Link from "next/link";
import { Coffee, LayoutGrid, List, LogOut, Settings } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DONATE_URL } from "@/lib/utils/donate-banner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useViewMode, type ViewMode } from "./view-mode";
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
import { signOutAction } from "@/lib/actions/auth";

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

export function UserMenu({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string;
}) {
  const queryClient = useQueryClient();
  const { view, setView } = useViewMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="User menu"
          className="rounded-full outline-none ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Avatar>
            <AvatarImage src={image} alt={name || "User"} />
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate">
          {name || "User"}
        </DropdownMenuLabel>
        <div className="truncate px-2 pb-1.5 text-xs text-muted-foreground">
          {email}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
            <Coffee />
            Donate
          </a>
        </DropdownMenuItem>
        {/* How the applications are laid out. It used to be a segmented control in
            the toolbar; the choice belongs with the account's other preferences,
            and the toolbar gets the width back. */}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="pb-0 text-xs font-normal text-muted-foreground">
          View
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={view}
          onValueChange={(next) => setView(next as ViewMode)}
        >
          <DropdownMenuRadioItem value="board">
            <LayoutGrid className="mr-2 h-4 w-4" />
            Board
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="list">
            <List className="mr-2 h-4 w-4" />
            List
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* Hidden form; the menu button submits it via the form attribute. */}
        <form id="sign-out-form" action={signOutAction} hidden />
        <DropdownMenuItem asChild>
          <button
            type="submit"
            form="sign-out-form"
            className="w-full"
            onClick={() => queryClient.clear()}
          >
            <LogOut />
            Sign out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
