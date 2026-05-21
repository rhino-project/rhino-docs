import React, {useEffect, type ReactNode} from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import {Nav} from '../components/landing/Nav';
import {Hero} from '../components/landing/Hero';
import {AIChat} from '../components/landing/AIChat';
import {Blueprint} from '../components/landing/Blueprint';
import {Features} from '../components/landing/Features';
import {Demo} from '../components/landing/Demo';
import {CTA} from '../components/landing/CTA';
import './landing.css';

export default function Home(): ReactNode {
  // Smooth scroll for in-page anchors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const a = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute('href')?.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({behavior: 'smooth', block: 'start'});
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <Layout
      title="The right way AI agents write code"
      description="Rhino — automatic REST APIs with built-in security, permissions, and multi-tenancy. For Laravel, Rails, and NestJS.">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;550;600;700&family=Geist+Mono:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </Head>
      <div className="ag-landing">
        <Nav />
        <main>
          <Hero />
          <AIChat />
          <Blueprint />
          <Features />
          <Demo />
          <CTA />
        </main>
      </div>
    </Layout>
  );
}
