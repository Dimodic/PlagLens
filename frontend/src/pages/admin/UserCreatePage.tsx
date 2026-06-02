/**
 * /admin/users/new — single user create + bulk invite tab.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useNotifications } from '@/hooks/useNotifications';
import { useBulkInviteUsers, useCreateUser } from '@/hooks/api/useUsers';
import type { GlobalRole, Problem } from '@/api/types';

export function UserCreatePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('user_create.title'));
  const navigate = useNavigate();
  const notify = useNotifications();
  const create = useCreateUser();
  const bulk = useBulkInviteUsers();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<GlobalRole>('student');
  const [locale, setLocale] = useState('ru');
  const [singleProblem, setSingleProblem] = useState<Problem | null>(null);

  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkRole, setBulkRole] = useState<GlobalRole>('student');
  const [bulkProblem, setBulkProblem] = useState<Problem | null>(null);

  const handleSingle = async () => {
    setSingleProblem(null);
    try {
      const r = await create.mutateAsync({
        email: email.trim(),
        display_name: name.trim(),
        global_role: role,
        locale,
      });
      notify.success(t('user_create.created', { email: r.email }));
      navigate(`/admin/users/${r.id}`);
    } catch (e) {
      setSingleProblem(e as Problem);
    }
  };

  const handleBulk = async () => {
    setBulkProblem(null);
    const emails = bulkEmails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setBulkProblem({
        title: t('user_create.no_emails'),
        status: 400,
        code: 'NO_EMAILS',
      });
      return;
    }
    try {
      const r = await bulk.mutateAsync({ emails, global_role: bulkRole });
      notify.success(
        t('user_create.bulk_done', { invited: r.invited, skipped: r.skipped }),
      );
      setBulkEmails('');
    } catch (e) {
      setBulkProblem(e as Problem);
    }
  };

  void navigate;
  return (
    <Page width="narrow">
      <Link
        to="/admin/users"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t('user_create.back')}
      </Link>
      <PageHeader title={t('user_create.title')} />

      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single" data-testid="user-create-tab-single">
            {t('user_create.tab_single')}
          </TabsTrigger>
          <TabsTrigger value="bulk" data-testid="user-create-tab-bulk">
            {t('user_create.tab_bulk')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="pt-4 space-y-4">
          {singleProblem && <ProblemAlert problem={singleProblem} />}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                data-testid="user-create-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-name">{t('user_create.name')}</Label>
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                data-testid="user-create-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">{t('user_create.role')}</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole((v as GlobalRole) ?? 'student')}
              >
                <SelectTrigger id="user-role" data-testid="user-create-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">student</SelectItem>
                  <SelectItem value="teacher">teacher</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-locale">Locale</Label>
              <Select value={locale} onValueChange={(v) => setLocale(v ?? 'ru')}>
                <SelectTrigger id="user-locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">ru</SelectItem>
                  <SelectItem value="en">en</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2">
              <Button
                onClick={handleSingle}
                disabled={create.isPending}
                data-testid="user-create-submit"
              >
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.create')}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="pt-4 space-y-4">
          {bulkProblem && <ProblemAlert problem={bulkProblem} />}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-emails">Emails</Label>
              <Textarea
                id="bulk-emails"
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.currentTarget.value)}
                rows={6}
                data-testid="user-bulk-emails"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-role">{t('user_create.role')}</Label>
              <Select
                value={bulkRole}
                onValueChange={(v) => setBulkRole((v as GlobalRole) ?? 'student')}
              >
                <SelectTrigger id="bulk-role" data-testid="user-bulk-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">student</SelectItem>
                  <SelectItem value="teacher">teacher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2">
              <Button
                onClick={handleBulk}
                disabled={bulk.isPending}
                data-testid="user-bulk-submit"
              >
                {bulk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('user_create.invite')}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default UserCreatePage;
