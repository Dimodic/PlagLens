/**
 * Breadcrumbs — historically rendered "Главная / Админ / system / Настройки".
 *
 * After the redesign, the Topbar shows the current section title and the
 * PageContainer renders the page heading; a third stacked breadcrumb row
 * was visual clutter and frequently mixed locales (literal slugs leaking
 * through, e.g. "system"). It's now a no-op so the dozens of existing
 * `<Breadcrumbs />` call-sites keep compiling without forcing every page
 * to be rewritten.
 */
interface Crumb {
  label: string;
  to?: string;
}

interface BreadcrumbsProps {
  items?: Crumb[];
}

 
export function Breadcrumbs(_props: BreadcrumbsProps) {
  return null;
}
