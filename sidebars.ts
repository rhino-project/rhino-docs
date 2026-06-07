import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  introSidebar: [
    'intro',
  ],
  serverSidebar: [
    {
      type: 'category',
      label: 'Laravel Server',
      collapsed: false,
      items: [
        'server/getting-started',
        'server/models',
        'server/validation',
        'server/querying',
        'server/request-lifecycle',
        'server/policies',
        'server/route-groups',
        'server/nested-operations',
        'server/soft-deletes',
        'server/multi-tenancy',
        'server/audit-trail',
        'server/generator',
        'server/blueprint',
        'server/export-types',
      ],
    },
  ],
  railsSidebar: [
    {
      type: 'category',
      label: 'Rails Server',
      collapsed: false,
      items: [
        'rails/getting-started',
        'rails/models',
        'rails/validation',
        'rails/querying',
        'rails/request-lifecycle',
        'rails/policies',
        'rails/route-groups',
        'rails/nested-operations',
        'rails/soft-deletes',
        'rails/multi-tenancy',
        'rails/audit-trail',
        'rails/generator',
        'rails/blueprint',
        'rails/export-types',
      ],
    },
  ],
  nestjsSidebar: [
    {
      type: 'category',
      label: 'NestJS Server',
      collapsed: false,
      items: [
        'nestjs/getting-started',
        'nestjs/models',
        'nestjs/validation',
        'nestjs/querying',
        'nestjs/request-lifecycle',
        'nestjs/policies',
        'nestjs/route-groups',
        'nestjs/nested-operations',
        'nestjs/soft-deletes',
        'nestjs/multi-tenancy',
        'nestjs/audit-trail',
        'nestjs/invitations',
        'nestjs/postman-export',
        'nestjs/generator',
        'nestjs/blueprint',
        'nestjs/export-types',
      ],
    },
  ],
  reactSidebar: [
    {
      type: 'category',
      label: 'React Client',
      collapsed: false,
      items: [
        'react/getting-started',
        'react/authentication',
        'react/crud-hooks',
        'react/querying',
        'react/soft-deletes',
        'react/nested-operations',
        'react/invitations',
        'react/utilities',
        'react/typescript',
        'react/desktop-electron',
      ],
    },
  ],
};

export default sidebars;
