import React, {useState} from 'react';
import {Reveal, CodeWindow, Eyebrow, Tabs, Icon, type Tab} from './Primitives';

type Token = string | [string, string];
type Line = Token[];

function renderTokens(lines: Line[]) {
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {line.map((tok, j) => {
        if (typeof tok === 'string') return tok;
        const [text, cls] = tok;
        return (
          <span key={j} className={cls}>
            {text}
          </span>
        );
      })}
      {i < lines.length - 1 ? '\n' : ''}
    </React.Fragment>
  ));
}

const K = (t: string): [string, string] => [t, 'ag-kw'];
const C = (t: string): [string, string] => [t, 'ag-cn'];
const F = (t: string): [string, string] => [t, 'ag-fn'];
const V = (t: string): [string, string] => [t, 'ag-var'];
const S = (t: string): [string, string] => [t, 'ag-str'];
const N = (t: string): [string, string] => [t, 'ag-num'];
const M = (t: string): [string, string] => [t, 'ag-cm'];
const P = (t: string): [string, string] => [t, 'ag-pun'];
const KY = (t: string): [string, string] => [t, 'ag-key'];

const BP_TABS: (Tab & {file: string})[] = [
  {id: 'policy', label: 'Policy', file: 'app/Policies/ContractPolicy.php'},
  {id: 'model', label: 'Model', file: 'app/Models/Contract.php'},
  {id: 'migration', label: 'Migration', file: 'database/migrations/2026_04_21_create_contracts_table.php'},
  {id: 'tests', label: 'Tests', file: 'tests/Feature/ContractTest.php'},
];

const BP_CODE: Record<string, Line[]> = {
  policy: [
    [K('class'), ' ', C('ContractPolicy'), ' ', K('extends'), ' ', C('ResourcePolicy'), ' {'],
    ['  ', K('public'), ' ', K('function'), ' ', F('permittedAttributesForShow'), '(', C('User'), ' ', V('$user'), '): ', C('array')],
    ['  {'],
    ['    ', K('return match'), ' (', V('$user'), '->', F('roleFor'), '(', V('$this'), '->org)) {'],
    ['      ', S("'admin'"), '  => [', S("'*'"), '],'],
    ['      ', S("'viewer'"), ' => [', S("'id'"), ', ', S("'title'"), ', ', S("'status'"), '],'],
    ['      ', K('default'), '  => [],'],
    ['    };'],
    ['  }'],
    [''],
    ['  ', K('public'), ' ', K('function'), ' ', F('permittedAttributesForUpdate'), '(', C('User'), ' ', V('$user'), '): ', C('array')],
    ['  {'],
    ['    ', K('return match'), ' (', V('$user'), '->', F('roleFor'), '(', V('$this'), '->org)) {'],
    ['      ', S("'admin'"), ' => [', S("'title'"), ', ', S("'status'"), '],'],
    ['      ', K('default'), ' => [],'],
    ['    };'],
    ['  }'],
    ['}'],
  ],
  model: [
    [K('class'), ' ', C('Contract'), ' ', K('extends'), ' ', C('Model'), ' {'],
    ['  ', K('use'), ' ', C('HasRhino'), ', ', C('BelongsToOrganization'), ', ', C('HasUuid'), ', ', C('SoftDeletes'), ';'],
    [''],
    ['  ', K('protected'), ' ', V('$fillable'), ' = [', S("'title'"), ', ', S("'total_value'"), ', ', S("'status'"), '];'],
    [''],
    ['  ', K('public'), ' ', V('$allowedFilters'), '  = [', S("'status'"), ', ', S("'owner_id'"), '];'],
    ['  ', K('public'), ' ', V('$allowedSorts'), '    = [', S("'created_at'"), ', ', S("'total_value'"), '];'],
    ['  ', K('public'), ' ', V('$allowedIncludes'), ' = [', S("'owner'"), ', ', S("'lineItems'"), '];'],
    ['  ', K('public'), ' ', V('$allowedSearch'), '   = [', S("'title'"), '];'],
    [''],
    ['  ', K('public'), ' ', K('function'), ' ', F('validationRules'), '(): ', C('array'), ' {'],
    ['    ', K('return'), ' ['],
    ['      ', S("'title'"), '       => [', S("'required'"), ', ', S("'string'"), ', ', S("'max:140'"), '],'],
    ['      ', S("'total_value'"), ' => [', S("'numeric'"), ', ', S("'min:0'"), '],'],
    ['      ', S("'status'"), '      => [', S("'in:draft,signed,void'"), '],'],
    ['    ];'],
    ['  }'],
    ['}'],
  ],
  migration: [
    [C('Schema'), '::', F('create'), '(', S("'contracts'"), ', ', K('function'), ' (', C('Blueprint'), ' ', V('$t'), ') {'],
    ['  ', V('$t'), '->', F('uuid'), '(', S("'id'"), ')->', F('primary'), '();'],
    ['  ', V('$t'), '->', F('foreignUuid'), '(', S("'organization_id'"), ')->', F('constrained'), '();'],
    ['  ', V('$t'), '->', F('string'), '(', S("'title'"), ', ', N('140'), ');'],
    ['  ', V('$t'), '->', F('decimal'), '(', S("'total_value'"), ', ', N('12'), ', ', N('2'), ')->', F('default'), '(', N('0'), ');'],
    ['  ', V('$t'), '->', F('enum'), '(', S("'status'"), ', [', S("'draft'"), ', ', S("'signed'"), ', ', S("'void'"), '])'],
    ['    ->', F('default'), '(', S("'draft'"), ');'],
    ['  ', V('$t'), '->', F('timestamps'), '();'],
    ['  ', V('$t'), '->', F('softDeletes'), '();'],
    ['  ', V('$t'), '->', F('index'), '([', S("'organization_id'"), ', ', S("'status'"), ']);'],
    ['});'],
  ],
  tests: [
    [M('// Auto-generated — covers the permission matrix')],
    [F('it'), '(', S("'shows only permitted fields for viewer'"), ', ', K('function'), ' () {'],
    ['  ', V('$viewer'), ' = ', F('userWithRole'), '(', S("'viewer'"), ');'],
    ['  ', V('$r'), ' = ', F('actingAs'), '(', V('$viewer'), ')'],
    ['      ->', F('getJson'), '(', S("'/api/acme/contracts/'"), ' . ', V('$c'), '->id);'],
    [''],
    ['  ', F('expect'), '(', V('$r'), '->', F('json'), '())->', F('toHaveKeys'), '([', S("'id'"), ', ', S("'title'"), ', ', S("'status'"), ']);'],
    ['  ', F('expect'), '(', V('$r'), '->', F('json'), '())->', K('not'), '->', F('toHaveKey'), '(', S("'total_value'"), ');'],
    ['});'],
    [''],
    [F('it'), '(', S("'returns 403 when viewer tries to update'"), ', ', K('function'), ' () {'],
    ['  ', F('actingAs'), '(', F('userWithRole'), '(', S("'viewer'"), '))'],
    ['    ->', F('patchJson'), '(', S("'/api/acme/contracts/'"), ' . ', V('$c'), '->id, [', S("'title'"), ' => ', S("'x'"), '])'],
    ['    ->', F('assertForbidden'), '();'],
    ['});'],
  ],
};

const BP_YAML: Line[] = [
  [M('# Source of truth')],
  [KY('model'), P(':'), ' ', S('Contract')],
  [KY('traits'), P(':'), ' ', S('[uuid, soft_deletes, org]')],
  [''],
  [KY('columns'), P(':')],
  ['  ', P('-'), ' ', KY('title'), P(':'), '       ', K('string(140)')],
  ['  ', P('-'), ' ', KY('total_value'), P(':'), ' ', K('decimal(12,2)')],
  ['  ', P('-'), ' ', KY('status'), P(':'), '      ', K('enum(draft,signed,void)')],
  [''],
  [KY('permissions'), P(':')],
  ['  ', KY('admin'), P(':')],
  ['    ', KY('create'), P(':'), ' ', S('*')],
  ['    ', KY('update'), P(':'), ' ', S('[title, status]')],
  ['    ', KY('show'), P(':'), '   ', S('*')],
  ['  ', KY('viewer'), P(':')],
  ['    ', KY('show'), P(':'), '   ', S('[id, title, status]')],
  [''],
  [KY('query'), P(':')],
  ['  ', KY('filters'), P(':'), ' ', S('[status, owner_id]')],
  ['  ', KY('sorts'), P(':'), '   ', S('[created_at, total_value]')],
  ['  ', KY('search'), P(':'), '  ', S('[title]')],
];

export function Blueprint() {
  const [tab, setTab] = useState<string>('policy');
  const current = BP_TABS.find((t) => t.id === tab)!;

  return (
    <section className="ag-section" id="blueprint">
      <div className="ag-wrap">
        <div style={{textAlign: 'center', marginBottom: 56}}>
          <Reveal>
            <Eyebrow>Zero-Token Generation</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 style={{marginTop: 20, maxWidth: 760, marginInline: 'auto'}}>
              From YAML to production code.<br />
              <span className="ag-accent">Fully deterministic.</span>
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p
              style={{
                fontSize: 16.5,
                color: 'var(--ag-fg-muted)',
                maxWidth: 560,
                margin: '20px auto 0',
                textWrap: 'pretty' as React.CSSProperties['textWrap'],
              }}>
              Define the permission matrix once. Generate policies, migrations, tests, and seeders —
              no AI in the loop.
            </p>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <div
            className="ag-blueprint-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 0.9fr) 72px minmax(0, 1.25fr)',
              gap: 24,
              alignItems: 'stretch',
            }}>
            <CodeWindow title=".rhino/blueprints/contracts.yaml">
              <pre
                style={{
                  margin: 0,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  whiteSpace: 'pre',
                  color: 'var(--ag-fg)',
                }}>
                {renderTokens(BP_YAML)}
              </pre>
            </CodeWindow>

            <div
              className="ag-blueprint-pipe"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
              }}>
              <div
                style={{
                  fontFamily: 'var(--ag-font-mono)',
                  fontSize: 10,
                  color: 'var(--ag-fg-dim)',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  whiteSpace: 'nowrap',
                }}>
                rhino:blueprint
              </div>
              <div
                style={{
                  width: 2,
                  flex: 1,
                  minHeight: 120,
                  background: 'linear-gradient(180deg, transparent, var(--ag-accent), transparent)',
                  boxShadow: '0 0 12px var(--ag-accent-glow)',
                }}
              />
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 99,
                  background: 'var(--ag-accent)',
                  color: 'var(--ag-accent-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 24px var(--ag-accent-glow)',
                }}>
                <Icon.arrow />
              </div>
              <div
                style={{
                  width: 2,
                  flex: 1,
                  minHeight: 120,
                  background: 'linear-gradient(180deg, var(--ag-accent), transparent)',
                  boxShadow: '0 0 12px var(--ag-accent-glow)',
                }}
              />
            </div>

            <CodeWindow
              title={current.file}
              glow
              actions={
                <Tabs
                  tabs={BP_TABS.map((t) => ({id: t.id, label: t.label}))}
                  value={tab}
                  onChange={setTab}
                  size="sm"
                />
              }>
              <pre
                style={{
                  margin: 0,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  minHeight: 360,
                  whiteSpace: 'pre',
                  color: 'var(--ag-fg)',
                }}>
                {renderTokens(BP_CODE[tab])}
              </pre>
            </CodeWindow>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div
            className="ag-bp-metrics"
            style={{
              marginTop: 48,
              padding: '28px 32px',
              border: '1px solid var(--ag-line)',
              borderRadius: 14,
              background: 'linear-gradient(180deg, var(--ag-bg-1), var(--ag-bg-0))',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 32,
            }}>
            {(
              [
                ['0', 'AI tokens used', 'fully deterministic'],
                ['6', 'Files generated', 'model • migration • factory • policy • tests • seeder'],
                ['28', 'Built-in features', 'CRUD • auth • policies • multi-tenancy'],
                ['3', 'Frameworks', 'Laravel • Rails • NestJS'],
              ] as const
            ).map(([n, l, s]) => (
              <div key={l}>
                <div
                  style={{
                    fontFamily: 'var(--ag-font-display)',
                    fontSize: 40,
                    fontWeight: 500,
                    letterSpacing: '-0.03em',
                    color: 'var(--ag-accent)',
                    lineHeight: 1,
                  }}>
                  {n}
                </div>
                <div style={{marginTop: 10, fontSize: 14, color: 'var(--ag-fg)'}}>{l}</div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 12,
                    color: 'var(--ag-fg-dim)',
                    fontFamily: 'var(--ag-font-mono)',
                  }}>
                  {s}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
