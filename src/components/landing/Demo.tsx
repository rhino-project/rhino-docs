import React, {useState, type ReactNode} from 'react';
import {Reveal, CodeWindow, Eyebrow, Tabs, Pill, type Tab} from './Primitives';

const FW_TABS: Tab[] = [
  {id: 'laravel', label: 'Laravel'},
  {id: 'rails', label: 'Rails'},
  {id: 'nestjs', label: 'NestJS'},
];

type FwId = 'laravel' | 'rails' | 'nestjs';

const MODEL_FILES: Record<FwId, {file: string; code: ReactNode}> = {
  laravel: {
    file: 'app/Models/Post.php',
    code: (
      <pre style={{margin: 0, fontFamily: 'inherit', color: 'var(--ag-fg)', whiteSpace: 'pre'}}>
        <span className="ag-kw">class</span> <span className="ag-cn">Post</span>{' '}
        <span className="ag-kw">extends</span> <span className="ag-cn">Model</span> {'{'}
        {'\n  '}
        <span className="ag-kw">use</span> <span className="ag-cn">HasRhino</span>,{' '}
        <span className="ag-cn">BelongsToOrganization</span>,{' '}
        <span className="ag-cn">SoftDeletes</span>;{'\n\n'}
        {'  '}
        <span className="ag-kw">protected</span> <span className="ag-var">$fillable</span> = [
        <span className="ag-str">'title'</span>, <span className="ag-str">'body'</span>,{' '}
        <span className="ag-str">'published_at'</span>];{'\n\n'}
        {'  '}
        <span className="ag-kw">public</span> <span className="ag-var">$allowedFilters</span>  = [
        <span className="ag-str">'author_id'</span>, <span className="ag-str">'published'</span>];
        {'\n  '}
        <span className="ag-kw">public</span> <span className="ag-var">$allowedSorts</span>    = [
        <span className="ag-str">'-published_at'</span>, <span className="ag-str">'title'</span>];
        {'\n  '}
        <span className="ag-kw">public</span> <span className="ag-var">$allowedIncludes</span> = [
        <span className="ag-str">'author'</span>, <span className="ag-str">'comments'</span>];
        {'\n\n'}
        {'  '}
        <span className="ag-kw">public</span> <span className="ag-kw">function</span>{' '}
        <span className="ag-fn">validationRules</span>(): <span className="ag-cn">array</span> {'{'}
        {'\n    '}
        <span className="ag-kw">return</span> [<span className="ag-str">'title'</span> =&gt;{' '}
        <span className="ag-str">'required|max:120'</span>,{' '}
        <span className="ag-str">'body'</span> =&gt; <span className="ag-str">'required'</span>];
        {'\n  }\n}'}
      </pre>
    ),
  },
  rails: {
    file: 'app/models/post.rb',
    code: (
      <pre style={{margin: 0, fontFamily: 'inherit', color: 'var(--ag-fg)', whiteSpace: 'pre'}}>
        <span className="ag-kw">class</span> <span className="ag-cn">Post</span>{' '}
        <span className="ag-op">&lt;</span> <span className="ag-cn">ApplicationRecord</span>
        {'\n  '}
        <span className="ag-fn">include</span> <span className="ag-cn">Rhino::Resource</span>
        {'\n  '}
        <span className="ag-fn">include</span>{' '}
        <span className="ag-cn">Rhino::BelongsToOrganization</span>
        {'\n\n'}
        {'  '}
        <span className="ag-kw">allowed_filters</span>  <span className="ag-str">:author_id</span>,{' '}
        <span className="ag-str">:published</span>
        {'\n  '}
        <span className="ag-kw">allowed_sorts</span>    <span className="ag-str">:published_at</span>,{' '}
        <span className="ag-str">:title</span>
        {'\n  '}
        <span className="ag-kw">allowed_includes</span> <span className="ag-str">:author</span>,{' '}
        <span className="ag-str">:comments</span>
        {'\n\n'}
        {'  '}
        <span className="ag-fn">validates</span> <span className="ag-str">:title</span>,{' '}
        <span className="ag-str">presence</span>
        <span className="ag-op">:</span> <span className="ag-kw">true</span>,{' '}
        <span className="ag-str">length</span>
        <span className="ag-op">:</span> {'{'} <span className="ag-str">maximum</span>
        <span className="ag-op">:</span> <span className="ag-num">120</span> {'}'}
        {'\n  '}
        <span className="ag-fn">validates</span> <span className="ag-str">:body</span>,{' '}
        <span className="ag-str">presence</span>
        <span className="ag-op">:</span> <span className="ag-kw">true</span>
        {'\n'}
        <span className="ag-kw">end</span>
      </pre>
    ),
  },
  nestjs: {
    file: 'prisma/schema.prisma',
    code: (
      <pre style={{margin: 0, fontFamily: 'inherit', color: 'var(--ag-fg)', whiteSpace: 'pre'}}>
        <span className="ag-kw">model</span> <span className="ag-cn">Post</span> {'{'}
        {'\n  '}
        <span className="ag-var">id</span>             <span className="ag-cn">String</span>    <span className="ag-op">@id</span> <span className="ag-op">@default</span>(<span className="ag-fn">uuid</span>())
        {'\n  '}
        <span className="ag-var">organizationId</span> <span className="ag-cn">String</span>
        {'\n  '}
        <span className="ag-var">title</span>          <span className="ag-cn">String</span>    <span className="ag-op">@db.VarChar</span>(<span className="ag-num">120</span>)
        {'\n  '}
        <span className="ag-var">body</span>           <span className="ag-cn">String</span>
        {'\n  '}
        <span className="ag-var">publishedAt</span>    <span className="ag-cn">DateTime</span>?
        {'\n  '}
        <span className="ag-var">authorId</span>       <span className="ag-cn">String</span>
        {'\n  '}
        <span className="ag-var">createdAt</span>      <span className="ag-cn">DateTime</span>  <span className="ag-op">@default</span>(<span className="ag-fn">now</span>())
        {'\n  '}
        <span className="ag-var">updatedAt</span>      <span className="ag-cn">DateTime</span>  <span className="ag-op">@updatedAt</span>
        {'\n  '}
        <span className="ag-var">deletedAt</span>      <span className="ag-cn">DateTime</span>?
        {'\n\n  '}
        <span className="ag-var">organization</span>   <span className="ag-cn">Organization</span> <span className="ag-op">@relation</span>(<span className="ag-var">fields</span>: [<span className="ag-var">organizationId</span>], <span className="ag-var">references</span>: [<span className="ag-var">id</span>])
        {'\n  '}
        <span className="ag-var">author</span>         <span className="ag-cn">User</span>         <span className="ag-op">@relation</span>(<span className="ag-var">fields</span>: [<span className="ag-var">authorId</span>], <span className="ag-var">references</span>: [<span className="ag-var">id</span>])
        {'\n  '}
        <span className="ag-var">comments</span>       <span className="ag-cn">Comment</span>[]
        {'\n'}
        {'}'}
      </pre>
    ),
  },
};

const CONFIG_FILES: Record<FwId, {file: string; code: ReactNode}> = {
  laravel: {
    file: 'config/rhino.php',
    code: (
      <pre style={{margin: 0, fontFamily: 'inherit', color: 'var(--ag-fg)', whiteSpace: 'pre'}}>
        <span className="ag-kw">return</span> [{'\n  '}
        <span className="ag-str">'resources'</span> =&gt; [{'\n    '}
        <span className="ag-cn">App\\Models\\Post</span>::<span className="ag-kw">class</span> =&gt;
        [{'\n      '}
        <span className="ag-str">'slug'</span>       =&gt;{' '}
        <span className="ag-str">'posts'</span>,{'\n      '}
        <span className="ag-str">'policy'</span>     =&gt;{' '}
        <span className="ag-cn">App\\Policies\\PostPolicy</span>::
        <span className="ag-kw">class</span>,{'\n      '}
        <span className="ag-str">'middleware'</span> =&gt; [
        <span className="ag-str">'auth:sanctum'</span>],{'\n    '}],{'\n  '}],{'\n'}];
      </pre>
    ),
  },
  rails: {
    file: 'config/initializers/rhino.rb',
    code: (
      <pre style={{margin: 0, fontFamily: 'inherit', color: 'var(--ag-fg)', whiteSpace: 'pre'}}>
        <span className="ag-cn">Rhino</span>.<span className="ag-fn">configure</span>{' '}
        <span className="ag-kw">do</span> <span className="ag-op">|</span>
        <span className="ag-var">c</span>
        <span className="ag-op">|</span>
        {'\n  '}
        <span className="ag-var">c</span>.<span className="ag-fn">resource</span>{' '}
        <span className="ag-cn">Post</span>,{'\n    '}
        <span className="ag-str">slug</span>
        <span className="ag-op">:</span> <span className="ag-str">'posts'</span>,{'\n    '}
        <span className="ag-str">policy</span>
        <span className="ag-op">:</span> <span className="ag-cn">PostPolicy</span>,{'\n    '}
        <span className="ag-str">middleware</span>
        <span className="ag-op">:</span> [<span className="ag-str">:authenticate_user!</span>]
        {'\n'}
        <span className="ag-kw">end</span>
      </pre>
    ),
  },
  nestjs: {
    file: 'src/app.module.ts',
    code: (
      <pre style={{margin: 0, fontFamily: 'inherit', color: 'var(--ag-fg)', whiteSpace: 'pre'}}>
        <span className="ag-kw">import</span> {'{'} <span className="ag-cn">Module</span> {'}'}{' '}
        <span className="ag-kw">from</span>{' '}
        <span className="ag-str">'@nestjs/common'</span>
        {'\n'}
        <span className="ag-kw">import</span> {'{'}{' '}
        <span className="ag-cn">RhinoModule</span> {'}'}{' '}
        <span className="ag-kw">from</span>{' '}
        <span className="ag-str">'@rhino-project/rhino-nestjs'</span>
        {'\n'}
        <span className="ag-kw">import</span> {'{'} <span className="ag-cn">PostPolicy</span> {'}'}{' '}
        <span className="ag-kw">from</span>{' '}
        <span className="ag-str">'./policies/post.policy'</span>
        {'\n'}
        <span className="ag-kw">import</span> {'{'} <span className="ag-cn">PostSchema</span> {'}'}{' '}
        <span className="ag-kw">from</span>{' '}
        <span className="ag-str">'./schemas/post.schema'</span>
        {'\n\n'}
        <span className="ag-op">@</span>
        <span className="ag-fn">Module</span>({'{'}
        {'\n  '}
        <span className="ag-key">imports</span>
        <span className="ag-pun">:</span> [{'\n    '}
        <span className="ag-cn">RhinoModule</span>.<span className="ag-fn">forRoot</span>({'{'}
        {'\n      '}
        <span className="ag-key">resources</span>
        <span className="ag-pun">:</span> {'{'}
        {'\n        '}
        <span className="ag-key">posts</span>
        <span className="ag-pun">:</span> {'{'}
        {'\n          '}
        <span className="ag-key">model</span>
        <span className="ag-pun">:</span> <span className="ag-str">'post'</span>,
        {'\n          '}
        <span className="ag-key">policy</span>
        <span className="ag-pun">:</span> <span className="ag-cn">PostPolicy</span>,
        {'\n          '}
        <span className="ag-key">validation</span>
        <span className="ag-pun">:</span> <span className="ag-cn">PostSchema</span>,
        {'\n          '}
        <span className="ag-key">allowedFilters</span>
        <span className="ag-pun">:</span> [<span className="ag-str">'authorId'</span>,{' '}
        <span className="ag-str">'published'</span>],
        {'\n          '}
        <span className="ag-key">allowedSorts</span>
        <span className="ag-pun">:</span> [<span className="ag-str">'-publishedAt'</span>,{' '}
        <span className="ag-str">'title'</span>],
        {'\n          '}
        <span className="ag-key">belongsToOrganization</span>
        <span className="ag-pun">:</span> <span className="ag-kw">true</span>,
        {'\n          '}
        <span className="ag-key">softDeletes</span>
        <span className="ag-pun">:</span> <span className="ag-kw">true</span>,
        {'\n        '}
        {'}'},{'\n      '}
        {'}'},{'\n    '}
        {'}'}),{'\n  '}],{'\n'}
        {'}'})
        {'\n'}
        <span className="ag-kw">export class</span>{' '}
        <span className="ag-cn">AppModule</span> {'{'}
        {'}'}
      </pre>
    ),
  },
};

const REACT_HOOK = (
  <pre style={{margin: 0, fontFamily: 'inherit', color: 'var(--ag-fg)', whiteSpace: 'pre'}}>
    <span className="ag-kw">import</span> {'{'} <span className="ag-fn">useResource</span> {'}'}{' '}
    <span className="ag-kw">from</span>{' '}
    <span className="ag-str">'@rhino-project/rhino-react'</span>
    {'\n\n'}
    <span className="ag-kw">export function</span> <span className="ag-fn">Feed</span>() {'{'}
    {'\n  '}
    <span className="ag-kw">const</span> {'{'} <span className="ag-var">data</span>,{' '}
    <span className="ag-var">isLoading</span>, <span className="ag-var">create</span> {'}'} ={' '}
    <span className="ag-fn">useResource</span>(<span className="ag-str">'posts'</span>, {'{'}
    {'\n    '}
    <span className="ag-key">filter</span>
    <span className="ag-pun">:</span> {'{'} <span className="ag-key">published</span>
    <span className="ag-pun">:</span> <span className="ag-kw">true</span> {'}'},{'\n    '}
    <span className="ag-key">sort</span>
    <span className="ag-pun">:</span> <span className="ag-str">'-published_at'</span>,{'\n    '}
    <span className="ag-key">include</span>
    <span className="ag-pun">:</span> [<span className="ag-str">'author'</span>],{'\n    '}
    <span className="ag-key">perPage</span>
    <span className="ag-pun">:</span> <span className="ag-num">20</span>,{'\n  '}
    {'}'});{'\n\n'}
    {'  '}
    <span className="ag-kw">if</span> (<span className="ag-var">isLoading</span>){' '}
    <span className="ag-kw">return</span> &lt;<span className="ag-tag">Spinner</span> /&gt;;
    {'\n\n'}
    {'  '}
    <span className="ag-kw">return</span> &lt;<span className="ag-tag">ul</span>&gt;{'{'}
    <span className="ag-var">data</span>.<span className="ag-fn">map</span>(
    <span className="ag-var">p</span> =&gt; &lt;<span className="ag-tag">Post</span>{' '}
    <span className="ag-attr">key</span>={'{'}<span className="ag-var">p</span>.
    <span className="ag-var">id</span>
    {'}'} {'{'}...<span className="ag-var">p</span>
    {'}'} /&gt;){'}'}&lt;/<span className="ag-tag">ul</span>&gt;;
    {'\n}'}
  </pre>
);

const ENDPOINTS: [string, string, string][] = [
  ['GET', '/api/posts', 'list with filters, sorts, includes'],
  ['POST', '/api/posts', 'create with validation'],
  ['GET', '/api/posts/{id}', 'show with relationships'],
  ['PUT', '/api/posts/{id}', 'update with validation'],
  ['DELETE', '/api/posts/{id}', 'soft delete'],
  ['GET', '/api/posts/trashed', 'list soft-deleted'],
  ['POST', '/api/posts/{id}/restore', 'restore'],
  ['DELETE', '/api/posts/{id}/force-delete', 'permanent delete'],
];

export function Demo() {
  const [fw, setFw] = useState<FwId>('laravel');
  const [showClient, setShowClient] = useState(false);

  const model = MODEL_FILES[fw];
  const config = CONFIG_FILES[fw];

  return (
    <section className="ag-section" id="demo">
      <div className="ag-wrap">
        <div style={{textAlign: 'center', marginBottom: 48}}>
          <Reveal>
            <Eyebrow>How it works</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h2 style={{marginTop: 20}}>
              Register a model.<br />
              <span className="ag-accent">Get a full API. Use a hook.</span>
            </h2>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 10,
              marginBottom: 32,
              fontFamily: 'var(--ag-font-mono)',
              fontSize: 12.5,
              color: 'var(--ag-fg-dim)',
              flexWrap: 'wrap',
            }}>
            {['Define your model', 'Register in config', 'Use the hook'].map((s, i) => (
              <React.Fragment key={s}>
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 99,
                      border: '1px solid var(--ag-line-bright)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      color: 'var(--ag-accent)',
                    }}>
                    {i + 1}
                  </span>
                  <span style={{color: 'var(--ag-fg)'}}>{s}</span>
                </span>
                {i < 2 && <span style={{color: 'var(--ag-fg-faint)'}}>———</span>}
              </React.Fragment>
            ))}
          </div>
        </Reveal>

        <Reveal delay={160}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 20,
              gap: 12,
              flexWrap: 'wrap',
            }}>
            <Tabs tabs={FW_TABS} value={fw} onChange={(id) => setFw(id as FwId)} />
            <div className="ag-tabs" style={{padding: 4}}>
              <button
                className={`ag-tab ${!showClient ? 'ag-on' : ''}`}
                onClick={() => setShowClient(false)}>
                Server
              </button>
              <button
                className={`ag-tab ${showClient ? 'ag-on' : ''}`}
                onClick={() => setShowClient(true)}>
                React Client
              </button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          {!showClient ? (
            <div
              className="ag-demo-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
                alignItems: 'stretch',
              }}>
              <CodeWindow title={model.file} glow>
                <div style={{fontSize: 13, minHeight: 260}}>{model.code}</div>
              </CodeWindow>
              <CodeWindow title={config.file} glow>
                <div style={{fontSize: 13, minHeight: 260}}>{config.code}</div>
              </CodeWindow>
            </div>
          ) : (
            <CodeWindow title="app/components/Feed.tsx" glow>
              <div style={{fontSize: 13.5, minHeight: 260}}>{REACT_HOOK}</div>
            </CodeWindow>
          )}
        </Reveal>

        <Reveal delay={240}>
          <div style={{marginTop: 20}}>
            <CodeWindow title="auto-generated endpoints" actions={<Pill accent>instant</Pill>}>
              <div style={{fontSize: 13, lineHeight: 1.9}}>
                {ENDPOINTS.map(([method, path, desc]) => {
                  const methodColor =
                    ({
                      GET: 'oklch(0.82 0.13 210)',
                      POST: 'var(--ag-accent)',
                      PUT: 'oklch(0.85 0.15 80)',
                      DELETE: 'oklch(0.82 0.15 25)',
                    } as Record<string, string>)[method];
                  return (
                    <div
                      key={method + path}
                      style={{display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap'}}>
                      <span
                        style={{
                          color: methodColor,
                          width: 58,
                          display: 'inline-block',
                          fontWeight: 600,
                        }}>
                        {method}
                      </span>
                      <span style={{color: 'var(--ag-fg)'}}>{path}</span>
                      <span
                        className="ag-cm"
                        style={{color: 'var(--ag-fg-faint)', marginLeft: 'auto'}}>
                        # {desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CodeWindow>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
