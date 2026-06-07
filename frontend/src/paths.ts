export const paths = {
  home: '/',
  auth: { signIn: '/auth/sign-in', signUp: '/auth/sign-up', resetPassword: '/auth/reset-password' },
  dashboard: {
    overview: '/dashboard',
    scan: '/dashboard/scan',
    systems: '/dashboard/systems',
    definitions: '/dashboard/definitions',
    modules: '/dashboard/modules',
    account: '/dashboard/account',
    settings: '/dashboard/settings',
  },
  errors: { notFound: '/errors/not-found' },
} as const;
