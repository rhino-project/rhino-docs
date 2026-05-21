import React from 'react';
import Layout from '@theme-original/DocItem/Layout';
import type LayoutType from '@theme/DocItem/Layout';
import type { WrapperProps } from '@docusaurus/types';
import AskAI from '@site/src/components/AskAI';

type Props = WrapperProps<typeof LayoutType>;

export default function LayoutWrapper(props: Props): React.ReactNode {
  return (
    <>
      <Layout {...props} />
      <AskAI />
    </>
  );
}
