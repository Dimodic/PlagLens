import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  Globe,
  LogOut,
  Menu,
  Search,
  User as UserIcon,
  Settings,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/auth/useAuth';
import { useTranslation } from '@/i18n';
import { useUpdateMe } from '@/hooks/api/useUsers';
import type { Locale } from '@/i18n';
import { NotificationsBellDropdown } from '@/components/notifications/NotificationsBellDropdown';
import { Wordmark } from './Wordmark';

interface HeaderProps {
  onOpenSearch?: () => void;
  onOpenMobileNav?: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function Header({ onOpenSearch, onOpenMobileNav }: HeaderProps) {
  const { user, logout, reloadMe } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const updateMe = useUpdateMe();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const onLogout = async () => {
    try { await logout(); } finally { navigate('/login'); }
  };

  // Locale: flip the UI immediately for snappy feedback, then persist on the
  // server so the choice survives the next login. We swallow the persistence
  // error — the UI already switched, the worst case is a re-pick after login.
  const onLocaleChange = async (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    try {
      await updateMe.mutateAsync({ locale: next });
      await reloadMe();
    } catch {
      /* non-fatal — locale was applied locally */
    }
  };

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
          aria-label="Открыть меню"
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

      {/* Search bar — absolutely centered to the viewport. Using absolute
        * positioning so it doesn't get pulled sideways by the (wider) actions
        * cluster on the right. */}
      <div className="pointer-events-none absolute inset-x-0 hidden md:flex justify-center">
        <button
          type="button"
          onClick={onOpenSearch}
          data-testid="header-search-button"
          className="group pointer-events-auto relative flex h-9 w-full max-w-md items-center"
          aria-label={t('shell.search_placeholder')}
        >
          <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('shell.search_placeholder')}
            className="pointer-events-none pl-10 pr-14 rounded-full bg-input-background border-transparent group-hover:border-border"
            readOnly
            tabIndex={-1}
          />
          <kbd className="absolute right-3 hidden h-5 select-none items-center gap-1 rounded-full border bg-background px-2 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>

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
                <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:inline text-sm">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{displayName}</span>
                <span data-testid="header-user-email" className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild data-testid="header-user-menu-profile">
              <Link to="/me/profile" className="cursor-pointer">
                <UserIcon className="mr-2 h-4 w-4" />
                {t('user_menu.profile')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild data-testid="header-user-menu-settings">
              <Link to="/me/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                {t('user_menu.preferences')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="header-user-menu-locale">
                <Globe className="mr-2 h-4 w-4" />
                {locale === 'ru' ? 'Язык · Русский' : 'Language · English'}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => onLocaleChange('ru')}
                  data-testid="header-user-menu-locale-ru"
                >
                  {locale === 'ru' && <Check className="mr-2 h-4 w-4" />}
                  <span className={locale === 'ru' ? '' : 'ml-6'}>Русский</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onLocaleChange('en')}
                  data-testid="header-user-menu-locale-en"
                >
                  {locale === 'en' && <Check className="mr-2 h-4 w-4" />}
                  <span className={locale === 'en' ? '' : 'ml-6'}>English</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
