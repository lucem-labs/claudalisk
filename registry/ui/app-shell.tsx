import * as React from "react"
import { NavLink } from "react-router"

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
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navigation.map((item) => (
                    <AppShellLink key={item.to} item={item} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            {header}
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function AppShellLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon
  return (
    <SidebarMenuItem>
      <NavLink to={item.to} end={item.end}>
        {({ isActive }) => (
          <SidebarMenuButton isActive={isActive} tabIndex={-1}>
            {Icon ? <Icon /> : null}
            <span>{item.label}</span>
          </SidebarMenuButton>
        )}
      </NavLink>
    </SidebarMenuItem>
  )
}

export { AppShell }
export type { NavigationItem }
