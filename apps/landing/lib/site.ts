import brand from "../../../brand/brand.json";

export { brand };

// https:// spelled out: curl without a scheme fetches over plain HTTP, and this is piped to a shell.
// The installer runs as root, so sudo is part of the command people copy.
export const installCommand = `curl -fsSL https://${brand.urls.install} | sudo sh`;

export const links = {
  github: `https://github.com/${brand.github.repo}`,
  docs: brand.urls.docs,
  install: `${brand.urls.docs}/installation`,
  features: `${brand.urls.docs}/features/zero-downtime-deploys`,
  apiReference: `${brand.urls.docs}/api-reference`,
  changelog: `https://github.com/${brand.github.repo}/releases`,
};
