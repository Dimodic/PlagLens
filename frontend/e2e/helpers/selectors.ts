/**
 * Standard data-testid identifiers used across PlagLens pages.
 *
 * Convention:
 *   - kebab-case
 *   - prefix with domain when ambiguous: "login-email", "register-submit"
 *   - generic primitives: nav-*, header-*, table-row, modal-*
 *   - parametric helpers below for collections
 *
 * Other agents writing domain tests should add new test-ids here, not redefine
 * them locally. If the React component is missing the test-id — add it.
 */

export const TEST_IDS = {
  // ---------- Auth: login ----------
  loginEmail: 'login-email',
  loginPassword: 'login-password',
  loginTenantSlug: 'login-tenant-slug',
  loginTotpCode: 'login-totp-code',
  loginSubmit: 'login-submit',
  loginOauthGoogle: 'login-oauth-google',
  loginOauthYandex: 'login-oauth-yandex',
  loginOauthStepik: 'login-oauth-stepik',
  loginOauthGithub: 'login-oauth-github',
  loginForgotLink: 'login-forgot-link',
  loginRegisterLink: 'login-register-link',
  loginDemoLink: 'login-demo-link',

  // ---------- Auth: register ----------
  registerEmail: 'register-email',
  registerPassword: 'register-password',
  registerDisplayName: 'register-display-name',
  registerTenantSlug: 'register-tenant-slug',
  registerInvitationToken: 'register-invitation-token',
  registerSubmit: 'register-submit',
  registerSuccess: 'register-success',

  // ---------- Auth: forgot/reset ----------
  forgotEmail: 'forgot-email',
  forgotTenantSlug: 'forgot-tenant-slug',
  forgotSubmit: 'forgot-submit',
  forgotSuccess: 'forgot-success',
  resetNewPassword: 'reset-new-password',
  resetConfirmPassword: 'reset-confirm-password',
  resetSubmit: 'reset-submit',

  // ---------- Auth: verify email / OAuth callback ----------
  verifyStateOk: 'verify-state-ok',
  verifyStateError: 'verify-state-error',
  oauthCallbackLoading: 'oauth-callback-loading',

  // ---------- Auth: 2FA ----------
  twofaSecret: 'twofa-secret',
  twofaQr: 'twofa-qr',
  twofaTotpInput: 'twofa-totp-input',
  twofaEnableSubmit: 'twofa-enable-submit',
  twofaBackupCodes: 'twofa-backup-codes',

  // ---------- Auth: demo ----------
  demoCard: (role: string) => `demo-card-${role}`,
  demoLoginButton: (role: string) => `demo-login-${role}`,

  // ---------- Header / navbar / shell ----------
  headerBrand: 'header-brand',
  headerUserMenuTrigger: 'header-user-menu-trigger',
  headerUserMenuLogout: 'header-user-menu-logout',
  headerUserMenuProfile: 'header-user-menu-profile',
  headerUserMenuSettings: 'header-user-menu-settings',
  headerThemeToggle: 'header-theme-toggle',
  navItem: (slug: string) => `nav-item-${slug}`,

  // ---------- External bindings ----------
  bindingsAddSystem: 'bindings-add-system',
  bindingsAddExternalId: 'bindings-add-external-id',
  bindingsAddDisplayName: 'bindings-add-display-name',
  bindingsAddSubmit: 'bindings-add-submit',
  bindingsRow: (id: string) => `binding-row-${id}`,
  bindingsRemove: (id: string) => `binding-remove-${id}`,

  // ---------- Generic primitives (used everywhere) ----------
  problemAlert: 'problem-alert',
  toastSuccess: 'toast-success',
  toastError: 'toast-error',
  modalConfirm: 'modal-confirm',
  modalCancel: 'modal-cancel',

  // ---------- Courses domain ----------
  // List page
  coursesListTitle: 'courses-list-title',
  coursesListCreateButton: 'courses-list-create-button',
  coursesListSearchInput: 'courses-list-search',
  coursesListStatusFilter: 'courses-list-status-filter',
  coursesListEmpty: 'courses-list-empty',
  coursesListJoinByCodeButton: 'courses-list-join-button',
  coursesListRow: (slug: string) => `courses-list-row-${slug}`,
  // Card
  courseCard: 'course-card',
  courseCardName: 'course-card-name',
  courseCardSlug: 'course-card-slug',
  courseCardStatus: 'course-card-status',
  // Create page
  courseCreateForm: 'course-create-form',
  courseCreateName: 'course-create-name',
  courseCreateSlug: 'course-create-slug',
  courseCreateDescription: 'course-create-description',
  courseCreateStartDate: 'course-create-start-date',
  courseCreateEndDate: 'course-create-end-date',
  courseCreateSubmit: 'course-create-submit',
  courseCreateCancel: 'course-create-cancel',
  // Detail page
  courseDetailHeader: 'course-detail-header',
  courseDetailTitle: 'course-detail-title',
  courseDetailStatus: 'course-detail-status',
  courseDetailSlug: 'course-detail-slug',
  courseDetailSettingsButton: 'course-detail-settings-button',
  courseDetailMenu: 'course-detail-menu',
  courseDetailMenuTrigger: 'course-detail-menu-trigger',
  courseDetailDuplicate: 'course-detail-duplicate',
  courseDetailArchive: 'course-detail-archive',
  courseDetailUnarchive: 'course-detail-unarchive',
  courseDetailTabAssignments: 'course-detail-tab-assignments',
  courseDetailTabMembers: 'course-detail-tab-members',
  courseDetailTabGroups: 'course-detail-tab-groups',
  courseDetailTabInvitations: 'course-detail-tab-invitations',
  courseDetailTabStats: 'course-detail-tab-stats',
  courseDetailCreateAssignment: 'course-detail-create-assignment',
  // Settings page
  courseSettingsForm: 'course-settings-form',
  courseSettingsName: 'course-settings-name',
  courseSettingsCorsOrigins: 'course-settings-cors-origins',
  courseSettingsSubmit: 'course-settings-submit',
  courseSettingsCancel: 'course-settings-cancel',
  // Members page
  courseMembersTitle: 'course-members-title',
  courseMembersAddButton: 'course-members-add-button',
  courseMembersBulkButton: 'course-members-bulk-button',
  courseMembersAddUserId: 'course-members-add-user-id',
  courseMembersAddRole: 'course-members-add-role',
  courseMembersAddSubmit: 'course-members-add-submit',
  courseMembersBulkEmails: 'course-members-bulk-emails',
  courseMembersBulkRole: 'course-members-bulk-role',
  courseMembersBulkSubmit: 'course-members-bulk-submit',
  courseMemberRow: (userId: string) => `member-row-${userId}`,
  // Groups page
  courseGroupsTitle: 'course-groups-title',
  courseGroupsCreateButton: 'course-groups-create-button',
  courseGroupsName: 'course-groups-name',
  courseGroupsCapacity: 'course-groups-capacity',
  courseGroupsSubmit: 'course-groups-submit',
  courseGroupRow: (id: string) => `group-${id}`,
  // Invitations page
  courseInvitationsTitle: 'course-invitations-title',
  courseInvitationsCreateButton: 'course-invitations-create-button',
  courseInvitationsRoleSelect: 'course-invitations-role',
  courseInvitationsEmail: 'course-invitations-email',
  courseInvitationsMaxUses: 'course-invitations-max-uses',
  courseInvitationsExpires: 'course-invitations-expires',
  courseInvitationsSubmit: 'course-invitations-submit',
  courseInvitationRow: (id: string) => `invitation-${id}`,
  courseInvitationCopy: (id: string) => `invitation-copy-${id}`,
  courseInvitationDelete: (id: string) => `invitation-delete-${id}`,
  // Join page
  joinCodeInput: 'join-code-input',
  joinSubmit: 'join-submit',
  // Stats page
  courseStatsTitle: 'course-stats-title',
} as const;

export type TestIds = typeof TEST_IDS;
