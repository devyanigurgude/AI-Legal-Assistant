import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  SidebarProvider,
  SidebarTrigger,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { Scale, FileText, Shield, MessageSquare, BarChart3, LogOut, LayoutDashboard, Home, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Contracts", url: "/dashboard/contracts", icon: FileText },
  { title: "Risk Analysis", url: "/dashboard/analysis", icon: Shield },
  { title: "AI Chat", url: "/dashboard/chat", icon: MessageSquare },
  { title: "Reports", url: "/dashboard/reports", icon: BarChart3 },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Brand */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
          <Scale className="h-6 w-6 text-sidebar-primary shrink-0" />
          {!collapsed && <span className="font-display text-lg text-sidebar-accent-foreground">LegalAI</span>}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard" || item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <div className="mb-2 px-1">
            <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{user.name || user.email}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
          </div>
        )}
        <Button variant="ghost" size={collapsed ? "icon" : "default"} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DashboardLayout() {
  const { user } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          {/* Top bar */}
          <header className="h-14 flex items-center border-b bg-card px-4 gap-3">
            <SidebarTrigger />
            <div className="flex-1" />
            {user ? (
              <div className="hidden items-center gap-2 rounded-lg border bg-background/70 px-3 py-1.5 shadow-card backdrop-blur sm:flex">
                <User className="h-4 w-4 text-primary" />
                <div className="leading-tight">
                  <div className="text-[11px] text-muted-foreground">Signed in as</div>
                  <div className="text-sm font-medium text-foreground">{user.name || user.email}</div>
                </div>
              </div>
            ) : null}
          </header>

          {/* Content */}
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
