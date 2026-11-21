import type { Site } from './api';

export function siteIconSrc(
  site: Pick<Site, 'id' | 'iconUrl' | 'updatedAt'> | null | undefined,
): string {
  if (!site?.iconUrl) return '';
  if (/^https?:\/\//i.test(site.iconUrl)) return site.iconUrl;
  const version = site.updatedAt ? `?v=${encodeURIComponent(site.updatedAt)}` : '';
  return `/api/v1/sites/${site.id}/icon${version}`;
}
