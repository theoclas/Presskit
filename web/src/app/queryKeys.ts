export const qk = {
  publicDjs: ['public', 'djs'] as const,
  publicDj: (slug: string) => ['public', 'dj', slug] as const,
};
