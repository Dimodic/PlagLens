import { Link, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Menu,
  User as UserIcon,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/components/ui/utils';
import { Button } from '@/components/ui/button';
import { HeaderSearch } from './HeaderSearch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/auth/useAuth';
import { userSecondaryLabel } from '@/auth/userIdentity';
import { initials } from '@/utils/initials';
import { useTranslation } from '@/i18n';
import { NotificationsBellDropdown } from '@/components/notifications/NotificationsBellDropdown';
import { Wordmark } from './Wordmark';

interface HeaderProps {
  onOpenMobileNav?: () => void;
}

export function Header({ onOpenMobileNav }: HeaderProps) {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const isDark = (resolvedTheme ?? theme) === 'dark';

  const onLogout = async () => {
    try { await logout(); } finally { navigate('/login'); }
  };

  // The avatar dropdown carries quick theme + language toggles (right below
  // Profile). The Profile page's "Предпочтения" still owns the canonical
  // locale + notification-channel settings.

  const displayName = user?.display_name || user?.email || 'User';

  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-background/95 px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      {onOpenMobileNav && (
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenMobileNav}
          aria-label={t('shell.open_menu')}
          data-testid="header-mobile-menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {/* Wordmark is the global «home» affordance. When the sidebar is
        * present on desktop, the rail owns the wordmark — header hides
        * it to avoid two side-by-side plaglens marks. When there's no
        * sidebar (MonoShell pages, students after the workspace-role
        * hide), the header is the only place to put it, and clicking
        * it takes the user to / → role-based HomeRedirect. The
        * `onOpenMobileNav` prop being set is the signal that a sidebar
        * exists on this layout. */}
      <div className={onOpenMobileNav ? 'md:hidden' : ''}>
        <Wordmark variant="full" data-testid="wordmark-header" />
      </div>

      {/* Inline search — centered in the bar; results drop down right under
        * the field (no dimmed modal). Absolute so the wider actions cluster on
        * the right doesn't pull it sideways. */}
      <div className="pointer-events-none absolute inset-x-0 hidden md:flex justify-center px-4">
        <HeaderSearch />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <NotificationsBellDropdown />
        {/* Hidden link preserves the `header-notifications` testid for older
          * smoke scripts that still navigate via it; the visible UI is now the
          * bell dropdown above. */}
        <Link to="/notifications" data-testid="header-notifications" className="sr-only">
          {t('shell.notifications')}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="gap-2 px-2"
              data-testid="header-user-menu-trigger"
            >
              <Avatar className="h-7 w-7">
                {user?.avatar_url && (
                  <AvatarImage src={user.avatar_url} alt={displayName} />
                )}
                <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-sm">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Name already sits in the trigger right above — the label only
              * carries the secondary (handle / email) to avoid showing the
              * name twice. Falls back to the name when there's no secondary. */}
            <DropdownMenuLabel className="font-normal">
              <span
                data-testid="header-user-email"
                className="block text-xs text-muted-foreground truncate"
              >
                {userSecondaryLabel(user) ?? displayName}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem asChild data-testid="header-user-menu-profile">
              <Link to="/me/profile" className="cursor-pointer">
                <UserIcon className="mr-2 h-4 w-4" />
                {t('user_menu.profile')}
              </Link>
            </DropdownMenuItem>
            {/* Theme + language as two segmented toggles. Plain div (not a
              * DropdownMenuItem) so a click flips the setting without closing
              * the menu. */}
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex flex-1 rounded-md border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  aria-label={t('user_menu.theme_light')}
                  data-testid="header-theme-light"
                  className={cn(
                    'flex flex-1 items-center justify-center rounded-[5px] py-1 transition-colors',
                    !isDark
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Sun className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  aria-label={t('user_menu.theme_dark')}
                  data-testid="header-theme-dark"
                  className={cn(
                    'flex flex-1 items-center justify-center rounded-[5px] py-1 transition-colors',
                    isDark
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Moon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-1 rounded-md border border-border p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setLocale('ru')}
                  data-testid="header-lang-ru"
                  className={cn(
                    'flex flex-1 items-center justify-center rounded-[5px] py-1 transition-colors',
                    locale === 'ru'
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  RU
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('en')}
                  data-testid="header-lang-en"
                  className={cn(
                    'flex flex-1 items-center justify-center rounded-[5px] py-1 transition-colors',
                    locale === 'en'
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  EN
                </button>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              data-testid="header-user-menu-logout"
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('user_menu.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
