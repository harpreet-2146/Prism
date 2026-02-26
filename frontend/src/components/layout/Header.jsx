// frontend/src/components/layout/Header.jsx
// Removed: Documents nav link (now in sidebar), sidebarOpen/setSidebarOpen props
// Kept: logo (links to /chat), user dropdown with settings + logout

import { LogOut, Settings as SettingsIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { Button } from '@components/ui/button';
import { Avatar, AvatarFallback } from '@components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getUserInitials = () => {
    if (!user?.name) return 'U';
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <header className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-slate-800/60 bg-slate-950 px-4">
      {/* Logo — stays visible, links home */}
      <Link to="/chat" className="flex items-center gap-2.5">
        <img
          src="/assets/logo.webp"
          alt="PRISM"
          className="h-7 w-7 rounded-lg object-contain"
          onError={e => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextSibling.style.display = 'flex';
          }}
        />
        {/* Fallback badge if logo not found */}
        <div className="hidden h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 items-center justify-center flex-shrink-0">
          <span className="text-[11px] font-bold text-white">P</span>
        </div>
        <span className="text-sm font-semibold text-white tracking-tight">PRISM</span>
      </Link>

      {/* Right: user menu only */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-slate-800">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-slate-700 text-slate-200 text-xs font-semibold">
                {getUserInitials()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-slate-900 border-slate-700 text-slate-200">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-slate-100">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-800" />
          <DropdownMenuItem asChild className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800">
            <Link to="/settings">
              <SettingsIcon className="mr-2 h-4 w-4 text-slate-400" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-slate-800" />
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer text-red-400 hover:bg-slate-800 focus:bg-slate-800 hover:text-red-300"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}