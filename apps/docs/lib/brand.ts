import brand from "../../../brand/brand.json";

export { brand };

export const installCommand = `curl -fsSL https://${brand.urls.install} | sudo sh`;

/** The app's repo: panel, agent, installer and the releases. Templates are in brand.github.templatesRepo. */
export const githubUrl = `https://github.com/${brand.github.repo}`;
export const releasesUrl = `${githubUrl}/releases`;

/** The docs' file in the website repo. `path` is relative to apps/docs, for example `content/docs/installation.mdx`. */
export function editUrl(path: string): string {
  return `https://github.com/${brand.github.siteRepo}/blob/main/apps/docs/${path}`;
}
