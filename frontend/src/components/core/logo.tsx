'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ShieldCheckIcon } from '@phosphor-icons/react/dist/ssr/ShieldCheck';

import { NoSsr } from '@/components/core/no-ssr';

const HEIGHT = 40;
const WIDTH = 160;

type Color = 'dark' | 'light';

export interface LogoProps {
  color?: Color;
  emblem?: boolean;
  height?: number;
  width?: number;
}

// Panoptes wordmark: a shield mark + the product name. Replaces the template's
// image-based logo so no external brand assets are required.
export function Logo({ color = 'dark', emblem, height = HEIGHT }: LogoProps): React.JSX.Element {
  const fg = color === 'light' ? '#ffffff' : '#0b1120';
  const accent = '#2563eb';

  if (emblem) {
    return <ShieldCheckIcon color={accent} size={height} weight="fill" />;
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <ShieldCheckIcon color={accent} size={height} weight="fill" />
      <Typography component="span" sx={{ color: fg, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }} variant="h5">
        Pan<span style={{ color: accent }}>optes</span>
      </Typography>
    </Stack>
  );
}

export interface DynamicLogoProps {
  colorDark?: Color;
  colorLight?: Color;
  emblem?: boolean;
  height?: number;
  width?: number;
}

export function DynamicLogo({
  colorLight = 'dark',
  height = HEIGHT,
  width = WIDTH,
  ...props
}: DynamicLogoProps): React.JSX.Element {
  return (
    <NoSsr fallback={<Box sx={{ height: `${height}px`, width: `${width}px` }} />}>
      <Logo color={colorLight} height={height} {...props} />
    </NoSsr>
  );
}
