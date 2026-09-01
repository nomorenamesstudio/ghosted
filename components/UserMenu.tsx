"use client";

import Link from "next/link";
import { Coffee, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DONATE_URL } from "@/lib/utils/donate-banner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/actions/auth";
import { useTheme } from "./theme-provider";

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
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();

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
        <DropdownMenuItem onSelect={toggleTheme}>
          {theme === "dark" ? <Sun /> : <Moon />}
          {theme === "dark" ? "Light mode" : "Night mode"}
        </DropdownMenuItem>
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
