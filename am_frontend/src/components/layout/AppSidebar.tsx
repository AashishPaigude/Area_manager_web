import { LayoutDashboard, UserCheck, Navigation, CalendarCheck, Route, Sliders, BarChart2, ClipboardList, CheckSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getStoredUserIdentity, ROLE_AREA_MANAGER } from "@/lib/auth";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const allNavItems = [
  { title: "Dashboard",            url: "/dashboard",              icon: LayoutDashboard },
  { title: "Live GPS",             url: "/live-tracking",          icon: Navigation },
  { title: "Reports",              url: "/reports",                icon: CalendarCheck },
  { title: "Track History",        url: "/routes",                 icon: Route },
  { title: "Track History Control", url: "/tracking-control",      icon: Sliders },
  { title: "Attendance",           url: "/attendance",             icon: UserCheck },
  { title: "Plan Visits",          url: "/visit-planning/plan",    icon: ClipboardList },
  { title: "Planned Visits",       url: "/visit-planning/planned", icon: CheckSquare },
  { title: "Analytics",            url: "/analytics",              icon: BarChart2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const currentUser = getStoredUserIdentity();
  const isAreaManager = currentUser?.app_role === ROLE_AREA_MANAGER;

  const visibleNavItems = allNavItems.filter(
    (item) => !(isAreaManager && item.adminOnly)
  );

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader className={cn("h-16 shrink-0 border-b border-sidebar-border p-0 flex flex-row items-center", collapsed ? "justify-center px-1" : "px-3.5")}>
        <div className={cn("flex items-center gap-3", collapsed ? "justify-center" : "")}>
          <img
            src="/vigilo_logo.png"
            alt="Vigilo M"
            className={cn(
              "rounded-xl object-contain shrink-0 shadow-md border border-sidebar-border/80 dark:border-cyan-500/30 dark:shadow-[0_0_15px_rgba(6,182,212,0.25)] transition-all duration-200",
              collapsed ? "h-9 w-9" : "h-12 w-12"
            )}
          />
          {!collapsed && (
            <div className="flex flex-col min-w-0 justify-center">
              <span className="text-base font-black tracking-widest uppercase text-sidebar-foreground dark:text-white leading-tight">
                VIGILO
              </span>
              <span className="text-[10px] uppercase tracking-wider font-bold text-cyan-600 dark:text-cyan-400 leading-tight mt-0.5">
                Manager
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className={cn("px-2 overflow-hidden", collapsed && "px-0")}>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-3 mt-2">
            Field Officer Monitoring
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="mt-1">
              {visibleNavItems.map((item) => {
                const isItemActive =
                  location.pathname === item.url ||
                  (item.url === "/reports" && (location.pathname === "/visits" || location.pathname.startsWith("/reports")));

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive}
                      tooltip={item.title}
                      className="w-full p-0 h-auto hover:bg-transparent data-[active=true]:bg-transparent"
                    >
                      <NavLink
                        to={item.url}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all duration-200 w-full group/nav-link",
                          collapsed && "justify-center px-0",
                          isItemActive && "!text-accent font-semibold"
                        )}
                      >
                        <item.icon className="h-4.5 w-4.5 shrink-0 group-hover/nav-link:text-foreground transition-all duration-200" />
                        {!collapsed && <span className="text-sm tracking-wide">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
