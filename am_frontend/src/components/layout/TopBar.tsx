import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Moon, Sun, User, LogOut, ShieldAlert } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/useTheme";
import {
  getStoredUserIdentity,
  UserIdentity,
  ROLE_ADMIN,
  ROLE_AREA_MANAGER,
} from "@/lib/auth";

export function TopBar() {
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<UserIdentity | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get logged-in user identity
    const storedUser = getStoredUserIdentity();
    if (storedUser) {
      setCurrentUser(storedUser);
    }

    // Handle click outside search results
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Logout function
  const handleLogout = () => {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user");
    setCurrentUser(null);
    navigate("/login");
  };

  // Generate avatar initials
  const getInitials = () => {
    if (!currentUser?.name) return "?";
    const names = currentUser.name.split(" ");
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return currentUser.name.substring(0, 2).toUpperCase();
  };

  // Role display text
  const getRoleDisplay = () => {
    if (!currentUser) return "Unauthenticated";
    if (currentUser.app_role === ROLE_ADMIN) return "Administrator";
    if (currentUser.app_role === ROLE_AREA_MANAGER) {
      return `Manager (${currentUser.branch_name || "Pune"})`;
    }
    return currentUser.app_role;
  };

  // Count active SOS alerts
  const criticalCount = notifications.filter(
    (n) => n.category === "EMERGENCY_SOS"
  ).length;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card px-4 print:hidden shrink-0">
      <SidebarTrigger className="shrink-0" />

      <div className="ml-auto flex items-center gap-2">
        {/* Theme Toggle */}
        <Button variant="ghost" size="icon" onClick={toggle} className="h-9 w-9 rounded-lg hover:bg-muted/40 transition-colors">
          {isDark ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg hover:bg-muted/40 transition-colors group">
              <Bell className="h-4 w-4 text-foreground group-hover:rotate-12 transition-transform" />

              {criticalCount > 0 && (
                <>
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-status-critical text-[10px] font-bold text-white z-10 animate-pulse">
                    {criticalCount}
                  </span>
                  <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full bg-status-critical/60 animate-ping z-0" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 bg-card/95 backdrop-blur-md border border-border/60 shadow-xl rounded-xl p-1.5 z-50">
            <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
              <span>Recent Alerts</span>
              {notifications.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-critical/10 text-status-critical">
                  {notifications.length} Active
                </span>
              )}
            </div>

            <DropdownMenuSeparator className="my-1" />

            <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="px-3 py-6 text-sm text-center text-muted-foreground">
                  No active alerts.
                </div>
              ) : (
                notifications.map((notif) => (
                  <DropdownMenuItem
                    key={notif.id}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border-l-2 cursor-pointer transition-all focus:bg-muted/40 focus:text-inherit
                      ${notif.category === "EMERGENCY_SOS"
                        ? "border-status-critical bg-status-critical/5 hover:bg-status-critical/10"
                        : "border-status-warning bg-status-warning/5 hover:bg-status-warning/10"
                      }`}
                  >
                    <div className={`p-1.5 rounded-md shrink-0 mt-0.5
                      ${notif.category === "EMERGENCY_SOS"
                        ? "bg-status-critical/10 text-status-critical"
                        : "bg-status-warning/10 text-status-warning"
                      }`}
                    >
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                          {notif.category.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {notif.fact_found || "No remarks provided"}
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </div>

            <DropdownMenuSeparator className="my-1" />
            <div className="p-1">
              <Button
                variant="ghost"
                className="w-full text-center text-xs font-semibold py-1.5 h-auto text-muted-foreground hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
                onClick={() => navigate("/")}
              >
                View Command Center Alerts
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2 hover:bg-muted/40 transition-all rounded-lg flex items-center group">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent/80 text-xs font-bold text-white ring-2 ring-border/85 group-hover:ring-accent/80 transition-all">
                {getInitials()}
              </div>
              <span className="hidden sm:inline-block text-xs font-semibold text-foreground max-w-[110px] truncate">
                {currentUser?.name ? currentUser.name.split(" ")[0] : "User"}
              </span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56 bg-card/95 backdrop-blur-md border border-border/60 shadow-xl rounded-xl p-1.5 z-50">
            <div className="px-3 py-2.5 bg-muted/30 rounded-lg mb-1">
              <p className="text-sm font-semibold text-foreground truncate">
                {currentUser?.name || "Unauthenticated"}
              </p>
              <p className="text-xs text-muted-foreground font-mono-data mt-0.5 font-semibold">
                {getRoleDisplay()}
              </p>
              {currentUser?.user_id && (
                <p className="text-[10px] text-muted-foreground/70 font-mono-data mt-0.5">
                  ID: {currentUser.user_id}
                </p>
              )}
            </div>

            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuItem className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground focus:text-accent focus:bg-accent/10 cursor-pointer transition-all">
              <User className="h-4 w-4" /> Profile
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuItem
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-status-critical focus:bg-status-critical/10 focus:text-status-critical cursor-pointer transition-all font-medium"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}