import landingPackage from '../../package.json';

export const LANDING_VERSION = landingPackage.version;
export const GITHUB_REPO_URL = 'https://github.com/Shironex/kirei-manga';
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_RELEASES_LATEST_URL = `${GITHUB_RELEASES_URL}/latest`;

export const SISTER_APPS = [
  {
    kanji: '白アニ',
    name: 'ShiroAni',
    description: 'Anime tracker',
    href: 'https://shiroani.app/',
  },
  {
    kanji: '白波',
    name: 'Shiranami',
    description: 'Music sanctuary',
    href: 'https://shiranami.app/',
  },
] as const;
