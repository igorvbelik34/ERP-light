"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Building2 } from "lucide-react";

export function Header() {
  const { user, signOut } = useAuth();
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "";
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Load company logo
  useEffect(() => {
    async function loadCompanySettings() {
      if (!user) return;

      try {
        const supabase = createClient();
        
        // Get the first company settings record
        const { data, error } = await supabase
          .from("company_settings")
          .select("logo_url, company_name")
          .limit(1)
          .single();

        if (error) {
          console.log("No company settings found:", error.message);
          return;
        }

        if (data) {
          setCompanyLogo(data.logo_url);
          setCompanyName(data.company_name);
        }
      } catch (err) {
        console.error("Error loading company settings:", err);
      }
    }

    loadCompanySettings();
  }, [user]);

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-4">
        {/* Company Logo */}
        {companyLogo ? (
          <div className="flex items-center gap-3 mr-2">
            <Image
              src={companyLogo}
              alt={companyName || "Company logo"}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-cover border"
              unoptimized
            />
            {companyName && (
              <span className="text-sm font-medium text-muted-foreground hidden sm:inline">
                {companyName}
              </span>
            )}
          </div>
        ) : (
          <div className="h-10 w-10 rounded-lg border bg-muted flex items-center justify-center mr-2 hidden sm:flex">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        
        <h1 className="text-lg font-semibold text-foreground">
          Welcome back{userName ? `, ${userName.split(" ")[0]}` : ""}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={userAvatar || undefined}
                    alt={userName || "User avatar"}
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {userName}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
