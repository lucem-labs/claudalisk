import * as React from "react"
import { NavLink, UNSAFE_NavigationContext, useLocation, useResolvedPath } from "react-router"

import { ColorSchemeToggle } from "@/components/ui/color-scheme-toggle"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

type NavigationItem = {
  to: string
  label: string
  icon?: React.ComponentType
  end?: boolean
}

type AppShellProps = {
  title: React.ReactNode
  navigation: NavigationItem[]
  header?: React.ReactNode
  children: React.ReactNode
}

function AppShell({ title, navigation, header, children }: AppShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader className="px-4 py-3 font-heading text-base font-semibold">
            {title}
          </SidebarHeader>
          <SidebarContent>
            <nav aria-label="Main">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navigation.map((item) => (
                      <AppShellLink key={item.to} item={item} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </nav>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            {header}
            <div className="ml-auto">
              <ColorSchemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function AppShellLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon
  const isActive = useIsCurrent(item.to, item.end ?? false)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <NavLink to={item.to} end={item.end}>
          {Icon ? <Icon /> : null}
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function useIsCurrent(to: string, end: boolean) {
  const { navigator } = React.useContext(UNSAFE_NavigationContext)
  const path = useResolvedPath(to)
  const target = (navigator.encodeLocation ? navigator.encodeLocation(path).pathname : path.pathname).toLowerCase()
  const current = useLocation().pathname.toLowerCase()
  if (current === target) return true
  if (end || !current.startsWith(target)) return false
  const boundary = target !== "/" && target.endsWith("/") ? target.length - 1 : target.length
  return current.charAt(boundary) === "/"
}

export { AppShell }
export type { NavigationItem }
