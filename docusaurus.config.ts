import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Rhino',
  tagline: 'The right way AI agents write code. Automatic REST APIs for Laravel, Rails & NestJS.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: process.env.SITE_URL ?? 'https://rhino-project.org',
  baseUrl: process.env.BASE_URL ?? '/',

  organizationName: 'rhino-project',
  projectName: 'rhino-docs',

  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        docsRouteBasePath: '/',
        indexBlog: false,
      },
    ],
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/rhino-project/rhino-docs/tree/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/rhino-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Rhino',
      items: [
        {
          type: 'custom-frameworkDropdown',
          position: 'left',
        },
        {
          type: 'custom-aiDownload',
          position: 'right',
        },
        {
          href: 'https://github.com/rhino-project/rhino-laravel',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Servers',
          items: [
            { label: 'Laravel Server', to: '/server/getting-started' },
            { label: 'Rails Server', to: '/rails/getting-started' },
            { label: 'NestJS Server', to: '/nestjs/getting-started' },
          ],
        },
        {
          title: 'Clients',
          items: [
            { label: 'React Client', to: '/react/getting-started' },
            { label: 'React Native', to: '/react-native/getting-started' },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/rhino-project/rhino-laravel',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Startsoft. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['php', 'ruby', 'bash', 'json', 'typescript', 'python'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
